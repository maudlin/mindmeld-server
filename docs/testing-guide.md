# Testing Guide

This guide explains how to manually test MindMeld Server using curl, Postman/Bruno/Insomnia. It covers starting the server and exercising the /maps API (SQLite-backed), plus health checks. The legacy /api/state endpoints have been removed.

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
- `STATE_FILE_PATH` (default: `./data/state.json`)
- `JSON_LIMIT` (default: `50mb`)

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
  -e STATE_FILE_PATH=/app/data/state.json \
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

Expected 200 OK with status, uptime, and stats.

### Maps API

- Create a map

```bash
curl -s -X POST http://localhost:3001/maps \
  -H 'Content-Type: application/json' \
  -d '{ "name": "My Map", "data": { "notes": [{"id":"1","content":"Test"}], "connections": [], "zoomLevel": 5 } }' | jq .
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
  -d '{ "name": "My Map v2", "data": { "notes": [{"id":"1","content":"Test"}], "connections": [], "zoomLevel": 6 } }' | jq .
```

### Error response format (RFC 7807)

Errors return `Content-Type: application/problem+json` and include:

```json
{
  "type": "https://mindmeld.dev/problems/invalid-state",
  "title": "Invalid state",
  "status": 400,
  "detail": "State must have notes array, State must have connections array",
  "instance": "/api/state",
  "errors": [{ "path": "notes", "message": "must be an array" }]
}
```

## Manual testing with Postman/Insomnia

The flows below work in both tools. Replace the base URL if necessary.

### Collection setup (suggested)

- Create a collection called "MindMeld Server"
- Set a collection-level variable `baseUrl` to `http://localhost:3001`

### Requests

1. GET {{baseUrl}}/health

- Tests: expect `status` to be `ok` and `stats` object present.

2. GET {{baseUrl}}/api/state

- Tests: expect empty state when no file exists; after saving, expect saved content.

3. PUT {{baseUrl}}/api/state

- Headers: `Content-Type: application/json`
- Body (raw JSON):

```json
{
  "notes": [{ "id": "1", "content": "Test" }],
  "connections": [],
  "zoomLevel": 5
}
```

- Tests: expect 200 with `success: true` payload.

4. PUT {{baseUrl}}/api/state (invalid)

- Headers: `Content-Type: application/json`
- Body (raw JSON):

```json
{
  "connections": [],
  "zoomLevel": 5
}
```

- Tests: expect 400 with Problem Details (title/status/detail).

5. GET {{baseUrl}}/api/state/stats

- Tests: expect `notesCount`, `connectionsCount`, `isEmpty`.

Enable the feature flag and point to a writable database file:

```bash
export FEATURE_MAPS_API=1
export SQLITE_FILE=./data/db.sqlite
npm run dev
```

### Create (POST /maps)

```bash
curl -s -X POST http://localhost:3001/maps \
  -H 'Content-Type: application/json' \
  -d '{ "name": "My Map", "data": { "nodes": [] } }' | jq .
```

Response includes `id`, `etag`, `version`, `updatedAt`.

### Read (GET /maps/{id})

```bash
curl -s http://localhost:3001/maps/<ID> | jq .
```

### Update with ETag concurrency (PUT /maps/{id})

1. Read the map and copy the ETag from the response headers or body.
2. Send an update with `If-Match: "<etag>"` header:

```bash
curl -s -X PUT http://localhost:3001/maps/<ID> \
  -H 'Content-Type: application/json' \
  -H 'If-Match: "<ETAG_FROM_READ>"' \
  -d '{ "name": "My Map v2", "data": { "nodes": [ {"id": 1} ] } }' | jq .
```

3. Try updating again with the stale ETag to confirm a 409 Conflict is returned.

Expected 409 with `application/problem+json` body (type `conflict`).

## Troubleshooting

- 404 Not Found: Verify the route and method; check base URL and port.
- 400 Invalid JSON: Ensure `Content-Type: application/json` and valid JSON body.
- 400 Invalid state: Ensure `notes` and `connections` are arrays and `zoomLevel` is a number.
- CORS issues: If testing from a browser app on a different port, set `CORS_ORIGIN` accordingly.
- Permissions: When using Docker with bind mounts, ensure the `/app/data` directory is writable by the `node` user.

## Appendix: Quick smoke script

Run a small smoke test with curl:

```bash
# Health
curl -s http://localhost:3001/health | jq .

# Create map
MAP=$(curl -s -X POST http://localhost:3001/maps \
  -H 'Content-Type: application/json' \
  -d '{"name":"Smoke","data":{"notes":[],"connections":[],"zoomLevel":1}}')
ID=$(echo "$MAP" | jq -r .id)

# Read map
curl -s http://localhost:3001/maps/$ID | jq .
```
