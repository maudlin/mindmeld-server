# To-Be Database (Authoritative Draft)

Default: SQLite + better-sqlite3

Schema v1
- maps(
  - id TEXT PRIMARY KEY,
  - name TEXT NOT NULL,
  - version INTEGER NOT NULL DEFAULT 1,
  - updated_at TEXT NOT NULL,
  - state_json TEXT NOT NULL
)

Practices
- Increment version on successful write
- Compare version for updates (or If-Match via ETag)
- Backup the DB file on a daily schedule
- Prepare for Postgres migration with matching schema
