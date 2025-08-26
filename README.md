# MindMeld Server

Production-ready Express.js server for MindMeld mind mapping application, built following MindMeld client standards.

> Status: Active redesign in progress
>
> We’re migrating to an MVP that manages per-map resources via a /maps API backed by SQLite (better-sqlite3) with optimistic concurrency. The current implementation still serves a single global state and file storage. See:
>
> - To-be architecture: design/to-be/README.md
> - To-be OpenAPI: design/to-be/openapi.yaml
> - ADRs: design/to-be/adr/
> - Merge strategy: design/to-be/MERGE-STRATEGY.md

## Features

- **Event-Driven Architecture**: Central event bus with "noun.verb" event naming
- **Service Layer Pattern**: Clean separation with dependency injection
- **Atomic Writes**: Prevents state corruption during concurrent saves
- **Comprehensive Validation**: State structure and content validation
- **Production Ready**: ESLint, Prettier, Jest testing, graceful shutdown
- **Monitoring**: Health checks, statistics, and detailed logging
- **CORS Enabled**: Ready for frontend integration

## Quick Start

Minimal setup for Maps API (early production):

- Node version: see .nvmrc (Node 24)
- Enable maps API: FEATURE_MAPS_API=1
- SQLite file path: SQLITE_FILE=./data/maps.sqlite
- Seed sample maps: npm run seed

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Start server**:

   ```bash
   npm start
   ```

3. **Development mode** (auto-reload):

   ```bash
   npm run dev
   ```

4. **Run tests**:

   ```bash
   npm test
   ```

5. **Code quality**:
   ```bash
   npm run validate  # lint + format + test
   ```

## API

### As-Is API (current code)

See design/as-is/openapi.yaml for full spec.

### GET /health

Returns server status, uptime, and state statistics.

**Response**:

```json
{
  "status": "ok",
  "timestamp": "2025-07-31T17:45:23.456Z",
  "uptime": 12.345,
  "stats": {
    "notesCount": 5,
    "connectionsCount": 3,
    "zoomLevel": 5,
    "isEmpty": false
  }
}
```

### GET /api/state

Returns current mind map state. Returns empty state if no data exists.

**Response**:

```json
{
  "notes": [{ "id": "1", "content": "Note 1", "left": "100px", "top": "50px" }],
  "connections": [{ "from": "1", "to": "2" }],
  "zoomLevel": 5
}
```

### PUT /api/state

Saves mind map state with validation and atomic writes.

**Request Body**: JSON state object  
**Response**:

```json
{
  "success": true,
  "timestamp": "2025-07-31T17:45:23.456Z",
  "notes": 5,
  "connections": 3,
  "zoomLevel": 3
}
```

### GET /api/state/stats

Returns state statistics for monitoring.

**Response**:

```json
{
  "notesCount": 5,
  "connectionsCount": 3,
  "zoomLevel": 5,
  "isEmpty": false
}
```

### Planned API (to-be)

- GET /maps
- POST /maps
- GET /maps/{id}
- PUT /maps/{id} (with version or If-Match)
- PATCH /maps/{id}/meta
- DELETE /maps/{id}

See design/to-be/openapi.yaml for the draft spec.

## Architecture

### Project Structure

```
src/
├── core/           # Core application logic
│   ├── api-routes.js      # RESTful API endpoints
│   └── middleware.js      # Express middleware configuration
├── services/       # Business logic layer
│   └── state-service.js   # State management and validation
├── data/          # Data persistence layer
│   └── file-storage.js    # Atomic file operations
├── utils/         # Utility functions
│   ├── logger.js          # Centralized logging
│   └── event-bus.js       # Event-driven architecture
├── factories/     # Configuration factories
│   └── server-factory.js  # Server creation with DI
└── index.js       # Main entry point

tests/
├── integration/   # API integration tests
├── unit/         # Unit tests for services
└── setup.js      # Test configuration

docs/             # Documentation
data/             # State storage (created at runtime)
```

### Event System

The server uses an event-driven architecture with standardized event naming:

```javascript
// State events
eventBus.emit('state.saving', { notesCount: 5 });
eventBus.emit('state.saved', { success: true, stats });
eventBus.emit('state.error', { operation: 'save', error });

// Request events
eventBus.emit('request.started', { method: 'PUT', path: '/api/state' });
eventBus.emit('request.completed', { statusCode: 200, duration: 45 });

// Health events
eventBus.emit('health.checked', { healthy: true, stats });
```

## Configuration

Environment variables:

### As-Is (file storage)

- `PORT` - Server port (default: 3001)
- `CORS_ORIGIN` - CORS origin (default: http://localhost:8080)
- `STATE_FILE_PATH` - State file location (default: ./data/state.json)
- `JSON_LIMIT` - Max JSON payload size (default: 50mb)
- `NODE_ENV` - Environment (development/production)

### Planned (SQLite)

- `SQLITE_FILE` - SQLite database file path (or use `DATABASE_URL`)
- `PORT` - Server port (default: 3001)
- `CORS_ORIGIN` - CORS origin (default: http://localhost:8080)
- `JSON_LIMIT` - Max JSON payload size (default: 50mb)
- `NODE_ENV` - Environment (development/production)

Notes: planned implementation uses SQLite in WAL mode with transactional writes and optimistic concurrency (version/ETag).

### Development

- Pre-commit hooks run lint/format on staged files; on first install, husky is set up automatically.
- CI runs lint, format check, tests, and OpenAPI lint on PRs.
- Dev-only API docs are available at /docs (served via Redoc) when NODE_ENV != production.

### Scripts

- `npm start` - Start production server
- `npm run dev` - Development mode with auto-reload
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier
- `npm test` - Run Jest tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Generate coverage report
- `npm run validate` - Run all quality checks

### Code Standards

- **ESLint**: Enforces MindMeld coding standards
- **Prettier**: Consistent code formatting
- **Jest**: Unit and integration testing
- **Naming**: camelCase functions, PascalCase classes, UPPER_SNAKE_CASE constants
- **Events**: "noun.verb" format (e.g., "state.saved")

## Testing

### Test Types

- **Unit Tests**: Business logic and validation (`tests/unit/`)
- **Integration Tests**: Full API endpoints (`tests/integration/`)
- **Coverage**: Comprehensive test coverage reporting

### Running Tests

```bash
npm test                # Run all tests
npm run test:watch      # Watch mode for development
npm run test:coverage   # Generate coverage report
VERBOSE=true npm test   # Enable console logging
```

## Production Deployment

### Features

- **Graceful Shutdown**: Handles SIGTERM/SIGINT signals
- **Error Handling**: Global uncaught exception handling
- **Process Management**: Ready for PM2, Docker, or systemd
- **Health Monitoring**: `/health` endpoint for load balancers
- **Structured Logging**: JSON logs with correlation IDs

### Docker Example

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
EXPOSE 3001
CMD ["npm", "start"]
```

## Technical Notes

- **Node.js**: Requires Node.js 18+
- **Atomic Writes**: Uses temporary files to prevent corruption
- **State Validation**: Comprehensive validation of notes and connections
- **CORS**: Configurable origin support
- **File Storage**: Automatic data directory creation
- **Event Bus**: Singleton event emitter for loose coupling

## Related Projects

- **MindMeld Client**: https://github.com/maudlin/mindmeld
- **Developer Guide**: https://github.com/maudlin/mindmeld/blob/main/docs/developer-guide.md

## Project Context

Part of MS-14 (Technical Proof of Concept) - validates core client-server integration patterns before full MindMeld implementation. This server provides the backend foundation for the MindMeld mind mapping application.

## Using VS Code Dev Containers (optional)

This repository includes a Dev Container configuration for a fast, consistent local setup.

Prerequisites:

- VS Code
- Dev Containers extension (ms-vscode-remote.remote-containers)
- Docker Desktop or compatible Docker engine

How to use:

1. Open the repository in VS Code
2. Run: “Dev Containers: Reopen in Container”
3. The container will:
   - Use a Node 18 base image (per .devcontainer/devcontainer.json)
   - Install sqlite3 CLI and curl
   - Run `npm ci` automatically (falls back to `npm install`)
4. Start the server: `npm run dev` (port 3001 is forwarded)
5. Debug in VS Code: use the “Launch MindMeld Server” configuration

Environment:

- Copy `.env.example` to `.env` and adjust as needed
- Key vars: `PORT`, `CORS_ORIGIN`, `STATE_FILE_PATH`
- To enable the /maps API (SQLite vertical slice): set `FEATURE_MAPS_API=1` and `SQLITE_FILE=./data/db.sqlite`

Notes:

- The production Dockerfile uses a non-root user and sets `SQLITE_FILE=/app/data/db.sqlite`
- The Dev Container is intended for development only; CI runs on GitHub Actions without containers
