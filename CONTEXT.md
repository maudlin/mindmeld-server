# Project Context

An up-to-date overview of MindMeld Server for developers and reviewers.

## Current state

- Purpose: Maps-first HTTP API for the MindMeld client, with SQLite-backed storage and optimistic concurrency.
- Status: /maps is the authoritative API. Legacy /api/state has been removed.
- Branching: Short-lived topic branches off main, merged via PR.
- Documentation:
  - Manual testing: docs/testing-guide.md
  - Design (to-be): design/to-be/README.md and design/to-be/openapi.yaml
  - README: production-focused (Node 24, Docker, RFC 7807)

## Runtime and tooling

- Node.js: 24 only
  - package.json engines: ">=24.0.0"; .nvmrc: 24; CI matrix: Node 24
  - Docker: node:24-alpine runtime
- Frameworks & libs: Express 4, better-sqlite3 ^12, zod, pino + pino-http
- Tooling: ESLint, Prettier, Husky + lint-staged, Jest, Spectral (OpenAPI), Redoc (dev-only)

## Key components

- Server factory: src/factories/server-factory.js
- Middleware: src/core/middleware.js
- Global error handler (RFC 7807): src/core/error-handler.js
- Maps module: src/modules/maps/\* (db, repo, service, routes)
- Config (zod-validated): src/config/config.js
- Utils: logger, event-bus, etag helpers
- Tests: tests/unit/_, tests/integration/_

## API surface

- GET /health — status and uptime
- GET /ready — readiness probe
- POST /maps — create a map (returns id, ETag header)
- GET /maps/{id} — fetch a map (ETag header)
- PUT /maps/{id} — update with If-Match ETag (409 on conflict)

Errors conform to RFC 7807 (application/problem+json) via the global handler.

## Feature flags

- FEATURE_MAPS_API: default enabled; set to 0/false to disable.
- SQLITE_FILE: SQLite path (default ./data/db.sqlite)

## Recent changes (merged)

- Removed legacy /api/state; maps-first server
- Enabled maps by default, ensured data dir based on SQLITE_FILE
- MCP server scaffold (stdio) with health resource
- Docs: testing guide updated to maps-only

## Planned work (near term)

1. MCP maps resources/tools

- maps.list, maps.get, maps.summary (read-only)

2. /maps polish

- If-None-Match on GET /maps/{id}
- Minimal migrations (schema_version), indexes
- Consistent camelCase API with snake_case in SQL

3. Error handling/documentation

- Typed errors; map zod errors into problem.errors[]
- OpenAPI updated with ProblemDetails schema and examples

4. Observability/operations

- Correlation IDs in problem details (optional)
- README ops notes (backups, WAL, graceful shutdown)

## Out of scope (for now)

- Authentication/authorization (beyond potential API key flag)
- Heavy ORMs or migration frameworks
- Large observability stacks

## How to run and test

- Dev: npm run dev
- Prod: npm start
- Quality: npm run validate (lint, format:check, tests)
- Manual testing: docs/testing-guide.md

## Notes for reviewers

- Maps API is production-oriented and enabled by default.
- Errors use Problem Details consistently.
- Keep routes thin; prefer service/repo boundaries and consistent mapping (DB ↔ API).
