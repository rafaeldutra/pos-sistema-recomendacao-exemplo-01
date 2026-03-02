# Design Notes: book-recommendation

## Data Sources
- Input files are expected in project root:
  - `Books.csv`
  - `Ratings.csv`
  - `Users.csv`

## Proposed Database Model (PostgreSQL + pgvector)

### Core Relational Tables
- `users`
  - `user_id` (PK, integer/bigint from source)
  - user attributes from `Users.csv`
- `books`
  - `isbn` (PK, text)
  - book attributes from `Books.csv`
- `ratings`
  - `user_id` (FK -> users.user_id)
  - `isbn` (FK -> books.isbn)
  - `rating` (numeric/integer)
  - composite unique key (`user_id`, `isbn`)

### Vector Support
- Enable extension: `CREATE EXTENSION IF NOT EXISTS vector;`
- `book_embeddings`
  - `isbn` (PK/FK -> books.isbn)
  - `embedding_model` (text, e.g. model identifier)
  - `embedding_dim` (integer)
  - `embedding` (`vector(N)`, N fixed per model)
  - `updated_at` (timestamp)
- `user_embeddings`
  - `user_id` (PK/FK -> users.user_id)
  - `embedding_model` (text)
  - `embedding_dim` (integer)
  - `embedding` (`vector(N)`)
  - `updated_at` (timestamp)

### Training Persistence
- `training_runs`
  - `run_id` (PK)
  - `started_at`, `ended_at`, `status`
  - dataset version/hash metadata
  - embedding model + dimension metadata
- `training_metrics`
  - `run_id` (FK -> training_runs.run_id)
  - metric name/value per epoch or aggregate
- `training_artifacts`
  - `run_id` (FK -> training_runs.run_id)
  - artifact type and serialized payload/reference

## Import Strategy
- Parse CSV files with explicit schema mapping per file.
- Validate required columns and basic value constraints.
- Load in dependency order: `users` -> `books` -> `ratings`.
- Use transactional batches and conflict handling (`ON CONFLICT`) to support
  safe re-runs.
- Record import summary: inserted/updated/rejected counts.

## Embedding and Recommendation Strategy
- Build item embeddings from normalized book metadata fields (title, author,
  publisher) and optionally collaborative signals from ratings.
- Build user embeddings from rated-item aggregation (weighted mean by rating)
  or offline model output.
- Persist vectors in `book_embeddings` and `user_embeddings`.
- Use similarity operators for retrieval:
  - cosine distance: `<=>`
  - L2 distance: `<->`
  - inner product: `<#>`
- Query top-N candidate books by ordering on vector distance and filtering
  previously rated items.

Example retrieval query (cosine distance):
```sql
SELECT b.isbn,
       b.book_title,
       1 - (be.embedding <=> ue.embedding) AS similarity
FROM user_embeddings ue
JOIN book_embeddings be ON TRUE
JOIN books b ON b.isbn = be.isbn
LEFT JOIN ratings r
  ON r.user_id = ue.user_id
 AND r.isbn = be.isbn
WHERE ue.user_id = $1
  AND r.user_id IS NULL
ORDER BY be.embedding <=> ue.embedding
LIMIT $2;
```

## Indexing Strategy
- Keep B-tree indexes for relational joins:
  - `ratings(user_id, isbn)`
  - `ratings(isbn)`
- Add ANN index on vectors for scalable retrieval:
  - `CREATE INDEX ... USING hnsw (embedding vector_cosine_ops);`
- Select operator class according to metric in use
  (`vector_cosine_ops`, `vector_l2_ops`, `vector_ip_ops`).

## Integration Strategy
- Introduce repository/service layer abstractions for PostgreSQL I/O.
- Keep training orchestration separate from raw persistence code.
- Ensure recommendation flow can:
  1. read historical runs and latest data snapshots,
  2. generate/update embeddings,
  3. run similarity retrieval with pgvector,
  4. log recommendation generation metadata.

## Risks and Mitigations
- CSV encoding/format inconsistencies:
  - Mitigation: strict parser config + error logs with row numbers.
- Large import volume:
  - Mitigation: batch inserts and indexes on join/filter keys.
- Data integrity drift:
  - Mitigation: FK constraints and post-import sanity checks.
- Embedding model/dimension mismatch:
  - Mitigation: validate model + fixed dimension before upsert.
- Slow vector search at scale:
  - Mitigation: ANN indexes (HNSW/IVFFlat), periodic vacuum/analyze, and
    distance metric consistency.