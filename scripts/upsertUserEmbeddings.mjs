import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const EMBEDDING_DIM = Number(process.env.EMBEDDING_DIM || 1536);
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'deterministic-hash-v1';
const USER_EMBEDDING_LIMIT = Number(process.env.USER_EMBEDDING_LIMIT || 30000);
const USER_MIN_RATED_BOOKS = Number(process.env.USER_MIN_RATED_BOOKS || 3);
const PRUNE_OLD_USER_EMBEDDINGS =
  (process.env.PRUNE_OLD_USER_EMBEDDINGS || 'true').toLowerCase() === 'true';

async function fetchSelectedUsers(client) {
  const res = await client.query(
    `
    with user_activity as (
      select r.user_id, count(*)::int as rated_books
      from ratings r
      join book_embeddings be on be.isbn = r.isbn
      where be.embedding_model = $1
        and be.embedding_dim = $2
      group by r.user_id
      having count(*) >= $3
    )
    select ua.user_id
    from user_activity ua
    order by ua.rated_books desc, ua.user_id
    limit $4
    `,
    [EMBEDDING_MODEL, EMBEDDING_DIM, USER_MIN_RATED_BOOKS, USER_EMBEDDING_LIMIT]
  );
  return res.rows.map((r) => Number(r.user_id));
}

async function main() {
  const client = await pool.connect();
  try {
    console.time('user_embeddings_total');
    console.log(
      `[user_embeddings] iniciando agregacao por media dos livros avaliados | modelo=${EMBEDDING_MODEL} dim=${EMBEDDING_DIM} limit=${USER_EMBEDDING_LIMIT} min_rated_books=${USER_MIN_RATED_BOOKS}`
    );

    const selectedUsers = await fetchSelectedUsers(client);
    console.log(`[user_embeddings] usuarios selecionados: ${selectedUsers.length}`);

    await client.query('begin');

    let res;
    if (selectedUsers.length === 0) {
      res = { rowCount: 0 };
    } else {
      res = await client.query(
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
          and r.user_id = any($3::bigint[])
        group by r.user_id
        on conflict (user_id) do update
        set embedding_model = excluded.embedding_model,
            embedding_dim = excluded.embedding_dim,
            embedding = excluded.embedding,
            updated_at = now()
        `,
        [EMBEDDING_MODEL, EMBEDDING_DIM, selectedUsers]
      );
    }

    if (PRUNE_OLD_USER_EMBEDDINGS) {
      let deleted = 0;
      if (selectedUsers.length === 0) {
        const delRes = await client.query(
          `
          delete from user_embeddings
          where embedding_model = $1
            and embedding_dim = $2
          `,
          [EMBEDDING_MODEL, EMBEDDING_DIM]
        );
        deleted = delRes.rowCount ?? 0;
      } else {
        const delRes = await client.query(
          `
          delete from user_embeddings
          where embedding_model = $1
            and embedding_dim = $2
            and not (user_id = any($3::bigint[]))
          `,
          [EMBEDDING_MODEL, EMBEDDING_DIM, selectedUsers]
        );
        deleted = delRes.rowCount ?? 0;
      }
      console.log(`[user_embeddings] limpeza de embeddings antigos: ${deleted}`);
    }

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
