# ADR 0003: Storage Choice — SQLite with JSON (reject graph-native DB)

Status: Accepted

Context
- We need to persist mind map data reliably with low operational overhead and fast local performance.
- Options discussed:
  - Native graph database (e.g., Neo4j) to store nodes/edges as a graph
  - Relational database (Postgres/MySQL) with normalized schema
  - SQLite with JSON storage (file-based) using better-sqlite3
  - Keeping an in-memory graph representation as a cache layer for speed
- Requirements emphasize simplicity, portability, and a quick path to MVP while preserving future flexibility.

Decision
- Store each map as JSON in SQLite using better-sqlite3.
- Schema (v1) via a single maps table with columns: id, name, version, updated_at, state_json.
- Use optimistic concurrency via version (and/or ETag derived from version or state hash).
- Do not adopt a native graph database at this stage; it is heavier than needed and increases ops complexity.
- Treat any graph-shaped access as a transient concern: if needed, use an optional in-memory cache or derived indices, not a graph DB.

Consequences
- Very low ops burden: single-file database, fast local reads/writes, easy backups.
- Flexible storage: the client’s JSON state remains intact, avoiding impedance mismatches.
- Performance: suitable for MVP; can add:
  - LRU in-memory cache for hot maps (30–120s TTL)
  - Derived tables or JSON indexes for specific queries (e.g., SQLite JSON1/FTS5)
  - Precomputed adjacency or simple edge lists in a secondary table if needed later
- Migration path: straightforward to Postgres with a matching schema if/when scale or HA is required.

Rejected Alternatives
- Neo4j/graph-native: rejected as too heavy for MVP (operational complexity, overkill for simple CRUD and occasional graph-like queries).
- Pure relational, fully normalized now: adds modeling overhead without clear short-term benefit; can introduce normalization later if warranted.
- No persistent DB (file-only JSON): insufficient for concurrency, durability guarantees, and query evolution.

Implementation Notes
- Use SQLite JSON1 functions for occasional field extraction if needed.
- Consider an auxiliary maps_index table or FTS5 index if searching within state becomes necessary.
- Backups: periodic file snapshot (e.g., daily), store off-box.
