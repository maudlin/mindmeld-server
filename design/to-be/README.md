# To-Be Architecture (Primary Source)

This folder is the authoritative plan for MindMeld Server going forward. It supersedes any patterns in the current repository unless explicitly retained.

Principles
- Small surface area first; scale the design only as needs emerge.
- Favor boring tech: Node.js + Express/Fastify, SQLite via better-sqlite3.
- Strong correctness via optimistic concurrency (version/ETag) without complexity.
- Keep HTTP API as the source of truth; add MCP as a thin adapter.
- Everything additive and reversible until adoption is confirmed.

Contents
- MVP_PLAN.md — verbatim plan from the prior discussion (source-of-truth for MVP goals)
- API.md — target HTTP API for maps
- DATABASE.md — SQLite schema and migration considerations
- DEPLOYMENT.md — runtime and operational guidance
- MERGE-STRATEGY.md — how we will (optionally) reconcile with existing code
- adr/ — Architecture Decision Records (drafts for confirmation)

Status
- Draft until ADRs are accepted. Current implementation may be discarded.
