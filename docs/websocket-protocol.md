# Yjs WebSocket Protocol Documentation

## Summary

**The Yjs WebSocket protocol uses BINARY messages, NOT JSON.**

If your client cannot use the official `yjs` or `y-websocket` libraries, you have two options:

1. **Use the REST API** (recommended for JSON-based clients)
2. **Implement the binary Yjs protocol** (complex, not recommended)

---

## Current Server Implementation

The MindMeld server supports **both** protocols:

### ✅ Binary WebSocket Protocol (Yjs Standard)

- **Endpoint**: `ws://server/yjs/:mapId`
- **Format**: Binary (Uint8Array/ArrayBuffer)
- **Use Case**: Real-time collaboration with official Yjs clients
- **Protocol**: https://github.com/yjs/yjs/blob/main/PROTOCOL.md

### ✅ REST API (JSON)

- **Endpoints**:
  - `GET /maps/:id` - Get current state as JSON
  - `PUT /maps/:id` - Update state with JSON
  - `POST /maps/:id/import` - Import JSON into Yjs document
- **Format**: JSON
- **Use Case**: Clients that cannot use Yjs library

---

## Why Not JSON over WebSocket?

The Yjs protocol is a **binary protocol** for efficiency and conflict resolution:

```javascript
// Official y-websocket client setup
const websocket = new WebSocket(url);
websocket.binaryType = 'arraybuffer'; // ← BINARY, not JSON!

websocket.onmessage = (event) => {
  const message = new Uint8Array(event.data); // ← Binary data
  // Decode using Yjs binary protocol...
};
```

### Message Format

Yjs binary messages are structured as:

```
[messageType:varint][payload...]
```

Where messageType can be:

- `0` = Sync message (document updates)
- `1` = Awareness message (cursor positions, user presence)
- `2` = Auth message
- `3` = Query awareness

The payload is encoded using **lib0/encoding** which provides variable-length integer encoding, efficient binary serialization, etc.

---

## Client Implementation Options

### Option 1: Use REST API (Recommended for Yjs-Alike)

If you're implementing a "Yjs-alike" protocol and cannot use the official Yjs library:

```javascript
// ❌ DON'T do this (won't work):
const ws = new WebSocket('ws://server/yjs/map-123')
ws.send(JSON.stringify({ type: 'update', changes: {...} }))

// ✅ DO this instead:
// 1. Make changes locally
const updates = { n: [...notes], c: [...connections], meta: {...} }

// 2. Send via REST API
await fetch('http://server/maps/map-123', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'If-Match': currentEtag  // For optimistic concurrency
  },
  body: JSON.stringify({ data: updates })
})

// 3. Poll for updates from other users
setInterval(async () => {
  const response = await fetch('http://server/maps/map-123')
  const map = await response.json()
  applyRemoteUpdates(map.data)
}, 5000)
```

**Advantages:**

- ✅ Simple JSON format
- ✅ Works with any HTTP client
- ✅ Standard REST semantics
- ✅ Optimistic concurrency with ETags

**Disadvantages:**

- ⚠️ No real-time updates (polling required)
- ⚠️ Higher latency than WebSocket
- ⚠️ Last-write-wins conflicts (no automatic CRDT merging)

### Option 2: Implement Binary Yjs Protocol (Not Recommended)

If you absolutely need real-time WebSocket updates without using the Yjs library:

```javascript
// This requires implementing the full Yjs binary protocol
// See: https://github.com/yjs/yjs/blob/main/PROTOCOL.md

import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as syncProtocol from 'y-protocols/sync';

const doc = new Y.Doc();
const ws = new WebSocket('ws://server/yjs/map-123');
ws.binaryType = 'arraybuffer';

ws.onopen = () => {
  // Send sync step 1
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, 0); // messageSync
  syncProtocol.writeSyncStep1(encoder, doc);
  ws.send(encoding.toUint8Array(encoder));
};

ws.onmessage = (event) => {
  const decoder = decoding.createDecoder(new Uint8Array(event.data));
  const messageType = decoding.readVarUint(decoder);

  if (messageType === 0) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0);
    syncProtocol.readSyncMessage(decoder, encoder, doc, ws);
    const response = encoding.toUint8Array(encoder);
    if (response.length > 1) {
      ws.send(response);
    }
  }
};
```

**This approach:**

- ❌ Requires understanding the binary protocol
- ❌ Requires `yjs`, `lib0`, and `y-protocols` packages
- ❌ Defeats the purpose of avoiding dependencies
- ✅ Provides true real-time collaboration with CRDT conflict resolution

### Option 3: Use Official Yjs Library (Best)

```javascript
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const doc = new Y.Doc();
const provider = new WebsocketProvider(
  'ws://server/yjs', // Server URL
  'map-123', // Room name
  doc, // Y.Doc instance
);

// Access your data
const notes = doc.getMap('notes');
const connections = doc.getMap('connections');

// Make changes (automatically synced)
notes.set('note-1', {
  content: 'Hello',
  pos: [100, 100],
});
```

**Advantages:**

- ✅ Real-time collaboration
- ✅ Automatic CRDT conflict resolution
- ✅ Offline support
- ✅ Efficient binary protocol
- ✅ Battle-tested and maintained

---

## Server Architecture

The server maintains both data formats:

```
Client (Yjs) <--Binary WebSocket--> Server <--> Y.Doc (in-memory)
                                        |
                                        v
                                   SQLite (Yjs snapshots)

Client (REST) <--JSON HTTP--> Server (converts JSON ↔ Yjs)
```

When you use the REST API:

1. Server loads Y.Doc from SQLite snapshot
2. Converts Y.Doc to JSON using `yDocToJSON()`
3. Returns JSON to client
4. Client updates → `PUT /maps/:id` → converts JSON to Yjs using `jsonToYDoc()`
5. Server persists updated Y.Doc snapshot

---

## Recommendations

Based on your situation:

| Your Situation          | Recommendation                                  |
| ----------------------- | ----------------------------------------------- |
| Cannot add dependencies | Use REST API with polling                       |
| Need real-time updates  | Use official `yjs` + `y-websocket`              |
| Building mobile app     | Use REST API or find Yjs port for your platform |
| Need offline support    | Must use official Yjs library                   |
| Building simple client  | Use REST API                                    |
| Need true collaboration | Use official Yjs library                        |

---

## Example: REST API Client

```javascript
class MindMeldClient {
  constructor(serverUrl, mapId) {
    this.serverUrl = serverUrl;
    this.mapId = mapId;
    this.etag = null;
  }

  async fetchMap() {
    const response = await fetch(`${this.serverUrl}/maps/${this.mapId}`);
    if (response.status === 404) {
      return null;
    }

    this.etag = response.headers.get('ETag');
    const map = await response.json();
    return map.data;
  }

  async updateMap(data) {
    const response = await fetch(`${this.serverUrl}/maps/${this.mapId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'If-Match': this.etag, // Prevent overwriting newer changes
      },
      body: JSON.stringify({ data }),
    });

    if (response.status === 409) {
      throw new Error('Conflict: Map was updated by another user');
    }

    this.etag = response.headers.get('ETag');
    return await response.json();
  }

  // Poll for updates every 5 seconds
  startPolling(callback) {
    this.pollInterval = setInterval(async () => {
      try {
        const data = await this.fetchMap();
        callback(data);
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 5000);
  }

  stopPolling() {
    clearInterval(this.pollInterval);
  }
}

// Usage
const client = new MindMeldClient('http://localhost:3001', 'map-123');
const data = await client.fetchMap();

// Listen for updates
client.startPolling((newData) => {
  console.log('Map updated:', newData);
  updateUI(newData);
});

// Make changes
await client.updateMap({
  n: [...notes],
  c: [...connections],
  meta: { modified: new Date().toISOString() },
});
```

---

## Conclusion

**The error is on the client side.** The server is correctly implementing the Yjs binary protocol.

Your client team should:

1. **Use the REST API** if they cannot add Yjs dependencies
2. **Use official Yjs library** if they need real-time collaboration
3. **Not send JSON over the WebSocket** - this will never work with the Yjs protocol

If you need help implementing either approach, refer to:

- REST API: See `/maps` endpoints in `src/modules/maps/routes.js`
- Yjs Client: See https://docs.yjs.dev/getting-started/a-collaborative-editor
