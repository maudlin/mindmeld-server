# Testing Guide

This guide covers all testing approaches for MindMeld Server:

- **Automated Testing**: Jest unit/integration tests and Playwright E2E API tests
- **Manual Testing**: Using curl, Postman/Bruno/Insomnia to test the Maps API
- **Development Testing**: Quick smoke tests and debugging

The server provides a Maps API (SQLite-backed) with optimistic concurrency via ETag/If-Match headers. The legacy /api/state endpoints have been removed.

## Automated Testing

### Jest Tests (Unit & Integration)

Run the comprehensive test suite:

```bash
# All tests
npm test

# Integration tests only
npm test -- tests/integration/

# Unit tests only
npm test -- tests/unit/

# With coverage
npm run test:coverage

# Watch mode (development)
npm run test:watch
```

**What's tested:**

- ✅ **Unit tests**: ETag utilities, service layer logic
- ✅ **Integration tests**: Full Maps API workflows with real SQLite database
- ✅ **Optimistic concurrency**: ETag/If-Match conflict detection
- ✅ **Error handling**: RFC 7807 problem details responses

### Playwright E2E API Tests

Run comprehensive end-to-end API testing with production-like HTTP requests:

```bash
# Run E2E API tests
npm run test:e2e

# View test report
npm run test:e2e:report
```

**What's tested:**

- ✅ **Complete CRUD workflows**: Create → Read → Update → Verify cycles
- ✅ **HTTP status codes & headers**: ETag, CORS, rate limiting validation
- ✅ **Conflict detection**: 409 responses with stale ETags
- ✅ **Error scenarios**: 404, 400, RFC 7807 problem details
- ✅ **Data persistence**: Updates correctly stored and retrieved

**Playwright Benefits:**

- 🚀 **Production-like requests** (real HTTP, not mocked)
- 🔄 **Built-in retry logic** and timeouts
- 📊 **HTML test reports** with request/response details
- ⚡ **Parallel execution** for faster CI/CD
- 🐛 **Better debugging** with trace collection

### Admin Command Tests

Test server administration commands and tools:

```bash
# Run admin command test suite
npm run test:admin

# Watch mode for admin tests
npm run test:admin:watch
```

**What's tested:**

- ✅ **Database backup**: Complete backup workflows, compression, verification
- ✅ **Health diagnostics**: All 8 health checks, timeout handling, output formats
- ✅ **Error resilience**: Graceful error handling and recovery scenarios
- ✅ **Performance**: Command execution timing and resource usage
- ✅ **CLI options**: All command-line interface options and help text

**Test Environment:**

- 🗄️ **Isolated test databases** (temporary SQLite files)
- 📁 **Temporary directories** for file operations
- 🧪 **AdminTestEnvironment class** for test setup/teardown
- 📋 **55+ comprehensive tests** per command

### Test Coverage

```bash
# Generate coverage report
npm run test:coverage

# View in browser
open coverage/lcov-report/index.html
```

## Prerequisites

- Node.js 24+ (see `.nvmrc`)
- npm 10+
- One of the following HTTP clients:
  - curl (CLI)
  - Postman or Insomnia (GUI)
- Optional: Docker (to run via container)

## Starting the server

You can run the server in development (with auto-reload) or production mode.

### 1) Configure environment

Copy `.env.example` to `.env` and adjust as needed. Common variables:

- `PORT` (default: `3001`)
- `CORS_ORIGIN` (default: `http://localhost:8080`)
- `JSON_LIMIT` (default: `50mb`)
- `SQLITE_FILE` (default: `./data/db.sqlite`)

Optional (for /maps vertical slice):

- `FEATURE_MAPS_API=1`
- `SQLITE_FILE=./data/db.sqlite`

### 2) Install dependencies

```bash
npm ci || npm install
```

### 3a) Run in development mode (auto-reload)

```bash
npm run dev
```

Logs show the server starting on the configured port (default 3001).

### 3b) Run in production mode

```bash
npm start
```

### 3c) Run using Docker (optional)

Build and run:

```bash
docker build -t mindmeld-server:local .
docker run --rm -p 3001:3001 \
  -e PORT=3001 \
  -e CORS_ORIGIN=http://localhost:3000 \
  -e FEATURE_MAPS_API=1 \
  -e SQLITE_FILE=/app/data/db.sqlite \
  -v "$(pwd)/data:/app/data" \
  mindmeld-server:local
```

The container exposes `/health` for health checks.

## Manual testing with curl

Replace `http://localhost:3001` with your server URL if different.

### Health

```bash
curl -s http://localhost:3001/health | jq .
```

Expected 200 OK with status and uptime.

### Maps API

- Create a map

```bash
curl -s -X POST http://localhost:3001/maps \
  -H 'Content-Type: application/json' \
  -d '{ "name": "My Map", "data": { "n": [{"i":"1","p":[100,100],"c":"Test note","cl":"blue"}], "c": [] } }' | jq .
```

- Read a map

```bash
curl -s http://localhost:3001/maps/<ID> | jq .
```

- Update a map with ETag

```bash
curl -i -s http://localhost:3001/maps/<ID> | grep -i etag
# Use the ETag value in If-Match
curl -s -X PUT http://localhost:3001/maps/<ID> \
  -H 'Content-Type: application/json' \
  -H 'If-Match: "<ETAG_FROM_READ>"' \
  -d '{ "data": { "n": [{"i":"1","p":[150,150],"c":"Updated note","cl":"green"}], "c": [] }, "version": 1 }' | jq .
```

### Error response format (RFC 7807)

Errors return `Content-Type: application/problem+json` and include standard fields: `type`, `title`, `status`, `detail`, `instance`, and optionally `errors[]` for validation details.

## Manual testing with Bruno/Postman/Insomnia

The flows below work in all tools. Replace the base URL if necessary.

### Collection setup (suggested)

- Create a collection called "MindMeld Server"
- Set a collection-level variable `baseUrl` to `http://localhost:3001`

### Requests

1. GET {{baseUrl}}/health

- Expect `status=ok` and `uptime`.

2. POST {{baseUrl}}/maps

- Headers: `Content-Type: application/json`
- Body:

```json
{
  "name": "My Map",
  "data": {
    "n": [{ "i": "1", "p": [100, 100], "c": "Initial note", "cl": "blue" }],
    "c": []
  }
}
```

- Expect 201 Created, response contains `id`. Capture response header `ETag` as `etag`.

3. GET {{baseUrl}}/maps/{{mapId}}

- Expect 200 and `ETag` header.

4. PUT {{baseUrl}}/maps/{{mapId}}

- Headers:
  - `Content-Type: application/json`
  - `If-Match: {{etag}}`
- Body:

```json
{
  "data": {
    "n": [
      { "i": "1", "p": [100, 100], "c": "Initial note", "cl": "blue" },
      { "i": "2", "p": [200, 200], "c": "Updated note", "cl": "green" }
    ],
    "c": [["1", "2", 1]]
  },
  "version": 1
}
```

- Expect 200. A second PUT with the old ETag should return 409 (Problem Details).

## Development Testing

### Quick Smoke Test

Run a built-in smoke test to verify basic functionality:

```bash
# Ensure server is running first
npm run dev &

# Run smoke test
npm run smoke

# Or manual smoke test
node manual-test.js
```

### Create Test Data

Populate the database with sample maps for testing:

```bash
npm run seed
```

This creates sample maps that can be used for client integration testing.

### Database Inspection

View the SQLite database directly:

```bash
# Install sqlite3 if needed
sudo apt-get install sqlite3  # Ubuntu/Debian
brew install sqlite3          # macOS

# Inspect database
sqlite3 data/db.sqlite
.tables
.schema maps
SELECT id, name, version FROM maps;
.quit
```

## Troubleshooting

- 404 Not Found: Verify the route and method; check base URL and port.
- 400 Invalid JSON: Ensure `Content-Type: application/json` and valid JSON body.
- 400 Invalid data: Ensure `n` (notes) and `c` (connections) are arrays in correct format.
- 409 Conflict: ETag mismatch - reload the map to get current ETag before updating.
- CORS issues: If testing from a browser app on a different port, set `CORS_ORIGIN` accordingly.
- Rate limiting: Server limits writes to 60 per minute - space out requests if hitting limits.
- Permissions: When using Docker with bind mounts, ensure the `/app/data` directory is writable by the `node` user.

## CI/CD Integration

### GitHub Actions Example

```yaml
- name: Run Tests
  run: |
    npm ci
    npm run validate  # lint + format + jest tests

- name: Start Server & Run E2E Tests
  run: |
    npm run dev &
    sleep 5  # Wait for server startup
    npm run test:e2e
```

### Test Scripts Reference

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:e2e": "playwright test",
    "test:e2e:report": "playwright show-report test-results/html",
    "validate": "npm run lint && npm run format:check && npm run test"
  }
}
```

## Appendix: Test Data Formats

### Mind Map Data Structure

```json
{
  "n": [
    {
      "i": "unique-id",      // Note ID
      "p": [x, y],          // Position [x, y]
      "c": "Note text",     // Content
      "cl": "color-name"    // Color (optional)
    }
  ],
  "c": [
    ["from-id", "to-id", connection-type]  // Connections
  ]
}
```

### Sample Test Data

```bash
# Create comprehensive test map
curl -X POST http://localhost:3001/maps \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Comprehensive Test",
    "data": {
      "n": [
        {"i":"1","p":[100,100],"c":"Central Idea","cl":"blue"},
        {"i":"2","p":[200,150],"c":"Branch A","cl":"green"},
        {"i":"3","p":[200,50],"c":"Branch B","cl":"red"}
      ],
      "c": [
        ["1","2",1],
        ["1","3",1]
      ]
    }
  }'
```
