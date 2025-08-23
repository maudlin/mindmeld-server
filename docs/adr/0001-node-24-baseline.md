# ADR 0001: Node 24.x as runtime baseline

Date: 2025-08-23

Status: Accepted

Context

- We upgraded better-sqlite3 to ^12.2.0 for Node 24 compatibility.
- Local development and CI both target Node 24.
- Modern Node features (built-in test runner, stable WebSocket client) are available in 24.x.

Decision

- Set engines.node to ">=24 <25" and use Node 24 in CI.
- Prefer prebuilt native modules compatible with Node 24.

Consequences

- Contributors should use Node 24.x (provide .nvmrc for convenience).
- If a dependency breaks on Node 24, pin a compatible version or temporarily test Node 20 in CI as a secondary matrix until resolved.

Alternatives considered

- Stay on Node 20 LTS only: simpler ecosystem compatibility but blocks modern features and compatibility with newer native modules.
