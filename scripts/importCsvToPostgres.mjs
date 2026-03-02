import fs from 'node:fs';
import { parse } from 'csv-parse/sync';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});
const PROGRESS_EVERY = 10000;
const BATCH_SIZE = Number(process.env.IMPORT_BATCH_SIZE || 1000);

function readCsv(path) {
  const raw = fs.readFileSync(path, 'utf8');
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
    trim: true
  });
  console.log(`[${path}] linhas lidas: ${rows.length}`);
  return rows;
}

function toIntOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : Math.trunc(n);
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

async function importUsers(client) {
  const rows = readCsv('Users.csv');
  console.log(`[users] iniciando upsert em lotes (batch=${BATCH_SIZE})...`);
  let upserted = 0;
  let rejected = 0;
  let processed = 0;
  let batch = new Map();

  const flushBatch = async () => {
    if (batch.size === 0) return;
    const batchRows = Array.from(batch.values());
    const text = `
      insert into users (user_id, location, age)
      values ${buildValuePlaceholders(batchRows.length, 3)}
      on conflict (user_id) do update
      set location = excluded.location,
          age = excluded.age
    `;
    const values = batchRows.flat();
    const res = await client.query(text, values);
    upserted += res.rowCount ?? batchRows.length;
    batch.clear();
  };

  for (const r of rows) {
    processed++;
    const userId = toIntOrNull(r['User-ID']);
    if (!userId) {
      rejected++;
    } else {
      batch.set(userId, [userId, r['Location'] || null, toIntOrNull(r['Age'])]);
      if (batch.size >= BATCH_SIZE) {
        await flushBatch();
      }
    }

    if (processed % PROGRESS_EVERY === 0 || processed === rows.length) {
      console.log(
        `[users] progresso: ${processed}/${rows.length} | upsert: ${upserted} | rejeitadas: ${rejected}`
      );
    }
  }

  await flushBatch();
  console.log(
    `[users] final: total=${rows.length} | upsert=${upserted} | rejeitadas=${rejected}`
  );
  return upserted;
}

async function importBooks(client) {
  const rows = readCsv('Books.csv');
  console.log(`[books] iniciando upsert em lotes (batch=${BATCH_SIZE})...`);
  let upserted = 0;
  let rejected = 0;
  let processed = 0;
  let batch = new Map();

  const flushBatch = async () => {
    if (batch.size === 0) return;
    const batchRows = Array.from(batch.values());
    const text = `
      insert into books (
        isbn, book_title, book_author, year_of_publication, publisher
      )
      values ${buildValuePlaceholders(batchRows.length, 5)}
      on conflict (isbn) do update
      set book_title = excluded.book_title,
          book_author = excluded.book_author,
          year_of_publication = excluded.year_of_publication,
          publisher = excluded.publisher
    `;
    const values = batchRows.flat();
    const res = await client.query(text, values);
    upserted += res.rowCount ?? batchRows.length;
    batch.clear();
  };

  for (const r of rows) {
    processed++;
    const isbn = r['ISBN'] || null;
    if (!isbn) {
      rejected++;
    } else {
      batch.set(isbn, [
        isbn,
        r['Book-Title'] || null,
        r['Book-Author'] || null,
        toIntOrNull(r['Year-Of-Publication']),
        r['Publisher'] || null
      ]);
      if (batch.size >= BATCH_SIZE) {
        await flushBatch();
      }
    }

    if (processed % PROGRESS_EVERY === 0 || processed === rows.length) {
      console.log(
        `[books] progresso: ${processed}/${rows.length} | upsert: ${upserted} | rejeitadas: ${rejected}`
      );
    }
  }

  await flushBatch();
  console.log(
    `[books] final: total=${rows.length} | upsert=${upserted} | rejeitadas=${rejected}`
  );
  return upserted;
}

async function importRatings(client) {
  const rows = readCsv('Ratings.csv');
  console.log(`[ratings] iniciando upsert em lotes (batch=${BATCH_SIZE})...`);
  let insertedOrUpdated = 0;
  let rejected = 0;
  let processed = 0;
  let batch = new Map();

  const flushBatch = async () => {
    if (batch.size === 0) return;
    const batchRows = Array.from(batch.values());
    const text = `
      insert into ratings (user_id, isbn, rating)
      values ${buildValuePlaceholders(batchRows.length, 3)}
      on conflict (user_id, isbn) do update
      set rating = excluded.rating
    `;
    const values = batchRows.flat();
    const res = await client.query(text, values);
    insertedOrUpdated += res.rowCount ?? batchRows.length;
    batch.clear();
  };

  for (const r of rows) {
    processed++;
    const userId = toIntOrNull(r['User-ID']);
    const isbn = r['ISBN'] || null;
    const rating = toIntOrNull(r['Book-Rating']);

    if (!userId || !isbn || rating === null) {
      rejected++;
    } else {
      const key = `${userId}|${isbn}`;
      batch.set(key, [userId, isbn, rating]);
      if (batch.size >= BATCH_SIZE) {
        await flushBatch();
      }
    }

    if (processed % PROGRESS_EVERY === 0 || processed === rows.length) {
      console.log(
        `[ratings] progresso: ${processed}/${rows.length} | upsert: ${insertedOrUpdated} | rejeitadas: ${rejected}`
      );
    }
  }

  await flushBatch();
  return { total: rows.length, insertedOrUpdated, rejected };
}

async function main() {
  const client = await pool.connect();
  try {
    console.time('import_total');

    // await client.query('begin');
    // const users = await importUsers(client);
    // await client.query('commit');
    // console.log(`[users] commit ok. total: ${users}`);

    await client.query('begin');
    const books = await importBooks(client);
    await client.query('commit');
    console.log(`[books] commit ok. total: ${books}`);

    await client.query('begin');
    const ratings = await importRatings(client);
    await client.query('commit');
    console.log('[ratings] commit ok.');

    console.timeEnd('import_total');
    console.log('Import concluido:');
    console.log({ users, books, ratings });
  } catch (err) {
    await client.query('rollback');
    console.error('Erro no import:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
