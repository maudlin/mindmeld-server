# Project Context

A concise, up-to-date overview of MindMeld Server for developers and reviewers. This summarizes current state, runtime, key components, and near-term plans.

## Current state (as of now)

- Purpose: HTTP API for MindMeld client with a file-based state API and an optional /maps vertical slice backed by SQLite.
- Status: Stable core endpoints; /maps feature behind a flag and covered by integration tests.
- Branching: Work off main with short-lived topic branches merged via PR.
- Documentation:
  - Manual testing: docs/testing-guide.md
  - To-be design: design/to-be/README.md and design/to-be/openapi.yaml
  - README refined for production (Node 24, Docker, RFC 7807 errors)

## Runtime and tooling

- Node.js: 24 only
  - CI matrix: Node 24
  - package.json engines: ">=24.0.0"
  - .nvmrc: 24
  - Docker: node:24-alpine runtime
- Frameworks & libs:
  - Express 4, better-sqlite3 ^12.2.0, zod, pino + pino-http
- Tooling: ESLint, Prettier, Husky + lint-staged, Jest, Spectral (OpenAPI), Redoc (dev-only)

## Key components and paths

- Server factory: src/factories/server-factory.js
- Middleware: src/core/middleware.js
- Global error handler (RFC 7807): src/core/error-handler.js
- File storage and state service: src/data/file-storage.js, src/services/state-service.js
- Core routes (file state): src/core/api-routes.js
- Maps module (feature-flagged): src/modules/maps/\* (db, repo, service, routes)
- Config (zod-validated): src/config/config.js
- Tests: tests/unit/_, tests/integration/_

## API surface (as-is)

- GET /health — status and basic stats
- GET /api/state — current state (falls back to empty state)
- PUT /api/state — save state with validation and atomic writes
- GET /api/state/stats — derived statistics

Errors are standardized via RFC 7807 (application/problem+json) by the global handler. During migration a legacy `error` field mirrors the title for backward compatibility.

## Feature flags

- FEATURE_MAPS_API (boolean): when true, mounts /maps routes. Requires SQLITE_FILE path (default ./data/db.sqlite if unset).

## Recent changes (merged)

- Node 24 alignment: CI, engines, .nvmrc, Docker base image
- Global RFC 7807 error handler: standardized 4xx/5xx responses; 404 now returns problem+json
- PUT /api/state now delegates errors to the global handler
- Testing docs: added docs/testing-guide.md and linked from README
- README improvements: production Docker example, error docs, Node 24 references

## Planned work (near term)

1. Error handling maturity

- Introduce typed errors across modules (BadRequestError, NotFoundError, ConflictError)
- Map validation errors (e.g., from zod) to problem.errors[] with path/message
- Update OpenAPI design/to-be/openapi.yaml with ProblemDetails schema and examples

2. /maps vertical slice polish

- Support If-None-Match on GET /maps/{id} (304 when ETag matches)
- Add minimal migrations (schema_version) and indexes; keep SQLite simple
- Confirm consistent camelCase in API with snake_case in SQL

3. Observability and docs

- Include request id/correlation in problem details (optional problemId)
- Expand README operations notes (backups, WAL, graceful shutdown)

4. Dev experience

- Ensure config is single source of truth (src/config/config.js) and used consistently
- Tighten pino-http logging levels (2xx/3xx=info, 4xx=warn, 5xx=error)

## Out of scope (for now)

- Authentication/authorization (beyond potential API key flag)
- ORMs or complex migration frameworks
- Heavy observability stacks

## How to run and test

- Dev: npm run dev
- Prod: npm start
- Quality: npm run validate (lint, format:check, tests)
- Manual testing: follow docs/testing-guide.md (curl + Postman/Insomnia flows)
- Feature flag /maps: set FEATURE_MAPS_API=1 and SQLITE_FILE=./data/db.sqlite

## Notes for reviewers

- The /maps API is isolated behind a feature flag and is safe to ship incrementally.
- Error responses use Problem Details consistently across endpoints.
- Keep routes thin; prefer service/repo boundaries and consistent mapping (DB ↔ API).
