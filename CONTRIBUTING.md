# Contributing to MindMeld Server

Thanks for helping improve the MindMeld Server. This guide aligns with our sibling project (../mindmeld) and documents how to develop, test, and submit changes that pass the same checks as CI.

## Quick start

- Requirements: Node.js ≥ 24, npm, Git
- Install: `npm install`
- Develop: `npm run dev` (or `npm start`)
- Run local checks (mirror CI):

```bash
npm run lint
npm run format:check
npm run openapi:lint
npm test -- --ci --reporters=default
```

Tip: `npm run validate` runs a subset (lint + format:check + jest).

## Repository goals

- Production-ready service for the MindMeld client
- Small, observable, testable modules
- Clear API surface and error semantics

## Standards

- Language: Modern JS (ES2022+)
- Style: ESLint + Prettier
- Naming: camelCase for variables/functions/JSON; PascalCase for classes
  - DB columns may be snake_case; convert to camelCase at boundaries
- Modules: Keep files focused; avoid circular dependencies
- Errors: Throw typed errors in services; map to HTTP in routes
- Logging: pino/pino-http; avoid console.log in prod paths
- API: RESTful; ETag/If-Match and versioning for optimistic concurrency

## Node, tests, and DB

- Node baseline: Node 24 (engines and CI)
- Tests: Jest for unit and integration (supertest for HTTP)
- SQLite: better-sqlite3 by default; schema created on startup. The server defaults SQLite path to `./data/db.sqlite` when not provided.

## CI

GitHub Actions workflow “CI” runs on pushes and PRs with Node 24:

- `npm ci`
- `npm run lint`
- `npm run format:check`
- `npm run openapi:lint`
- `npm test -- --ci --reporters=default`
- `npm run test:coverage`

Please keep local checks green before opening a PR.

## Pre-commit hooks (Husky v10)

This repo uses Husky to run CI‑equivalent checks before every commit:

- lint-staged (Prettier and ESLint fix on staged files)
- `npm run lint`
- `npm run format:check`
- `npm run openapi:lint`
- `npm test -- --ci --reporters=default`

Hooks install via `postinstall`. If needed, re-init with `npx husky init`.

## Branching, commits, and PRs

- Always raise a PR to merge into main (do not push directly to main).
- If working on a Jira ticket, include the ticket ID in the branch name.
  - Examples:
    - `feat/PROJ-1234-remove-legacy-state`
    - `fix/PROJ-5678-db-path-default`
- Commit messages: Conventional style recommended (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`).
- PRs: Small and focused. In the description, state what changed, why, and how it was tested.

## Testing

- Unit tests: `tests/unit/`
- Integration tests: `tests/integration/` (e.g., `/maps` API with ETag/If-Match)
- Run all tests: `npm test`
- Coverage: `npm run test:coverage`

## OpenAPI

- Spec lives at `design/to-be/openapi.yaml`
- Lint with Spectral: `npm run openapi:lint`

## Coding patterns

- Services encapsulate business logic; repositories encapsulate DB access
- Routes are thin: validate input, call services, translate errors to HTTP
- Prefer feature flags to guard unfinished work

## Error handling and HTTP mapping

- BadRequestError → 400
- NotFoundError → 404
- ConflictError (optimistic concurrency) → 409
- Unexpected errors → 500 (log with correlation info)

## Security and privacy

- Never commit secrets or log PII
- Validate all inputs with zod
- CORS: allowlist explicit origins per environment

## Getting help

See code in `src/` and tests under `tests/` for examples. For questions, open an issue or a draft PR. Thanks for contributing! 🚀
