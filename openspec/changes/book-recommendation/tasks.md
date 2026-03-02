# Tasks: book-recommendation

1. Define PostgreSQL schema migration for `users`, `books`, `ratings`,
   `training_*` tables, and vector embedding tables.
2. Enable `pgvector` extension in migration bootstrap
   (`CREATE EXTENSION IF NOT EXISTS vector`).
3. Define import mapping rules from root CSV files:
   `Users.csv`, `Books.csv`, `Ratings.csv`.
4. Implement ingestion command/workflow with input validation and row-level
   error reporting.
5. Implement idempotent loading strategy (`UPSERT`/conflict handling).
6. Implement data-access layer for reads/writes against PostgreSQL,
   including vector upserts and similarity queries.
7. Implement embedding generation pipeline (book/user) with fixed-dimension
   validation and model metadata persistence.
8. Add vector index strategy (at least HNSW or IVFFlat) and benchmark query
   performance for top-N retrieval.
9. Persist training runs, metrics, and artifacts in database tables.
10. Integrate recommendation/training flow to use pgvector-backed retrieval.
11. Add manual validation steps for import counts, integrity checks,
    embedding consistency, and recommendation query verification.