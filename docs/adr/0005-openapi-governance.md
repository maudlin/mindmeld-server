# ADR 0005: OpenAPI governance

Date: 2025-08-23

Status: Accepted

Context

- We use OpenAPI as the source of truth for the to-be API.
- Spectral provides linting to catch style and consistency issues.

Decision

- Lint the spec with Spectral on validate and in CI.
- Enforce operation tags and camelCase naming for response/request bodies.
- Keep path-level parameters to a minimum; prefer operation-level parameters for clarity.
- Treat the spec as a contract; update tests/docs when the spec changes.

Consequences

- Early detection of API surface inconsistencies.
- Clear contract for clients and server.

Alternatives considered

- No linting: higher risk of drift and inconsistent API shape.
