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

async function importUsers(client) {
  const rows = readCsv('Users.csv');
  console.log('[users] iniciando upsert...');
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    await client.query(
      `
      insert into users (user_id, location, age)
      values ($1, $2, $3)
      on conflict (user_id) do update
      set location = excluded.location,
          age = excluded.age
      `,
      [toIntOrNull(r['User-ID']), r['Location'] || null, toIntOrNull(r['Age'])]
    );
    if ((i + 1) % PROGRESS_EVERY === 0 || i + 1 === rows.length) {
      console.log(`[users] progresso: ${i + 1}/${rows.length}`);
    }
  }
  return rows.length;
}

async function importBooks(client) {
  const rows = readCsv('Books.csv');
  console.log('[books] iniciando upsert...');
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    await client.query(
      `
      insert into books (
        isbn, book_title, book_author, year_of_publication, publisher
      )
      values ($1, $2, $3, $4, $5)
      on conflict (isbn) do update
      set book_title = excluded.book_title,
          book_author = excluded.book_author,
          year_of_publication = excluded.year_of_publication,
          publisher = excluded.publisher
      `,
      [
        r['ISBN'],
        r['Book-Title'] || null,
        r['Book-Author'] || null,
        toIntOrNull(r['Year-Of-Publication']),
        r['Publisher'] || null
      ]
    );
    if ((i + 1) % PROGRESS_EVERY === 0 || i + 1 === rows.length) {
      console.log(`[books] progresso: ${i + 1}/${rows.length}`);
    }
  }
  return rows.length;
}

async function importRatings(client) {
  const rows = readCsv('Ratings.csv');
  console.log('[ratings] iniciando upsert...');
  let insertedOrUpdated = 0;
  let rejected = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const userId = toIntOrNull(r['User-ID']);
    const isbn = r['ISBN'] || null;
    const rating = toIntOrNull(r['Book-Rating']);

    if (!userId || !isbn || rating === null) {
      rejected++;
      continue;
    }

    const res = await client.query(
      `
      insert into ratings (user_id, isbn, rating)
      values ($1, $2, $3)
      on conflict (user_id, isbn) do update
      set rating = excluded.rating
      `,
      [userId, isbn, rating]
    );

    if (res.rowCount > 0) insertedOrUpdated++;
    if ((i + 1) % PROGRESS_EVERY === 0 || i + 1 === rows.length) {
      console.log(
        `[ratings] progresso: ${i + 1}/${rows.length} | upsert: ${insertedOrUpdated} | rejeitadas: ${rejected}`
      );
    }
  }

  return { total: rows.length, insertedOrUpdated, rejected };
}

async function main() {
  const client = await pool.connect();
  try {
    console.time('import_total');

    await client.query('begin');
    const users = await importUsers(client);
    await client.query('commit');
    console.log(`[users] commit ok. total: ${users}`);

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
