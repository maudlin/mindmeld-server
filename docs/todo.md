# MindMeld ↔ MindMeld Server: Minimal v1 Connectivity Plan

## 1. Canonical JSON Payload

Use the existing export/import format as the contract:

```json
{
  "data": {
    "n": [{ "i": "1", "p": [100, 200], "c": "Note content", "cl": "pink" }],
    "c": [["1", "2", 1]]
  }
}
```

- `n`: Notes array
- `c`: Connections array
- Store and serve this blob as-is.
- Avoid reshaping so client ↔ server remain decoupled.

---

## 2. Minimal API Surface

Four endpoints to start:

- **POST `/maps`** — create a new map  
  **Body**: canonical JSON  
  **Response**: `201` with `{ id, version, updatedAt }` and `ETag: "<hash>"`

- **GET `/maps`** — list maps for a picker  
  **Response**: `200` with an array of `{ id, name?, version, updatedAt, size? }`

- **GET `/maps/:id`** — load a map  
  **Response**: `200` with `{ id, version, updatedAt, data: {...} }` and `ETag: "<hash>"`

- **PUT `/maps/:id`** — save entire map  
  **Headers**: `If-Match: <ETag>` (optional at first)  
  **Body**: canonical JSON  
  **Response**: `200` with `{ id, version, updatedAt }` and new `ETag`

### Status Codes

- `200/201` success
- `400` bad JSON
- `404` map not found
- `409` version conflict (wrong `If-Match`)
- `413` payload too large
- `5xx` unexpected error

---

## 3. Server Internals

### SQLite Schema

```sql
CREATE TABLE maps (
  id TEXT PRIMARY KEY,
  name TEXT NULL,
  version INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  data TEXT NOT NULL,
  size_bytes INTEGER NOT NULL
);
```

- Use WAL mode.
- `etag = sha256(data)`.
- `version` = monotonically increasing int.
- Return both `version` and `ETag` on every response.

### Validation

- Ensure `data.n` is array of notes `{ i, p, c, cl? }`.
- Ensure `data.c` is array of `[from, to, type]`.

### CORS

- Allow `http://localhost:8080` and production domain.

---

## 4. Client Integration

Create a `PersistenceService` with methods:

1.  `listMaps()`
2.  `createMap({ name?, data })`
3.  `loadMap(id)`
4.  `saveMap(id, data, { etag? })`
5.  `duplicateMap(id)` (optional)

### UI Hooks

- **Open/Picker**: `listMaps()` → `loadMap(id)` → set state.
- **Save**: explicit button → `saveMap(id, data, { etag })`.
  - On `409`, prompt: _Reload_ vs _Force Save_.
- **New Map**: call `createMap()` with blank state.

---

## 5. Path to Real-Time

- Current: whole-document PUT.
- Future: add `PATCH /maps/:id` with operations or CRDT.
- Introduce WebSocket for presence + live ops.
- Keep `{ id, version, updatedAt, etag }` envelope stable.

---

## 6. MCP Seam (Future)

Mirror the REST API:

- `list_maps` → GET `/maps`
- `get_map {id}` → GET `/maps/:id`
- `put_map {id, data, if_match?}` → PUT `/maps/:id`
- (later) `search_maps`, `create_map`, `apply_patch`

---

## 7. Test Checklist

- [ ] `POST /maps` → 201, returns id, version=1, ETag
- [ ] `GET /maps/:id` → returns same JSON, same ETag
- [ ] `PUT /maps/:id` with correct `If-Match` → 200, version increments
- [ ] `PUT /maps/:id` with wrong `If-Match` → 409
- [ ] `GET /maps` lists created maps
- [ ] `413` when payload > `JSON_LIMIT`
- [ ] `400` on malformed JSON
- [ ] CORS allows localhost:8080 + prod domain

---

## Why This Approach

- **Leverages existing JSON export/import** → minimal risk.
- **Simple endpoints** → quick to implement.
- **Optimistic concurrency** with ETag/If-Match → avoids silent overwrites.
- **SQLite WAL + atomic writes** → safe, production-ready durability.
- **Clear upgrade path** → real-time collaboration + MCP without breaking v1.
