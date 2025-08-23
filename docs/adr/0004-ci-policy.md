# ADR 0004: CI policy

Date: 2025-08-23

Status: Accepted

Context

- CI should validate code quality and API docs consistently with local development.

Decision

- CI runs on push and PR for main and integration/\* branches.
- Steps:
  1. Setup Node 24 with npm cache
  2. npm ci
  3. Lint (ESLint)
  4. Prettier format check
  5. OpenAPI lint (Spectral)
  6. Tests (Jest)
- Optionally add a Node matrix (20, 24) if we need dual support.

Consequences

- Aligns CI with engines and local environment, reducing "works on my machine" issues.

Alternatives considered

- Keep Node 20 only: diverges from engines and local setup.
