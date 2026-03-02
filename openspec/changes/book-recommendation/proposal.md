# Change Proposal: book-recommendation

## Problem
The current project uses browser-local data patterns and does not provide
durable storage for recommendation datasets or model training history.
For the new book recommendation application, data must be imported from
`Books.csv`, `Ratings.csv`, and `Users.csv` in the project root and persisted
in PostgreSQL.

To implement recommendation retrieval with semantic similarity, the database
also needs native vector support via `pgvector`.

## Scope
1. Add PostgreSQL-backed storage for books, users, and ratings.
2. Define an ingestion workflow to import `Books.csv`, `Ratings.csv`, and
   `Users.csv` from the project root.
3. Persist recommendation training data in PostgreSQL.
4. Enable and use `pgvector` for embedding persistence and similarity search.
5. Define read/write integration points for recommendation workflows.

## Out of Scope
1. Production infrastructure provisioning.
2. UI redesign unrelated to the new data source.
3. Advanced recommendation algorithm redesign beyond data persistence,
   embedding generation, and vector retrieval.

## Proposed Changes
1. Create normalized database schema for users, books, ratings.
2. Add import process with validation and idempotent loading behavior.
3. Add tables for training runs, metrics, and serialized training artifacts.
4. Enable `pgvector` extension and add embedding columns/tables for
   recommendation retrieval.
5. Add vector indexes and similarity-query repository methods for top-N
   recommendation lookup.
6. Introduce service/repository interfaces for database operations.

## Validation
1. A clean PostgreSQL database can be initialized with the new schema,
   including `pgvector` extension.
2. Import completes successfully for all 3 CSV files.
3. Re-import does not corrupt data (idempotent/upsert behavior).
4. Training run metadata and metrics are queryable after a training cycle.
5. Similarity search returns ranked recommendations using vector distance.