# Context for Developers

This file captures the current state of the mindmeld-server and near-term TODOs, so new contributors can ramp quickly. For full docs, see CONTRIBUTING.md and docs/developer-guide.md.

Overview

- Purpose: HTTP API for MindMeld client state management and future /maps feature
- Status: Stable core API for file-based state; experimental /maps vertical slice behind a feature flag
- Baseline branch: main; work proceeds on short-lived feature branches (prefix by type or Jira key)

Runtime and dependencies

- Node: currently developing on Node 24.5.0; repo engines set to ">=18" (pending decision to pin)
- Web framework: Express 4
- Logging: pino, pino-http
- Validation: zod
- DB: better-sqlite3 ^12.2.0 (Node 24-compatible) for the /maps feature (feature-flagged)
- Tooling: ESLint, Prettier, Husky + lint-staged, Jest, Spectral (OpenAPI), Redoc (dev-only)

Key paths

- Server factory: src/factories/server-factory.js
- Core API routes: src/core/api-routes.js (file-based state)
- Middleware: src/core/middleware.js
- Config (planned centralization): src/config/config.js (validated via zod)
- Maps (to-be): src/modules/maps/\* (db, repo, service, routes)
- Tests: tests/unit/_, tests/integration/_
- OpenAPI (to-be): design/to-be/openapi.yaml

Feature flags

- featureMapsApi (boolean): when true, mounts /maps router (SQLite-backed). When false, route is absent.

Current decisions and conventions

- API JSON casing: camelCase (e.g., updatedAt). DB columns may be snake_case; translate at the repo/service boundary.
- Concurrency: integer version field with optimistic concurrency checks in /maps update flow.
- Errors: service layer throws typed errors; routes map to HTTP codes (400/404/409/500).
- ESLint rules: follows client project with a minor divergence to allow space before async arrow parens (asyncArrow: 'always').
- Tests: Jest remains canonical to match the sister client project.

Recent changes

- Pre-commit/CI:
  - Husky + lint-staged added; Spectral OpenAPI lint integrated
  - Dev-only API docs using Redoc at /docs
- Maps vertical slice (behind feature flag):
  - better-sqlite3 upgraded to ^12.2.0 for Node 24 support
  - Repos/services use camelCase in code (updatedAt/stateJson); SQL uses updated_at/state_json
  - Integration tests added for create/get/update/conflict
  - Zod schemas accept arbitrary object state via z.object({}).passthrough()
- ESLint/Prettier cleanup across codebase; tests and lints pass locally
- ETag utilities refactored; unit tests added; groundwork for If-Match/ETag consistency
- Error envelope normalization in progress (error -> message; optional code)
- pino-http logging: customLogLevel corrected; verifying levels and duplicate logs

Priorities and plan (lean, production-minded)

Top priorities (next):

- Logging correctness and signal-to-noise:
  - Ensure customLogLevel is respected; 2xx/3xx=info, 4xx=warn, 5xx=error; avoid duplicate request logs.
- Error response consistency:
  - Normalize to { message, code?, details? } in production; include stack only in development; update tests/OpenAPI.
- Config as a single source of truth:
  - Centralize env in src/config/config.js validated with zod; have server factory consume only this config.
- Graceful shutdown and resource lifecycle:
  - Handle SIGTERM/SIGINT; stop accepting new requests; flush logger; close SQLite; optional /ready endpoint.
- Maps error handling alignment:
  - Map typed errors to consistent payloads; include minimal codes (e.g., MAP_NOT_FOUND, VERSION_CONFLICT).

Near-term improvements:

- API versioning shim:
  - Mount maps at /api/v1/maps; keep /maps as alias; document deprecation.
- Read caching:
  - Support If-None-Match on GET /maps/:id to return 304.
- Migrations hygiene:
  - Add schema_version table and tiny linear migration runner at startup (synchronous).
- Transitional field deprecation:
  - Keep dual fields during transition; document removal timeline.
- Focused unit tests:
  - Add conflict-path test for If-Match vs version fallback.

What we will not add right now (to stay lean):

- No heavy auth (optional API key only, feature-flagged if needed).
- No ORM or external migration framework.
- No big observability stack; health + minimal logs are enough.
- No additional rate-limiting complexity.

Open questions / decisions pending

1. Node baseline

- Option A: Pin to Node 20 LTS (safer ecosystem, matches wider tooling)
- Option B: Stay on Node 24 (built-in test runner and WebSocket client; workable since better-sqlite3 12.2.0 is compatible)
- Current: Using Node 24 locally; engines still ">=18". If we choose A or B, update engines and CI accordingly.

2. Database direction for /maps

- Current: better-sqlite3 (native).
- Alternatives: pure JS/WASM (sql.js, @sqlite.org/sqlite-wasm) for environments where native builds are constrained.
- Future: revisit if a first-party Node SQLite emerges.

3. OpenAPI coverage

- /maps endpoints are to-be; spec updates are needed to reflect current request/response shapes (camelCase fields, versioning).

4. WebSocket usage

- Node 24 has built-in WebSocket client; evaluate if/when server-side or client-server live updates become a requirement.

Short-term TODOs

- Decide Node baseline (22 LTS vs 24) and update package.json engines + CI runtime matrix
- Centralize config in src/config/config.js with zod; route all consumers through it
- Finalize /maps API contract and update design/to-be/openapi.yaml; add Spectral rules
- Implement If-None-Match on GET /api/v1/maps/:id; return 304 when matched
- Add a minimal migrations runner and schema_version table; add indexes as needed (e.g., name, updated_at)
- Align error payloads across routes and middleware; update tests and OpenAPI examples
- Confirm CORS origins; document ops (SQLite backups, WAL, shutdown); add graceful shutdown hooks
- Add unit tests for ETag/If-Match conflict path and logging level classification

How to work locally

- Install dependencies: npm install
- Run dev server: npm run dev
- Run checks: npm run validate (lint, format:check, tests)
- Lint OpenAPI: npm run openapi:lint (spec at design/to-be/openapi.yaml)
- Dev-only docs: GET /docs
- Enable /maps in tests or dev by setting featureMapsApi: true (server factory config) and providing sqliteFile

Notes for reviewers

- The /maps API is isolated behind a flag and uses updatedAt in JSON. Client may need mapping if it expects snake_case.
- Large refactors should maintain thin routes, service encapsulation, and repo boundary mapping (DB ↔ API).
