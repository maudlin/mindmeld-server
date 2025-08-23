# ADR 0001: MVP Architecture for Map Management

Status: Accepted

Context
- We need a minimal, correct, and boring stack to support map save/load with low risk.
- Existing code uses a different pattern that we may discard.

Decision
- Node.js + Express; SQLite via better-sqlite3
- REST endpoints: GET/POST /maps, GET/PUT/PATCH/DELETE /maps/:id
- Optimistic concurrency using version and/or ETag/If-Match
- MCP adapter as a thin layer over the same storage/API

Consequences
- Low ops burden; clear migration path to Postgres/D1 later
- Easy to reason about API and persistence

Open Questions
- Authentication timeline and mechanism
- Directory layout: layered vs domain modules
- Authentication timeline and mechanism
- Directory layout: layered vs domain modules
