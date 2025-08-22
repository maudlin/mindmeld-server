# To-Be Deployment (Authoritative Draft)

- Single-region runtime, container optional (Docker)
- Node.js 18+
- Config via env vars: PORT, CORS_ORIGIN, SQLITE_FILE (or DATABASE_URL)
- Health checks for readiness/liveness
- Structured logging; optional metrics/tracing later
