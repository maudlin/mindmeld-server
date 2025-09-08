# MindMeld Server

A production-ready REST API for the MindMeld mind mapping application with integrated MCP (Model Context Protocol) support for AI assistants.

## Features

- 🗺️ **Maps-first API** with SQLite persistence (better-sqlite3)
- 🔒 **Optimistic concurrency** with ETag/If-Match on updates
- 🤖 **MCP Integration** for AI assistants (Warp, Claude Desktop, etc.)
- 📋 **RFC 7807 Problem Details** for structured error responses
- 🛡️ **Production hardening** with helmet, CORS, rate limiting
- 📊 **Structured logging** (pino + pino-http) with request IDs
- 🏗️ **Node 24 baseline** with ESLint, Prettier, Jest, Husky/lint-staged

## Quick start

Prerequisites

- Node 24 (see .nvmrc)
- npm 10+

Install and run (development)

```bash
npm install
npm run dev
```

Run (production)

```bash
npm start
```

Environment

- PORT (default: 3001)
- CORS_ORIGIN (default: http://localhost:8080)
- JSON_LIMIT (default: 50mb)
- SQLITE_FILE (default: ./data/db.sqlite)
- FEATURE_MAPS_API (default: true; set to 0/false to disable)

## API

Base URL: http://localhost:3001

- GET /health
  - Returns basic status and uptime
  - Response: { status, timestamp, uptime }

- GET /ready
  - Readiness probe (simple ok response)

- POST /maps
  - Create a map
  - Request body: { name: string, data: object }
  - Response: 201 Created, body includes { id, name, data, version?, updatedAt? }
  - Headers: ETag set for the created payload

- GET /maps/{id}
  - Fetch a map by id
  - Headers: ETag set for the current payload

- PUT /maps/{id}
  - Replace a map with optimistic concurrency
  - Headers: If-Match: "<etag>" (required)
  - Request body: { name?: string, data: object }
  - On ETag mismatch: 409 Conflict (Problem Details)

Errors (RFC 7807)

- Content-Type: application/problem+json
- Fields: type, title, status, detail, instance, errors[] (optional)

## Configuration

- CORS: configurable via CORS_ORIGIN
- JSON payload limit: JSON_LIMIT (default 50mb)
- SQLite file: SQLITE_FILE (default ./data/db.sqlite)
- Maps API: FEATURE_MAPS_API (default enabled)

## Observability

- Logging: pino + pino-http
  - Level: LOG_LEVEL (default debug in dev, info in prod)
  - Request log levels: 2xx/3xx info, 4xx warn, 5xx error
- Health and readiness endpoints: /health, /ready

## Docker

```dockerfile
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV SQLITE_FILE=/app/data/db.sqlite
RUN apk add --no-cache curl
COPY package*.json ./
RUN npm ci --omit=dev || npm ci
COPY src ./src
COPY docs ./docs
COPY design ./design
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:3001/health || exit 1
CMD ["npm", "start"]
```

Run

```bash
docker build -t mindmeld-server:local .
docker run --rm -p 3001:3001 \
  -e PORT=3001 \
  -e CORS_ORIGIN=http://localhost:3000 \
  -e SQLITE_FILE=/app/data/db.sqlite \
  -v "$(pwd)/data:/app/data" \
  mindmeld-server:local
```

## Development

Scripts

- npm run dev — start with auto-reload
- npm start — production start
- npm run test:e2e — Playwright E2E API tests
- npm run seed — create sample maps for testing
- npm run validate — lint + format:check + test
- npm test / npm run test:watch / npm run test:coverage

Project structure

```
src/
├── core/                 # Core routes and handlers (health/ready)
├── modules/
│   └── maps/             # Maps slice (db, repo, service, routes)
├── utils/                # logger, event-bus, etag helpers
├── factories/            # server-factory (composition)
└── index.js              # entrypoint
```

## MCP (Model Context Protocol) Integration

🤖 **AI Assistant Ready!** MindMeld server includes production-ready MCP support for AI assistants.

### Quick Start

```bash
# Start with MCP enabled
FEATURE_MCP=1 npm start

# Available at: http://localhost:3001/mcp/sse
```

### Available Operations

- 📋 **List maps** - "List my mind maps"
- 🔍 **Get map** - "Show me map details for [id]"
- ✏️ **Create map** - "Create a new mind map called 'Project'"
- 🗑️ **Delete map** - "Delete the map called 'Test'"
- ❤️ **Health check** - "Show server health status"

## Documentation

📚 **Comprehensive guides available in [`docs/`](docs/):**

- 🚀 **[Quick Start](docs/mcp-quick-start.md)** - 30-second MCP setup
- 🔧 **[Developer Guide](docs/mcp-developer-guide.md)** - Integration examples (Node.js, Python, etc.)
- 🖥️ **[Warp Configuration](docs/warp-mcp-config.md)** - Warp Terminal setup
- 🔗 **[Warp Integration](docs/warp-integration.md)** - Legacy Warp notes
- 📝 **[Development Todo](docs/todo.md)** - Project roadmap

## Contributing

1. **Fork** the repository
2. **Create** a feature branch
3. **Run tests**: `npm run validate`
4. **Submit** a pull request

## License

MIT
