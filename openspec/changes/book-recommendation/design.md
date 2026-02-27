# Design Notes: book-recommendation

## Data Sources
- Input files are expected in project root:
  - `Books.csv`
  - `Ratings.csv`
  - `Users.csv`

## Proposed Database Model (PostgreSQL)
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

## Training Persistence
- `training_runs`
  - `run_id` (PK)
  - `started_at`, `ended_at`, `status`
  - dataset version/hash metadata
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

## Integration Strategy
- Introduce repository/service layer abstractions for PostgreSQL I/O.
- Keep training orchestration separate from raw persistence code.
- Ensure recommendation training can read historical runs and latest data
  snapshots from PostgreSQL.

## Risks and Mitigations
- CSV encoding/format inconsistencies:
  - Mitigation: strict parser config + error logs with row numbers.
- Large import volume:
  - Mitigation: batch inserts and indexes on join/filter keys.
- Data integrity drift:
  - Mitigation: FK constraints and post-import sanity checks.

