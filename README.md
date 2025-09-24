# MindMeld Server

A production-ready REST API for the MindMeld mind mapping application with integrated MCP (Model Context Protocol) support for AI assistants.

## Features

- 🗺️ **Maps-first API** with SQLite persistence (better-sqlite3)
- 🔒 **Optimistic concurrency** with ETag/If-Match on updates
- 🤖 **MCP Integration** for AI assistants (Warp, Claude Desktop, etc.)
- 🔄 **Real-time Collaboration** with Y.js WebSocket integration for conflict-free collaborative editing
- 📱 **Client Provider Architecture** with LocalJSONProvider for offline-first browser applications
- 📋 **RFC 7807 Problem Details** for structured error responses
- 🛡️ **Production hardening** with helmet, CORS, rate limiting
- 📊 **Structured logging** (pino + pino-http) with request IDs
- ⚙️ **Comprehensive Admin Tools** with database backup/restore, data migration, and debug utilities
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

**Core Server:**

- PORT (default: 3001)
- CORS_ORIGIN (default: http://localhost:8080) - Flexible CORS with localhost/127.0.0.1 variants and HTTPS upgrades
- JSON_LIMIT (default: 50mb)
- LOG_LEVEL (default: debug in dev, info in prod)

**Data & Storage:**

- SQLITE_FILE (default: ./data/db.sqlite)
- STATE_FILE (default: ./data/state.json) - Legacy state file for MCP resource

**Feature Flags:**

- FEATURE_MAPS_API (default: true; set to 0/false to disable)
- FEATURE_MCP (default: false; set to 1/true to enable MCP protocol)

**Real-time Collaboration (Y.js):**

- SERVER_SYNC (default: off; set to 'on' to enable WebSocket collaboration)
- DATA_PROVIDER (default: json; set to 'yjs' for Y.js documents)

**MCP Protocol:**

- MCP_TOKEN (optional; authentication token for MCP clients)

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

- DELETE /maps/{id}
  - Delete a map by id
  - Response: 200 OK with { message: "Map {id} deleted successfully" }
  - On map not found: 404 Not Found (Problem Details)

Errors (RFC 7807)

- Content-Type: application/problem+json
- Fields: type, title, status, detail, instance, errors[] (optional)

## Real-time Collaboration

### Y.js WebSocket Integration

Enable real-time collaborative editing with WebSocket support:

```bash
# Enable WebSocket collaboration
SERVER_SYNC=on DATA_PROVIDER=yjs npm start

# WebSocket endpoint: ws://localhost:3001/yjs/{mapId}
```

**Features:**

- **Conflict-free Collaborative Editing**: Multiple users can edit simultaneously
- **Automatic Persistence**: Y.js documents saved to SQLite with snapshots
- **Real-time Synchronization**: Changes propagated instantly to all connected clients
- **Offline Support**: Local changes merged when reconnecting

**WebSocket API:**

```javascript
// Connect to collaborative document
const ws = new WebSocket(`ws://localhost:3001/yjs/${mapId}`);

// Y.js integration (client-side)
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const ydoc = new Y.Doc();
const provider = new WebsocketProvider('ws://localhost:3001/yjs', mapId, ydoc);
const yNotes = ydoc.getArray('notes');
const yConnections = ydoc.getArray('connections');
```

## Client Integration

### DataProvider Architecture

MindMeld includes a flexible client-side data provider system:

**LocalJSONProvider** - Offline-first browser storage:

```javascript
import { LocalJSONProvider } from './src/client/providers/LocalJSONProvider.js';

const provider = new LocalJSONProvider({
  storagePrefix: 'mindmeld_map_',
  maxMaps: 100,
  autosave: true
});

// Standard DataProvider interface
const data = await provider.load(mapId);
await provider.save(mapId, data);
const maps = await provider.list({ limit: 10 });
```

**DataProviderFactory** - Smart provider selection:

```javascript
import { DataProviderFactory } from './src/client/providers/DataProviderFactory.js';

// Automatically selects best provider (LocalJSON, Y.js, etc.)
const provider = DataProviderFactory.create({
  preferredProvider: 'yjs', // or 'json'
  fallbackProvider: 'json',
  serverUrl: 'http://localhost:3001'
});
```

See [Client Integration Guide](docs/client-integration.md) and [DataProvider Reference](docs/dataprovider-reference.md) for detailed documentation.

## Configuration

### CORS Configuration

Flexible origin support via `CORS_ORIGIN` environment variable:

- **Exact matching**: Configure specific origin (e.g., `http://localhost:3000`)
- **Localhost variants**: Automatic cross-resolution between `localhost` and `127.0.0.1` on same port
- **HTTPS upgrades**: Allows `https://` requests when config is `http://` for local development
- **No-origin requests**: Supports requests without Origin header (Postman, mobile apps)

```bash
# Examples - all work with CORS_ORIGIN=http://localhost:3000:
CORS_ORIGIN=http://localhost:3000    # Allows localhost:3000 AND 127.0.0.1:3000
CORS_ORIGIN=http://127.0.0.1:8080    # Allows 127.0.0.1:8080 AND localhost:8080
CORS_ORIGIN=http://localhost:3000    # Also allows https://localhost:3000
```

### Other Configuration

- **JSON payload limit**: JSON_LIMIT (default 50mb)
- **SQLite file**: SQLITE_FILE (default ./data/db.sqlite)
- **Maps API**: FEATURE_MAPS_API (default enabled)

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

Admin Commands

**Database Management:**

- npm run db:backup — create timestamped database backup with optional compression
- npm run db:restore — restore database from backup files

**Server Monitoring & Diagnostics:**

- npm run server:health:deep — comprehensive health diagnostics with detailed reporting

**Data Management & Migration:**

- npm run data:export — export maps data in JSON/CSV/SQL formats with filtering
- npm run data:import — import data with conflict resolution and validation
- npm run data:migrate — database schema migrations with version tracking
- npm run data:backup — advanced backup/restore with compression & encryption

**Development & Debug Tools:**

- npm run debug:config — inspect application configuration and validation
- npm run debug:endpoints — analyze and test API endpoints
- npm run debug:mcp — debug Model Context Protocol integration
- npm run debug:routes — examine Express.js routing structure
- npm run debug:system — system diagnostics and health checks

**Testing:**

- npm run test:admin — run admin command test suite

📋 _All admin commands support `--help` for detailed usage information_

Project structure

```
src/
├── client/               # Client-side provider architecture
│   ├── providers/        # Data provider implementations
│   │   ├── DataProviderInterface.js    # Base interface/contract
│   │   ├── DataProviderFactory.js     # Smart provider selection
│   │   └── LocalJSONProvider.js       # Browser localStorage provider
│   └── utils/            # Client utilities (hydration suppression)
├── config/               # Configuration management
├── core/                 # Core routes and handlers (health/ready)
├── data/                 # Data layer utilities
├── factories/            # server-factory (composition)
├── mcp/                  # Model Context Protocol implementation
├── modules/
│   ├── maps/             # Maps API (db, repo, service, routes)
│   └── yjs/              # Y.js WebSocket collaboration (db, persistence, routes, service)
├── services/             # Application services (state management)
├── utils/                # Shared utilities (logger, event-bus, etag)
└── index.js              # Application entrypoint

scripts/
└── admin/                # Admin commands and utilities
    ├── data-export.js    # Data export utilities
    ├── data-import.js    # Data import utilities
    ├── data-migrate.js   # Database migrations
    ├── data-backup.js    # Advanced backup/restore
    ├── debug-config.js   # Configuration debugging
    ├── debug-endpoints.js# API endpoint testing
    ├── debug-mcp.js      # MCP debugging tools
    ├── debug-routes.js   # Route introspection
    └── debug-system.js   # System diagnostics
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

- 🤖 **[MCP Client Integration](docs/mcp-client-integration.md)** - AI assistant integration for Warp, Claude Desktop
- 🌐 **[Client Integration Guide](docs/client-integration.md)** - REST API and DataProvider client integration patterns
- 📊 **[DataProvider Reference](docs/dataprovider-reference.md)** - Technical reference for client provider architecture
- 🔧 **[Developer Guide](docs/developer-guide.md)** - Development workflows and testing
- 🏗️ **[Architecture Guide](docs/architecture.md)** - System design and patterns
- 📝 **[Testing Guide](docs/testing-guide.md)** - Manual API testing workflows
- ⚙️ **[Server Administration](docs/server-admin.md)** - Database backup, health monitoring, and admin tools

## Contributing

1. **Fork** the repository
2. **Create** a feature branch
3. **Run tests**: `npm run validate`
4. **Submit** a pull request

## License

MIT
