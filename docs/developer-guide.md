# Developer Guide

This guide helps you set up, develop, test, and contribute to the MindMeld Server. It mirrors patterns from the sister client project while adapting to server needs.

Get started

- Prereqs: Node 24 LTS (baseline), npm, Git
- Clone and install: npm install
- Run dev server: npm run dev
- Validate: npm run validate (lint, format:check, unit tests)
- OpenAPI lint: npm run openapi:lint (separate command)

Node version strategy

- Baseline: Node 24 LTS for all contributors and CI
- Package.json engines: ">=24.0.0" enforced across development and production
- All dependencies including better-sqlite3 are compatible with Node 24

Testing strategy

- Unit/integration: Jest
- Coverage: npm run test:coverage
- E2E: Not applicable in this repo; API integration tests live under tests/integration
- Test directories: tests/unit/ and tests/integration/
- Additional test commands: npm run test:watch, npm run test:e2e

Database strategy

- Default: better-sqlite3 (fast, safe synchronous API)
- Compatible with Node 24 (current production version)
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
- Seed test data: npm run seed
- Environment check: node scripts/env-check.js
- Run a single test: npm test -- path/to/test

CI/CD

- CI runs lint, tests, spectral lint
- Engines and Node version are enforced in CI to ensure parity with local dev

Versioning and releases

- Semantic versioning; maintainers run releases

Additional utilities

- Smoke test: npm run smoke (validates server startup)
- MCP testing: npm run mcp:test (Model Context Protocol)
- Database seeding: npm run seed (create test data)
- Environment validation: node scripts/env-check.js
