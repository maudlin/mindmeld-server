# ADR 0004: Access Model and Concurrency Strategy

Status: Accepted

Context
- Initial scope: one user, one client, one backend server, one data store (remote state only).
- Near-term evolution: one user with multiple maps; introduce titles and UUIDs; ability to select and load a specific map.
- Later evolution: multiple clients accessing one server concurrently; require low latency and controlled access.
- Non-goals: complex Google-Docs-style real-time collaboration (OT/CRDT) at this stage.
- Constraint: avoid one-way door decisions; keep paths open to scale and richer features.

Decision
- Resource model
  - Represent maps as first-class resources with UUID identifiers and human-readable titles.
  - Provide a list endpoint for selection and a fetch/update endpoint per map.
  - Store the map state as JSON (opaque to the server for MVP).
- Concurrency control
  - Use optimistic concurrency via an integer version field stored with each map.
  - On read: return current version (and optionally an ETag derived from version or a state hash).
  - On write: require the client to provide the last-seen version (or If-Match); reject with 409/412 on mismatch.
  - On success: perform the update in a transaction and atomically increment version.
- Persistence behavior
  - SQLite (better-sqlite3), with transactions around write paths to prevent corruption.
  - Prefer WAL journal mode for improved concurrency characteristics.
  - Prepared statements for reads/writes; single-writer semantics are acceptable for MVP.
- Notifications (optional, later)
  - Provide lightweight change notifications (SSE or WebSocket) for map:updated to help clients refresh/diff when needed.
  - Not required for MVP; do not imply real-time collaborative editing semantics.
- Caching (optional)
  - In-memory LRU cache for hot reads keyed by map id with short TTL (e.g., 30–120s), invalidated on successful writes.
- Security and access
  - MVP runs without authentication; design endpoints to be stable so auth (API keys/OIDC) can be added later without breaking clients.

Consequences
- Simple, low-overhead concurrency that prevents near-synchronous write corruption without complex coordination.
- Clear UX path for conflicts (prompt to reload/merge on 409/412).
- Minimal operational footprint; upgrade paths remain open (Postgres, brokered notifications, distributed locks).
- No commitment to heavy collaboration infrastructure; can be introduced later only if needed.

Rejected Alternatives
- Real-time collaborative editing via OT/CRDT: rejected for MVP due to complexity and operational burden.
- Server-side pessimistic locking for all writes: unnecessary for MVP and can harm latency; may be considered selectively if a future hotspot emerges.

Open Questions
- Authentication/authorization timeline and mechanism; multi-tenant scoping.
- Rate limiting and abuse protection.
- Thresholds for moving to Postgres or introducing a broker for notifications.
- Conflict resolution UX specifics on the client (auto-merge strategies, if any).

Implementation Notes
- Use UUIDv4 for map ids; validate and treat as opaque.
- Add index on updated_at for listing and housekeeping.
- Ensure all write operations are transactional; return consistent timestamps (ISO 8601 UTC).
- Consider enabling PRAGMA settings appropriate for WAL mode and durability trade-offs.
