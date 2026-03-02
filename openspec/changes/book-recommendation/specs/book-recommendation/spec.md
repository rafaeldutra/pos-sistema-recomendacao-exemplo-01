# Spec: book-recommendation

## ADDED Requirements

### Requirement: Import Root CSV Datasets into PostgreSQL
The system MUST import `Books.csv`, `Ratings.csv`, and `Users.csv` from the
project root into PostgreSQL tables.

#### Scenario: Successful first import
- **GIVEN** a PostgreSQL database with the required schema
- **AND** valid `Books.csv`, `Ratings.csv`, and `Users.csv` files in project root
- **WHEN** the import workflow is executed
- **THEN** users, books, and ratings data are persisted in PostgreSQL
- **AND** import summary counts are produced

#### Scenario: Missing required CSV file
- **GIVEN** one or more required CSV files are missing
- **WHEN** the import workflow is executed
- **THEN** the workflow fails with a clear error identifying missing file paths

### Requirement: Preserve Data Integrity Across Entities
The system MUST enforce data integrity for users, books, and ratings.

#### Scenario: Rating references unknown user or book
- **GIVEN** a rating row references a non-existent user or book
- **WHEN** the row is processed
- **THEN** the system rejects or reports the invalid row
- **AND** preserves database integrity constraints

### Requirement: Support Idempotent Re-import
The import workflow MUST be safe to run multiple times.

#### Scenario: Re-import same files
- **GIVEN** the same source CSV files were already imported
- **WHEN** the import runs again
- **THEN** data is upserted or skipped without duplicate logical records

### Requirement: Persist Recommendation Training Data
The system MUST persist recommendation training run data in PostgreSQL.

#### Scenario: Training run completes
- **GIVEN** a training process executes for recommendations
- **WHEN** the run finishes
- **THEN** the system stores run metadata, metrics, and artifacts in database
- **AND** the data is queryable for later analysis and reuse

### Requirement: Enable pgvector in PostgreSQL
The system MUST enable PostgreSQL `pgvector` extension before vector
persistence or similarity queries are used.

#### Scenario: Database initialization
- **GIVEN** a fresh PostgreSQL database
- **WHEN** schema initialization is executed
- **THEN** `CREATE EXTENSION IF NOT EXISTS vector` is applied successfully
- **AND** vector tables/columns can be created without type errors

### Requirement: Persist Book and User Embeddings
The system MUST persist fixed-dimension embeddings for books and users.

#### Scenario: Embedding upsert
- **GIVEN** generated embeddings for books and users with configured dimension N
- **WHEN** embedding persistence runs
- **THEN** embeddings are upserted in PostgreSQL `vector(N)` fields
- **AND** model metadata and update timestamps are stored

#### Scenario: Embedding dimension mismatch
- **GIVEN** an embedding payload with dimension different from configured N
- **WHEN** the payload is persisted
- **THEN** the system rejects the payload with a clear validation error

### Requirement: Retrieve Recommendations with Vector Similarity
The system MUST support top-N recommendation retrieval using pgvector
similarity operators.

#### Scenario: User recommendation query
- **GIVEN** a user embedding and persisted candidate book embeddings
- **WHEN** top-N recommendations are requested
- **THEN** the system returns ranked books ordered by configured vector distance
- **AND** excludes books already rated by the user

#### Scenario: No embedding available for user
- **GIVEN** the user has no persisted embedding
- **WHEN** recommendation retrieval is requested
- **THEN** the system returns a controlled empty/fallback response
- **AND** logs the reason for observability