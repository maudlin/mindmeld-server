# Developer Guide

This guide helps you set up, develop, test, and contribute to the MindMeld Server. It mirrors patterns from the sister client project while adapting to server needs.

Get started

- Prereqs: Node 20 LTS (baseline), npm, Git
- Clone and install: npm install
- Run dev server: npm run dev
- Validate: npm run validate (lint, format:check, unit tests, OpenAPI lint)

Node version strategy

- Baseline: Node 20 LTS for all contributors and CI
- Evaluation: Node 24 trial branch to explore built-in test runner and WebSocket client
- Switch criteria: green CI across platforms, dependency compatibility (including DB driver), and DX parity; if satisfied, we will update engines.node and CI to Node 24

Testing strategy

- Unit/integration: Jest (same as sister project)
- Coverage: npm run test:coverage
- E2E: Not applicable in this repo; API integration tests live under tests/integration
- Optional: When evaluating Node 24, we may add node:test suites alongside Jest (Jest remains canonical)

Database strategy

- Default: better-sqlite3 (fast, safe synchronous API)
- Fallbacks:
  - If native builds are problematic (e.g., Node 24 incompatibilities), pin Node to 20 in dev/CI
  - For constrained environments, consider sql.js or SQLite WASM (trade-offs in startup size and performance)
- Future: If Node introduces a stable built-in SQLite module, we will assess migration

API and service architecture

- Layers:
  - Routes: Express handlers; validate input, call services, map errors → HTTP
  - Services: Business logic, validation, concurrency control
  - Repos: DB access; translate between DB snake_case and API camelCase
- Conventions:
  - JSON fields: camelCase (updatedAt)
  - DB columns: snake_case (updated_at)
  - Optimistic concurrency: integer version field; update checks version
  - Errors: BadRequestError → 400, NotFoundError → 404, ConflictError → 409, others → 500

Project layout

- src/
  - factories/: server and logger factories
  - modules/: feature modules (e.g., maps)
  - routes/: express routers (mounted in server factory)
- tests/
  - unit/: unit tests
  - integration/: API-level tests
- design/
  - to-be/openapi.yaml: evolving API spec (linted by Spectral)
- docs/: architecture and contribution docs

Developer workflow

- Branch from main: git checkout -b feature/short-desc
- Code: follow ESLint rules; keep modules small and cohesive
- Validate: npm run validate
- Update docs: OpenAPI and README/docs for any behavior changes
- PR: small, focused, with tests and description of changes

Quality gates

- ESLint + Prettier: npm run lint, npm run format:check
- Tests: npm test
- OpenAPI: npm run openapi:lint
- Pre-push: Husky runs linting and tests to keep main green

Logging and observability

- pino/pino-http; structured logs with request id
- No console.log in production code paths

Security

- Input validation via zod for all request bodies and params
- Helmet, rate limiting, and CORS configured per environment
- No secrets in code; use environment variables and secure storage

Local tips

- API docs route (dev-only): GET /docs
- Initialize DB (if helper scripts available): npm run db:init
- Run a single test: npm test -- path/to/test

CI/CD

- CI runs lint, tests, spectral lint
- Engines and Node version are enforced in CI to ensure parity with local dev

Versioning and releases

- Semantic versioning; maintainers run releases

Appendix: resolving SQLite native build issues

- Symptom: better-sqlite3 fails to build on Node 24
- Options:
  1. Use Node 20 locally and in CI (preferred)
  2. Upgrade better-sqlite3 to a version compatible with Node 24 when available
  3. Use a pure JS/WASM SQLite temporarily for development
