# ADR 0003: Testing strategy

Date: 2025-08-23

Status: Accepted

Context

- We use Jest for tests and Supertest for HTTP assertions.
- We rely on better-sqlite3, which is fast for test use.

Decision

- Organize tests into tests/unit and tests/integration.
- Integration tests spin up the Express app without binding a port, using Supertest.
- Use a temporary SQLite file per test suite for isolation (clean up on teardown).
- Logger is set to 'silent' in tests to reduce noise.
- Optional: Add contract checks using jest-openapi against design/to-be/openapi.yaml.

Consequences

- Fast, isolated tests with high confidence in endpoints and behavior.
- Clear separation between unit and integration concerns.

Alternatives considered

- node:test: viable but Jest remains standard for parity with client repo.
- In-memory SQLite: acceptable but file-backed temp DB mirrors production behavior better.
