# Testing Guide

This guide explains how to manually test MindMeld Server using curl, Postman/Bruno/Insomnia. It covers starting the server and exercising the /maps API (SQLite-backed), plus health checks. The legacy /api/state endpoints have been removed.

## Prerequisites

Before manual testing, ensure the server is running. See [Developer Guide](developer-guide.md) for setup details.

HTTP clients for testing:

- curl (CLI)
- Postman, Bruno, or Insomnia (GUI)
- Optional: Docker for containerized testing

## Server Setup

For server setup and configuration, see the [Developer Guide](developer-guide.md#get-started).

Quick start for testing:

```bash
npm install
npm run dev  # Starts server on http://localhost:3001
```

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
  "data": { "notes": [], "connections": [], "zoomLevel": 1 }
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
  "name": "My Map v2",
  "data": { "notes": [], "connections": [], "zoomLevel": 2 }
}
```

- Expect 200. A second PUT with the old ETag should return 409 (Problem Details).

## Automated Testing

For automated tests (unit/integration), see the [Developer Guide](developer-guide.md#testing-strategy). Run tests with:

```bash
npm test              # All tests
npm run test:coverage # With coverage
npm run test:watch    # Watch mode
```

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
