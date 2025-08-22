# MVP Plan (verbatim from discussion)

1) Minimal client⇄server flow (MVP)

Goal: your existing client (HTML/CSS/JS) can save/load a “map” to a server with very low complexity.

Stack (boring & common):

Server: Node.js (or Bun) + Fastify/Express (pick one)

Storage: SQLite (file-based) via better-sqlite3 (zero-ops, fast, safe).

If you prefer a managed option later: PostgreSQL; or Cloudflare D1 for edge.

Deploy: single region on Render/Railway/Fly.io/Vercel. Docker optional.

Data model (simple):

maps(id TEXT pk, name TEXT, updated_at TEXT, version INTEGER, state_json JSON)

version supports optimistic concurrency; state_json stores your current JSON exactly as-is.

HTTP API (rudimentary):

GET /maps → list maps for a picker (id, name, updated_at; avoid shipping full state here)

POST /maps → create; body: {name, state} → returns {id, version, updated_at}

GET /maps/:id → fetch {id, name, state, version, updated_at}

PUT /maps/:id → replace state; body: {state, version} (server checks optimistic lock)

PATCH /maps/:id/meta → rename map (optional)

DELETE /maps/:id (optional)

Headers for concurrency (optional but nice):

Server returns ETag (hash or version).

Client sends If-Match: <ETag> on write. Server 409/412 if mismatch.

Why this is “low-latency enough” now:

SQLite is in-process, extremely fast for single-node writes; your request path is ~1 hop (client→server).

You can add an in-memory cache (e.g., LRU) keyed by id with 30–120s TTL for hot reads.

Client changes (tiny):

Replace your current “export/import” buttons with calls to:

Save: PUT /maps/:id (or create via POST /maps)

Load: GET /maps/:id

Build a barebones picker: call GET /maps, render a simple list, click to load.

Offline-friendly (optional, later):

Keep using localStorage as a write-through cache.

Add a Service Worker with Background Sync to flush pending writes when online.

2) Concurrency & collaboration (keep it simple first)

Phase 1 (simplest): Single-author at a time, optimistic locking with version/ETag. If a user saves and the server’s version has moved, return 409/412 and let the client prompt “Reload or Merge.”

Phase 2 (light multi-user): Server sends Server-Sent Events (SSE) or WebSocket updates for map:updated. Clients can then refresh or diff.

Phase 3 (true real-time): Consider a CRDT (e.g., Yjs/Automerge). Only do this if you genuinely need Google-Docs-style live editing; it adds complexity.

3) Security (defer, but don’t paint yourself into a corner)

CORS: allow only your app origin.

CSRF: not critical if you’re not using browser cookies; if you do, add CSRF tokens or SameSite=strict.

Auth later: bearer tokens or session cookies via OIDC provider. Keep your API paths stable.

4) MCP (Model Context Protocol) exposure

You want LLMs to query maps via MCP. Keep the HTTP API above as the source of truth. Add a thin MCP server (separate process or same repo) that adapts your HTTP/database layer into MCP resources and tools.

MCP shape (TypeScript, using a standard MCP SDK):

Resources (read-oriented):

resource:map-list → lists maps (id, name, updated_at)

resource:map/<id> → returns full {id, name, version, state}

Tools (write / query actions):

tool:get_map (args: id) → returns state

tool:save_map (args: id, state, version?) → writes with optimistic locking

tool:search_maps (args: query) → simple text match on name (and optionally within state if you index later)

URIs: define a custom scheme like maps://<id>. MCP clients can readResource or call callTool.

Auth for MCP: start unauthenticated on localhost; plan to require an API key or OIDC token when remote.

Why separate MCP from HTTP?

Keeps your web client stable.

MCP becomes an integration façade for agents/LLMs without leaking web concerns.

You can host MCP alongside the API or as a dev-only companion app.

5) Data & schema considerations

Schema versioning: add schema_version in state_json or as a top-level column so you can migrate client data later.

Backups: for SQLite, take periodic file snapshots; for Postgres, use built-in backups.

Indexing: if you later need “search this map by content,” add a derived maps_index table or use SQLite FTS5 to index fields extracted from your JSON.

6) Performance & scaling path (only when needed)

Single node (SQLite) → very fast for your MVP.

Add caching: in-memory LRU for reads; short TTL.

Move to Postgres if writes/reads go heavy or you need HA.

Edge: If users are global and latency matters, put a read cache at the edge (Cloudflare) and keep writes in-region; or move to Workers + D1 when ready.

WebSockets for change notifications if/when collaboration increases.

7) Concrete “first sprint” checklist

✅ Spin up Fastify/Express server with routes above.

✅ Create maps table with id (UUID), name, version (int), updated_at (ISO), state_json (JSON).

✅ Implement ETag/If-Match or version-based optimistic locking.

✅ Add CORS for your app origin.

✅ Update client: small picker (list→click→load), save button → PUT /maps/:id.

✅ Add basic logging and a daily SQLite backup.

🔜 Create a separate MCP adapter exposing resource:map-list, resource:map/<id>, and tool:get_map / tool:save_map.

TL;DR

Start with Node + SQLite + tiny REST API.

Use optimistic locking for correctness without complexity.

Keep the picker simple with GET /maps.

Add a small MCP server that wraps your API as resources/tools so LLMs can read & write maps.

Defer auth and real-time until you actually need them; you won’t have to undo anything later.
