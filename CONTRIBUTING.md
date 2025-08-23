# Contributing to MindMeld Server

Thanks for helping improve the MindMeld Server. This document outlines how we work so your contributions land smoothly and remain maintainable.

Quick start

- Prereqs: Node.js (see Node version policy below), npm, Git, SQLite tools (optional for local inspection)
- Install: npm install
- Dev: npm run dev
- Validate before PR: npm run validate (lint, format:check, unit tests, OpenAPI lint)

Repository goals

- Production-ready service for the MindMeld client
- Simple, observable, and testable modules
- Clear API surface and error semantics

Standards

- Language: Modern JS (ES2022+)
- Style: ESLint + Prettier
- Naming: camelCase for variables, functions, and JSON fields; PascalCase for classes
  - Exceptions: DB column names may be snake_case. Map to camelCase at boundaries.
- Modules: Keep files small and focused. Avoid circular dependencies.
- Errors: Throw typed errors in services, map to HTTP responses in handlers
- Logging: Use pino/pino-http; no console.log in production paths
- Security: Helmet, rate limiting, and validation via zod on all inputs
- API: RESTful routes, explicit version field for optimistic concurrency where applicable

Node, tests, and DB

- Node version policy:
  - Baseline: Node 20 LTS for local dev and CI (stable, broad ecosystem support)
  - Evaluation track: Node 24 for future adoption. Benefits include built-in test runner and stable WebSocket client. We will trial on a branch before switching the baseline.
- Test framework:
  - Jest (unit/integration) to stay consistent with the sister MindMeld client project.
  - We may add a small number of node:test suites during Node 24 evaluation, but Jest remains the standard for now.
- SQLite driver:
  - Default: better-sqlite3 (synchronous, native, reliable performance)
  - Alternative: pure-JS/wasm options (e.g., sql.js or @sqlite.org/sqlite-wasm) for environments where native builds are problematic
  - Experimental: If we adopt Node 24+ and a stable node:sqlite emerges, we may evaluate it. Not a default today.

Monorepo relationships

- Sister project: ../mindmeld (client)
- Keep developer experience familiar between repos: Jest, ESLint/Prettier, similar branching and PR process

Branching and commits

- Branch naming: feature/short-desc, fix/short-desc, chore/short-desc
- Commits: Conventional style recommended (feat:, fix:, chore:, docs:, test:, refactor:)
- PRs: Small, focused, descriptive title and body. Link to issues.

Pull request checklist

- Lint and format: npm run lint && npm run format:check
- Tests: npm test; add/update tests for new behavior
- API docs: Update OpenAPI when endpoints or shapes change (design/to-be/openapi.yaml)
- Security: No secrets in code; validate inputs with zod; consider rate limits for new routes
- Docs: Update README and docs as needed

Pre-commit and pre-push

- We use Husky + lint-staged. On staged files:
  - Prettier formatting
  - ESLint autofix for src/ and tests/
- On push: Run lint, format:check, unit tests, and spectral lint

How to run locally

- Env: copy .env.example to .env and fill values
- Start dev server: npm run dev
- API docs (dev-only): /docs (Redoc)

Testing

- Unit: npm test
- Coverage: npm run test:coverage
- Integration tests live in tests/integration

Coding patterns

- Services encapsulate business logic; repositories encapsulate DB access
- Express routes should be thin, validate inputs, call services, and translate errors to HTTP
- Feature flags may guard unfinished features

Error handling and HTTP mapping

- BadRequestError → 400
- NotFoundError → 404
- ConflictError (optimistic concurrency) → 409
- Unexpected errors → 500 and log with request correlation info

API naming guidance

- JSON field names are camelCase (e.g., updatedAt)
- If DB columns are snake_case (updated_at), translate at the repo/service boundary
- Avoid leaking persistence naming into API responses

Security and privacy

- Never log secrets or PII
- Validate all inputs with zod
- Default-deny CORS; explicitly configure allowed origins for deployments

Release process

- Semantic versioning via npm version (patch/minor/major)
- Maintainers perform releases after PR merge

Getting help

- See docs/ for architecture and developer guide
- Open an issue or ask in project discussions
