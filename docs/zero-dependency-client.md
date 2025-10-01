# Zero-Dependency Client Architecture

## Context

The client team has a **philosophical commitment to zero external dependencies**. They:

- Don't use npm/package managers
- Don't have a build step
- Write vanilla JavaScript
- Load scripts directly via `<script>` tags

This is a valid architectural choice (vanilla web development, reduced complexity, long-term stability).

---

## Solution 1: REST API (Pure Vanilla JS)

**Recommended for zero-dependency philosophy**

### Implementation

```html
<!DOCTYPE html>
<html>
  <head>
    <title>MindMeld - Zero Dependencies</title>
  </head>
  <body>
    <script>
      // Pure vanilla JavaScript - no dependencies!
      class MindMeldClient {
        constructor(serverUrl, mapId) {
          this.serverUrl = serverUrl;
          this.mapId = mapId;
          this.etag = null;
          this.data = null;
        }

        async fetchMap() {
          const response = await fetch(`${this.serverUrl}/maps/${this.mapId}`);

          if (response.status === 404) {
            // Map doesn't exist yet - create it
            return await this.createMap();
          }

          this.etag = response.headers.get('ETag');
          const map = await response.json();
          this.data = map.data;
          return this.data;
        }

        async createMap() {
          const response = await fetch(`${this.serverUrl}/maps`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: 'New Map',
              data: { n: [], c: [], meta: {} },
            }),
          });

          const map = await response.json();
          this.mapId = map.id;
          this.etag = response.headers.get('ETag');
          this.data = map.data;
          return this.data;
        }

        async updateMap(data) {
          const response = await fetch(`${this.serverUrl}/maps/${this.mapId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'If-Match': this.etag,
            },
            body: JSON.stringify({ data }),
          });

          if (response.status === 409) {
            // Conflict - someone else updated
            console.warn('Conflict detected, refetching...');
            return await this.fetchMap();
          }

          this.etag = response.headers.get('ETag');
          const map = await response.json();
          this.data = map.data;
          return this.data;
        }

        // Poll for updates every N seconds
        startPolling(callback, intervalMs = 5000) {
          this.pollInterval = setInterval(async () => {
            try {
              const newData = await this.fetchMap();
              if (JSON.stringify(newData) !== JSON.stringify(this.data)) {
                this.data = newData;
                callback(newData);
              }
            } catch (error) {
              console.error('Polling error:', error);
            }
          }, intervalMs);
        }

        stopPolling() {
          if (this.pollInterval) {
            clearInterval(this.pollInterval);
          }
        }

        // Helper methods for common operations
        addNote(id, content, position, color = 'yellow') {
          if (!this.data) return;

          const note = {
            i: id,
            c: content,
            p: position,
          };

          if (color !== 'default') {
            note.color = color;
          }

          this.data.n.push(note);
        }

        updateNote(id, updates) {
          if (!this.data) return;

          const note = this.data.n.find((n) => n.i === id);
          if (note) {
            Object.assign(note, updates);
          }
        }

        deleteNote(id) {
          if (!this.data) return;

          this.data.n = this.data.n.filter((n) => n.i !== id);
          // Also remove connections involving this note
          this.data.c = this.data.c.filter((c) => c.f !== id && c.t !== id);
        }

        addConnection(fromId, toId, type = 'arrow') {
          if (!this.data) return;

          const conn = { f: fromId, t: toId };
          if (type !== 'arrow') {
            conn.type = type;
          }

          this.data.c.push(conn);
        }

        // Persist current state to server
        async save() {
          if (!this.data) return;
          return await this.updateMap(this.data);
        }
      }

      // Usage
      const client = new MindMeldClient('http://localhost:3001', 'my-map-id');

      // Initialize
      client.fetchMap().then((data) => {
        console.log('Map loaded:', data);
        renderMap(data);
      });

      // Listen for updates from other users
      client.startPolling((newData) => {
        console.log('Map updated by another user');
        renderMap(newData);
      });

      // Make changes
      function addNewNote() {
        const noteId = 'note-' + Date.now();
        client.addNote(noteId, 'My note', [100, 100], 'yellow');
        client.save().then(() => {
          console.log('Note saved');
        });
      }

      function renderMap(data) {
        // Your rendering logic here
        console.log('Rendering:', data.n.length, 'notes');
      }
    </script>
  </body>
</html>
```

**Characteristics:**

- ✅ **Zero dependencies** - Pure vanilla JavaScript
- ✅ **Simple** - ~150 lines of readable code
- ✅ **Standard Web APIs** - fetch, JSON, setInterval
- ⚠️ **Polling-based** - 5 second latency for updates
- ⚠️ **Last-write-wins** - No automatic conflict resolution

---

## Solution 2: Server-Provided Yjs Bundle

**"Pseudo server module" approach - server serves a pre-built Yjs bundle**

### Server-side: Create Pre-built Bundle

Add a new endpoint that serves a pre-built, minified Yjs bundle:

```javascript
// src/modules/yjs/client-bundle.js
// Create a standalone bundle that clients can load

const express = require('express');
const path = require('path');
const router = express.Router();

// Serve pre-built Yjs client bundle
router.get('/yjs-client.js', (req, res) => {
  res.set('Content-Type', 'application/javascript');
  res.set('Cache-Control', 'public, max-age=86400'); // Cache for 1 day

  // Serve the bundled file
  res.sendFile(path.join(__dirname, '../../../dist/yjs-client-bundle.js'));
});

module.exports = router;
```

### Build Script: Create the Bundle

```javascript
// scripts/build-yjs-client-bundle.js
// Creates a standalone UMD bundle of Yjs + WebSocket provider

const { build } = require('esbuild');
const path = require('path');

async function buildYjsClientBundle() {
  await build({
    entryPoints: ['scripts/yjs-client-entry.js'],
    bundle: true,
    format: 'iife', // Immediately Invoked Function Expression
    globalName: 'YjsClient', // Available as window.YjsClient
    outfile: 'dist/yjs-client-bundle.js',
    minify: true,
    sourcemap: false,
    platform: 'browser',
    target: 'es2020',
  });

  console.log('✅ Yjs client bundle created: dist/yjs-client-bundle.js');
}

buildYjsClientBundle().catch(console.error);
```

```javascript
// scripts/yjs-client-entry.js
// Entry point for the bundle

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

// Export a simple API
export class MindMeldYjsClient {
  constructor(serverUrl, mapId) {
    this.doc = new Y.Doc();
    this.provider = new WebsocketProvider(serverUrl, mapId, this.doc);

    this.notes = this.doc.getMap('notes');
    this.connections = this.doc.getMap('connections');
    this.meta = this.doc.getMap('meta');
  }

  onSync(callback) {
    this.provider.on('sync', callback);
  }

  destroy() {
    this.provider.destroy();
  }
}

// Make it available globally
window.YjsClient = { MindMeldYjsClient };
```

### Client-side: Use Server-Provided Bundle

```html
<!DOCTYPE html>
<html>
  <head>
    <title>MindMeld - Using Server Bundle</title>
  </head>
  <body>
    <!-- Load Yjs client from the server itself -->
    <script src="http://localhost:3001/client/yjs-client.js"></script>

    <script>
      // Still zero dependencies in YOUR code!
      // The server provides the Yjs functionality

      const client = new YjsClient.MindMeldYjsClient(
        'ws://localhost:3001/yjs',
        'my-map-id',
      );

      // Real-time updates!
      client.onSync((synced) => {
        if (synced) {
          console.log('Synced with server');
          renderMap();
        }
      });

      // Listen to changes
      client.notes.observe(() => {
        console.log('Notes changed by another user');
        renderMap();
      });

      // Make changes (automatically synced)
      function addNote() {
        const noteId = 'note-' + Date.now();
        const noteMap = new Map();
        noteMap.set('id', noteId);
        noteMap.set('content', 'My note');
        noteMap.set('pos', [100, 100]);
        client.notes.set(noteId, noteMap);
      }

      function renderMap() {
        // Render all notes
        const notes = [];
        for (const [id, noteMap] of client.notes.entries()) {
          notes.push({
            id: noteMap.get('id'),
            content: noteMap.get('content'),
            pos: noteMap.get('pos'),
          });
        }
        console.log('Rendering:', notes.length, 'notes');
      }
    </script>
  </body>
</html>
```

**Characteristics:**

- ✅ **Zero dependencies in client code** - Bundle served by server
- ✅ **Real-time updates** - True WebSocket collaboration
- ✅ **CRDT conflict resolution** - Automatic merging
- ⚠️ **Not truly zero dependencies** - Just shifts where they come from
- ⚠️ **~60KB bundle size** - One-time download, cached

---

## Solution 3: Hybrid Approach

Use REST API as the primary interface, with optional WebSocket enhancement:

```html
<!DOCTYPE html>
<html>
  <head>
    <title>MindMeld - Hybrid</title>
  </head>
  <body>
    <script>
      // Base implementation uses REST (zero dependencies)
      class MindMeldClient {
        // ... REST implementation from Solution 1 ...
      }

      // If server bundle is available, enhance with WebSocket
      function enhanceWithWebSocket() {
        if (typeof YjsClient === 'undefined') {
          console.log('Using REST API (no WebSocket)');
          return null;
        }

        console.log('Using WebSocket (real-time mode)');
        return new YjsClient.MindMeldYjsClient(
          'ws://localhost:3001/yjs',
          mapId,
        );
      }

      // Graceful degradation
      const wsClient = enhanceWithWebSocket();
      const restClient = new MindMeldClient(
        'http://localhost:3001',
        'my-map-id',
      );

      if (wsClient) {
        // Use WebSocket
        wsClient.notes.observe(() => renderMap());
      } else {
        // Fallback to polling
        restClient.startPolling((data) => renderMap());
      }
    </script>

    <!-- Optional: Load WebSocket bundle if available -->
    <script
      src="http://localhost:3001/client/yjs-client.js"
      onerror="console.log('WebSocket not available, using REST')"
    ></script>
  </body>
</html>
```

---

## Recommendation for Zero-Dependency Philosophy

Given your client's philosophy, I recommend:

### Primary: Solution 1 (REST API)

**Why:**

- ✅ Truly aligns with zero-dependency philosophy
- ✅ Simple, understandable, maintainable vanilla JS
- ✅ Works in any browser, no build step
- ✅ Long-term stable (just Web APIs)
- ✅ Client owns 100% of their code

**Trade-offs:**

- ⚠️ Polling latency (5 seconds typical)
- ⚠️ Last-write-wins conflicts (but manageable with ETags)

**When it works well:**

- Typical use case: 1-2 users editing
- Updates every 5-10 seconds is acceptable
- Conflicts are rare or can be resolved manually

### Alternative: Solution 2 (Server Bundle)

**Only if:**

- They need real-time updates (sub-second latency)
- Multiple simultaneous users are common
- Automatic conflict resolution is critical

**Philosophy consideration:**

- The server "provides" Yjs as a service
- Client still has zero dependencies in _their_ codebase
- But they're loading external code (just from a trusted source - your server)

---

## Proposed Response to Client Team

> "We respect your zero-dependency philosophy - that's actually a healthy architectural constraint that keeps systems maintainable.
>
> **We recommend using our REST API:**
>
> We've prepared a pure vanilla JavaScript client (~150 lines) that works with our JSON REST API. It:
>
> - Uses only standard Web APIs (fetch, JSON)
> - Requires zero external dependencies or build steps
> - Can be copy-pasted directly into your codebase
> - Polls for updates every 5 seconds (configurable)
> - Handles conflicts via ETags
>
> **This is the right approach for zero-dependency architecture.**
>
> The WebSocket/Yjs endpoint is designed for clients using the Yjs ecosystem. Implementing the binary protocol without dependencies would mean writing ~5000 lines of complex CRDT code, which contradicts your simplicity philosophy.
>
> See attached `mindmeld-client.js` for the complete vanilla implementation."

Would you like me to create a production-ready vanilla JS client file they can literally copy-paste into their project?
