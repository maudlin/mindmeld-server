# ADR 0002: Framework Choice — Express over Fastify, reject no-framework

Status: Accepted

Context
- We require a minimal, well-understood HTTP stack with low complexity and good ecosystem support.
- Alternatives considered: Fastify (slightly faster) and custom no-framework approach.

Decision
- Use Express as the web framework for the MVP and near-term roadmap.
- Do not pursue a no-framework approach to avoid re-implementing essential concerns (e.g., CORS, middleware pipeline) and increasing maintenance burden.

Consequences
- Minimal cognitive overhead; broad community knowledge and support.
- Performance is sufficient for the MVP; can optimize hot paths if needed later.
- Enables quick adoption of middleware and ecosystem tooling.

Rejected Alternatives
- Fastify: not chosen because the expected performance delta is not material in this context, and team familiarity favors Express.
- No framework: rejected due to overhead and risk of re-engineering basic HTTP concerns.
