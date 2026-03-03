import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const EMBEDDING_DIM = Number(process.env.EMBEDDING_DIM || 1536);
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'deterministic-hash-v1';

async function main() {
  const client = await pool.connect();
  try {
    console.time('user_embeddings_total');
    console.log(
      `[user_embeddings] iniciando agregacao por media dos livros avaliados | modelo=${EMBEDDING_MODEL} dim=${EMBEDDING_DIM}`
    );

    await client.query('begin');

    const res = await client.query(
      `
      insert into user_embeddings (
        user_id,
        embedding_model,
        embedding_dim,
        embedding,
        updated_at
      )
      select
        r.user_id,
        $1::text as embedding_model,
        $2::int as embedding_dim,
        avg(be.embedding) as embedding,
        now() as updated_at
      from ratings r
      join book_embeddings be on be.isbn = r.isbn
      where be.embedding_model = $1
        and be.embedding_dim = $2
      group by r.user_id
      on conflict (user_id) do update
      set embedding_model = excluded.embedding_model,
          embedding_dim = excluded.embedding_dim,
          embedding = excluded.embedding,
          updated_at = now()
      `,
      [EMBEDDING_MODEL, EMBEDDING_DIM]
    );

    await client.query('commit');

    const countRes = await client.query(
      `select count(*)::int as total from user_embeddings where embedding_model = $1 and embedding_dim = $2`,
      [EMBEDDING_MODEL, EMBEDDING_DIM]
    );

    console.timeEnd('user_embeddings_total');
    console.log('[user_embeddings] concluido');
    console.log({
      upserted: res.rowCount ?? 0,
      totalForModelAndDim: countRes.rows[0]?.total ?? 0,
      embeddingModel: EMBEDDING_MODEL,
      embeddingDim: EMBEDDING_DIM
    });
  } catch (err) {
    await client.query('rollback');
    console.error('[user_embeddings] erro:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();