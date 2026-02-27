# Change Proposal: book-recommendation

## Problem
The current project uses browser-local data patterns and does not provide
durable storage for recommendation datasets or model training history.
For the new book recommendation application, data must be imported from
`Books.csv`, `Ratings.csv`, and `Users.csv` in the project root and persisted
in PostgreSQL.

## Scope
1. Add PostgreSQL-backed storage for books, users, and ratings.
2. Define an ingestion workflow to import `Books.csv`, `Ratings.csv`, and
   `Users.csv` from the project root.
3. Persist recommendation training data in PostgreSQL.
4. Define read/write integration points for recommendation workflows.

## Out of Scope
1. Production infrastructure provisioning.
2. UI redesign unrelated to the new data source.
3. Advanced recommendation algorithm redesign beyond data persistence.

## Proposed Changes
1. Create normalized database schema for users, books, ratings.
2. Add import process with validation and idempotent loading behavior.
3. Add tables for training runs, metrics, and serialized training artifacts.
4. Introduce service/repository interfaces for database operations.

## Validation
1. A clean PostgreSQL database can be initialized with the new schema.
2. Import completes successfully for all 3 CSV files.
3. Re-import does not corrupt data (idempotent/upsert behavior).
4. Training run metadata and metrics are queryable after a training cycle.

