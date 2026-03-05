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
const USER_CHUNK_SIZE = Number(process.env.USER_EMBEDDING_CHUNK_SIZE || 2000);
const USER_PROGRESS_EVERY = Number(process.env.USER_EMBEDDING_PROGRESS_EVERY || 5000);
const PRUNE_OLD_USER_EMBEDDINGS =
  (process.env.PRUNE_OLD_USER_EMBEDDINGS || 'true').toLowerCase() === 'true';

async function fetchCandidateUsersChunk(client, lastUserId, limit) {
  const res = await client.query(
    `
    select r.user_id
    from ratings r
    where r.user_id > $1
    group by r.user_id
    order by r.user_id
    limit $2
    `,
    [lastUserId, limit]
  );
  return res.rows.map((r) => Number(r.user_id));
}

async function main() {
  const client = await pool.connect();
  try {
    console.time('user_embeddings_total');
    console.log(
      `[user_embeddings] iniciando agregacao por media dos livros avaliados | modelo=${EMBEDDING_MODEL} dim=${EMBEDDING_DIM} limit=${USER_EMBEDDING_LIMIT} min_rated_books=${USER_MIN_RATED_BOOKS} chunk=${USER_CHUNK_SIZE}`
    );

    await client.query('begin');
    await client.query(`set local statement_timeout = '0'`);

    let lastUserId = 0;
    let scannedUsers = 0;
    let upserted = 0;
    const selectedUsers = [];

    while (selectedUsers.length < USER_EMBEDDING_LIMIT) {
      const remaining = USER_EMBEDDING_LIMIT - selectedUsers.length;
      const chunkLimit = Math.min(USER_CHUNK_SIZE, remaining);
      const candidateUsers = await fetchCandidateUsersChunk(client, lastUserId, chunkLimit);
      if (candidateUsers.length === 0) break;

      lastUserId = candidateUsers[candidateUsers.length - 1];
      scannedUsers += candidateUsers.length;

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
          and r.user_id = any($3::bigint[])
        group by r.user_id
        having count(*) >= $4
        on conflict (user_id) do update
        set embedding_model = excluded.embedding_model,
            embedding_dim = excluded.embedding_dim,
            embedding = excluded.embedding,
            updated_at = now()
        returning user_id
        `,
        [EMBEDDING_MODEL, EMBEDDING_DIM, candidateUsers, USER_MIN_RATED_BOOKS]
      );

      upserted += res.rowCount ?? 0;
      for (const row of res.rows) {
        selectedUsers.push(Number(row.user_id));
      }

      if (selectedUsers.length % USER_PROGRESS_EVERY === 0 || selectedUsers.length >= USER_EMBEDDING_LIMIT) {
        console.log(
          `[user_embeddings] progresso: selecionados=${selectedUsers.length}/${USER_EMBEDDING_LIMIT} | varridos=${scannedUsers} | upsert=${upserted}`
        );
      }
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
      upserted,
      selectedUsers: selectedUsers.length,
      scannedUsers,
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
