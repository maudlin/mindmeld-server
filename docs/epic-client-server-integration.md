# Epic: Client ↔ Server Integration v1 (Maps API)

## Objective

Deliver a first working integration between the MindMeld client and MindMeld Server using a minimal, robust Maps API with optimistic concurrency via ETag/If-Match, enabling create → load → save workflows.

## Background

See todo.md for the minimal connectivity plan and the design/to-be docs. Current server includes /api/state endpoints and initial /maps endpoints behind FEATURE_MAPS_API.

## Scope

- Adopt canonical payload `data` (export/import blob) for Maps API
- Implement ETag based on sha256(data); require If-Match on PUT
- Add GET /maps (listing) with id/name/version/updatedAt/size
- Expose ETag and RateLimit\* headers for browsers
- Add seed script and docs for client integration
- Add .nvmrc (Node 24) and update env example
- Update OpenAPI and add tests + smoke coverage

Out of scope (future): PATCH/CRDT, WebSocket presence, auth/multi-user, search.

## Deliverables

- Working endpoints: POST /maps, GET /maps, GET /maps/:id, PUT /maps/:id
- DB schema updated with size_bytes; WAL enabled
- Deterministic ETag on create/get/put responses
- CORS exposes ETag and RateLimit\* headers
- Seed script (npm run seed) creating sample maps
- Docs update: client integration section for /maps; OpenAPI updated
- Passing tests: integration for ETag/If-Match flows; existing tests green

## Acceptance Criteria

- POST /maps → 201 returns {id, version=1, updatedAt} and ETag header; stores payload as `data`
- GET /maps/:id → 200 returns {id, version, updatedAt, data} with same ETag as created
- PUT /maps/:id with correct If-Match → 200; version increments; ETag changes
- PUT /maps/:id with wrong If-Match → 409
- GET /maps → 200 array includes {id, name?, version, updatedAt, size}
- CORS exposes: ETag, RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset
- .env.example includes FEATURE_MAPS_API=1 and correct dev CORS origin
- Node version pinned via .nvmrc (24)
- Smoke test passes end-to-end against running server

## Work Breakdown (Stories)

1. CORS exposed headers
2. Canonical data payload + backward compat for state
3. ETag sha256 + If-Match concurrency on PUT
4. GET /maps listing + DB size_bytes migration
5. Seed script + npm run seed
6. Dev ergonomics: .nvmrc, env example updates
7. OpenAPI spec + docs for client maps integration
8. Tests: integration for ETag flows; extend smoke

## Risks & Mitigations

- Browser fetch caching with ETag: ensure correct weak/strong semantics and client usage of If-Match
- Migration of existing rows: populate size_bytes on first write/read
- Backward compatibility: accept `state` in requests for a deprecation period

## Rollout Plan

- Feature branch → PR → review → merge to main
- Coordinate client changeover to use ETag/If-Match
- Monitor logs and rate limit metrics

## References

- todo.md (Minimal v1 Connectivity Plan)
- design/to-be/openapi.yaml
- docs/client-integration.md
