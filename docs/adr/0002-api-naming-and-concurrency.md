# ADR 0002: API naming and optimistic concurrency

Date: 2025-08-23

Status: Accepted

Context

- We standardized API JSON to camelCase (e.g., updatedAt) while DB columns may be snake_case (updated_at).
- We need concurrent-safety for map updates.

Decision

- API field names use camelCase; internal repositories translate snake_case ↔ camelCase.
- Use optimistic concurrency for /maps updates:
  - A monotonically increasing integer version field on the Map entity.
  - Support If-Match ETag header as an alternative concurrency guard.
- Return ETag headers for GET/POST/PUT on /maps resources.

Consequences

- Clear separation between API shape and persistence naming.
- Clients can choose version field or If-Match for conflict prevention.
- 409 for version conflicts; 412 for If-Match precondition failures.

Alternatives considered

- Server-side locking: increases complexity and reduces throughput for this MVP.
- Last-write-wins: simpler but unsafe for collaborative edits.
