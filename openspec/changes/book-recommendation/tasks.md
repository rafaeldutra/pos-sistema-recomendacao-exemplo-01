# Tasks: book-recommendation

1. Define PostgreSQL schema migration for `users`, `books`, `ratings`,
   and training persistence tables.
2. Define import mapping rules from root CSV files:
   `Users.csv`, `Books.csv`, `Ratings.csv`.
3. Implement ingestion command/workflow with input validation and row-level
   error reporting.
4. Implement idempotent loading strategy (`UPSERT`/conflict handling).
5. Implement data-access layer for reads/writes against PostgreSQL.
6. Persist training runs, metrics, and artifacts in database tables.
7. Integrate recommendation/training flow to use database-backed data.
8. Add manual validation steps for import counts, integrity checks,
   and training persistence verification.

