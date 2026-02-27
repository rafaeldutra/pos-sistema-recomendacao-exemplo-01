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

