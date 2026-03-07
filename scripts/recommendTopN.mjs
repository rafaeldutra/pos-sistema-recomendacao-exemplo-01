import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const EMBEDDING_DIM = Number(process.env.EMBEDDING_DIM || 384);
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'deterministic-hash-v1';

function parseArgs() {
  const userId = Number(process.argv[2]);
  const topN = Number(process.argv[3] || 10);

  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error('Uso: npm run recommend:topn -- <user_id> [top_n]');
  }
  if (!Number.isInteger(topN) || topN <= 0) {
    throw new Error('top_n deve ser inteiro positivo.');
  }

  return { userId, topN };
}

async function main() {
  const { userId, topN } = parseArgs();
  const client = await pool.connect();

  try {
    const userEmbeddingRes = await client.query(
      `
      select 1
      from user_embeddings ue
      where ue.user_id = $1
        and ue.embedding_model = $2
        and ue.embedding_dim = $3
      limit 1
      `,
      [userId, EMBEDDING_MODEL, EMBEDDING_DIM]
    );

    if (userEmbeddingRes.rowCount === 0) {
      console.log(
        `[recommend:topn] usuario ${userId} sem embedding para modelo=${EMBEDDING_MODEL} dim=${EMBEDDING_DIM}`
      );
      return;
    }

    const result = await client.query(
      `
      with user_vector as (
        select ue.embedding
        from user_embeddings ue
        where ue.user_id = $1
          and ue.embedding_model = $3
          and ue.embedding_dim = $4
        limit 1
      )
      select
        row_number() over (order by (be.embedding <=> uv.embedding), b.isbn) as rank,
        b.isbn,
        b.book_title,
        b.book_author,
        be.embedding <=> uv.embedding as distance,
        1 - (be.embedding <=> uv.embedding) as score
      from user_vector uv
      join book_embeddings be
        on be.embedding_model = $3
       and be.embedding_dim = $4
      join books b on b.isbn = be.isbn
      left join ratings r
        on r.user_id = $1
       and r.isbn = be.isbn
      where r.user_id is null
      order by (be.embedding <=> uv.embedding), b.isbn
      limit $2
      `,
      [userId, topN, EMBEDDING_MODEL, EMBEDDING_DIM]
    );

    console.log(
      `[recommend:topn] user_id=${userId} top_n=${topN} model=${EMBEDDING_MODEL} dim=${EMBEDDING_DIM}`
    );
    console.table(result.rows);
  } catch (err) {
    console.error('[recommend:topn] erro:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
