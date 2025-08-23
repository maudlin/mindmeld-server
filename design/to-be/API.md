# To-Be HTTP API (Authoritative Draft)

Endpoints
- GET /maps
  - Returns: [{ id, name, updated_at }]
- POST /maps
  - Body: { name, state }
  - Returns: { id, version, updated_at }
- GET /maps/:id
  - Returns: { id, name, state, version, updated_at }
- PUT /maps/:id
  - Body: { state, version }
  - Concurrency: 409/412 on mismatch (If-Match or version)
- PATCH /maps/:id/meta (optional)
  - Body: { name }
- DELETE /maps/:id (optional)

Headers
- ETag on reads; If-Match on writes (or numeric version field)

Notes
- This supersedes the current /api/state design; coexistence is temporary if needed.
