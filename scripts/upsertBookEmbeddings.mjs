import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const EMBEDDING_DIM = Number(process.env.EMBEDDING_DIM || 1536);
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'deterministic-hash-v1';
const BATCH_SIZE = Number(process.env.EMBEDDINGS_BATCH_SIZE || 200);
const PROGRESS_EVERY = Number(process.env.EMBEDDINGS_PROGRESS_EVERY || 1000);
const BOOK_EMBEDDING_LIMIT = Number(process.env.BOOK_EMBEDDING_LIMIT || 15000);
const BOOK_MIN_RATINGS = Number(process.env.BOOK_MIN_RATINGS || 2);
const PRUNE_OLD_BOOK_EMBEDDINGS =
  (process.env.PRUNE_OLD_BOOK_EMBEDDINGS || 'true').toLowerCase() === 'true';

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function next() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(seed) {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeVector(vec) {
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) {
    sumSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(sumSq) || 1;
  for (let i = 0; i < vec.length; i++) {
    vec[i] = vec[i] / norm;
  }
  return vec;
}

function toVectorLiteral(vec) {
  return `[${vec.join(',')}]`;
}

function validateEmbedding(embedding) {
  if (!Array.isArray(embedding)) {
    throw new Error('Embedding invalido: esperado array.');
  }
  if (embedding.length !== EMBEDDING_DIM) {
    throw new Error(
      `Embedding invalido: esperado ${EMBEDDING_DIM}, recebido ${embedding.length}.`
    );
  }
  for (let i = 0; i < embedding.length; i++) {
    const v = embedding[i];
    if (!Number.isFinite(v)) {
      throw new Error(`Embedding invalido: valor nao finito no indice ${i}.`);
    }
  }
}

function buildBookEmbedding({ isbn, book_title, book_author, publisher }) {
  const base = `${isbn ?? ''}|${book_title ?? ''}|${book_author ?? ''}|${publisher ?? ''}`;
  const seedFactory = xmur3(base);
  const rand = mulberry32(seedFactory());
  const vec = new Array(EMBEDDING_DIM);

  for (let i = 0; i < EMBEDDING_DIM; i++) {
    // Range [-1, 1], deterministic per book string.
    vec[i] = rand() * 2 - 1;
  }

  return normalizeVector(vec);
}

function buildValuePlaceholders(rowCount, colCount) {
  const groups = [];
  for (let i = 0; i < rowCount; i++) {
    const cols = [];
    const offset = i * colCount;
    for (let j = 1; j <= colCount; j++) {
      cols.push(`$${offset + j}`);
    }
    groups.push(`(${cols.join(', ')})`);
  }
  return groups.join(', ');
}

async function fetchBooks(client) {
  const result = await client.query(
    `
    with book_activity as (
      select r.isbn, count(*)::int as rating_count
      from ratings r
      group by r.isbn
    )
    select
      b.isbn,
      b.book_title,
      b.book_author,
      b.publisher,
      coalesce(ba.rating_count, 0)::int as rating_count
    from books b
    left join book_activity ba on ba.isbn = b.isbn
    where b.isbn is not null
      and coalesce(ba.rating_count, 0) >= $1
    order by coalesce(ba.rating_count, 0) desc, b.isbn
    limit $2
  `,
    [BOOK_MIN_RATINGS, BOOK_EMBEDDING_LIMIT]
  );
  return result.rows;
}

async function flushBatch(client, rows) {
  if (rows.length === 0) return 0;

  const text = `
    insert into book_embeddings (
      isbn, embedding_model, embedding_dim, embedding, updated_at
    )
    values ${buildValuePlaceholders(rows.length, 5)}
    on conflict (isbn) do update
    set embedding_model = excluded.embedding_model,
        embedding_dim = excluded.embedding_dim,
        embedding = excluded.embedding,
        updated_at = now()
  `;

  const values = rows.flatMap((r) => [
    r.isbn,
    EMBEDDING_MODEL,
    EMBEDDING_DIM,
    r.embeddingLiteral,
    new Date().toISOString()
  ]);

  const res = await client.query(text, values);
  return res.rowCount ?? rows.length;
}

async function main() {
  const client = await pool.connect();
  try {
    console.time('book_embeddings_total');

    const books = await fetchBooks(client);
    console.log(`[book_embeddings] livros selecionados: ${books.length}`);
    console.log(
      `[book_embeddings] modelo=${EMBEDDING_MODEL} dim=${EMBEDDING_DIM} batch=${BATCH_SIZE} limit=${BOOK_EMBEDDING_LIMIT} min_ratings=${BOOK_MIN_RATINGS}`
    );

    let processed = 0;
    let upserted = 0;
    const batch = [];

    await client.query('begin');
    for (const book of books) {
      const embedding = buildBookEmbedding(book);
      validateEmbedding(embedding);

      batch.push({
        isbn: book.isbn,
        embeddingLiteral: toVectorLiteral(embedding)
      });

      if (batch.length >= BATCH_SIZE) {
        upserted += await flushBatch(client, batch);
        batch.length = 0;
      }

      processed++;
      if (processed % PROGRESS_EVERY === 0 || processed === books.length) {
        console.log(`[book_embeddings] progresso: ${processed}/${books.length} | upsert: ${upserted}`);
      }
    }

    upserted += await flushBatch(client, batch);

    if (PRUNE_OLD_BOOK_EMBEDDINGS) {
      const keepIsbns = books.map((b) => b.isbn);
      let deleted = 0;
      if (keepIsbns.length === 0) {
        const delRes = await client.query(
          `
          delete from book_embeddings
          where embedding_model = $1
            and embedding_dim = $2
          `,
          [EMBEDDING_MODEL, EMBEDDING_DIM]
        );
        deleted = delRes.rowCount ?? 0;
      } else {
        const delRes = await client.query(
          `
          delete from book_embeddings
          where embedding_model = $1
            and embedding_dim = $2
            and not (isbn = any($3::text[]))
          `,
          [EMBEDDING_MODEL, EMBEDDING_DIM, keepIsbns]
        );
        deleted = delRes.rowCount ?? 0;
      }
      console.log(`[book_embeddings] limpeza de embeddings antigos: ${deleted}`);
    }

    await client.query('commit');

    console.timeEnd('book_embeddings_total');
    console.log('[book_embeddings] concluido');
    console.log({ processed, upserted, embeddingModel: EMBEDDING_MODEL, embeddingDim: EMBEDDING_DIM });
  } catch (err) {
    await client.query('rollback');
    console.error('[book_embeddings] erro:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
