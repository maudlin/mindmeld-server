# Client Team: WebSocket Upgrade Summary

## The Situation

The client team reported that sending JSON over WebSocket isn't working:

```javascript
// ❌ This doesn't work:
ws.send(JSON.stringify({ type: 'update', changes: {...} }))
```

## The Root Cause

**The Yjs WebSocket protocol uses BINARY messages, not JSON.**

The server correctly implements the standard Yjs binary protocol. It expects:

- Binary encoded messages (Uint8Array/ArrayBuffer)
- Yjs CRDT update format
- Proper sync handshake protocol

## The Solution

Since the client team uses **zero external dependencies** (no npm, no build tools), we've created a **server-provided bundle** they can load:

```html
<!-- Load from server - zero npm dependencies needed! -->
<script src="http://localhost:3001/client/mindmeld-yjs-client.js"></script>

<script>
  // Now available globally
  const wsClient = new MindMeldWebSocketClient(
    'http://localhost:3001',
    'my-map-id',
  );

  // Real-time collaboration!
  wsClient.onNotesChange(() => renderMap());
</script>
```

## Implementation Details

### Server-Side Setup

1. **Built the client bundle:**

   ```bash
   npm run build:client
   ```

   - Creates `dist/mindmeld-yjs-client.js` (95KB minified)
   - Bundles Yjs + WebSocket provider + MindMeld wrapper
   - Uses esbuild for optimal browser bundle

2. **Added route to serve bundle:**
   - `GET /client/mindmeld-yjs-client.js` - Serves the bundle
   - `GET /client/info` - Bundle availability status
   - Cached for 1 hour, CORS enabled

3. **Updated documentation:**
   - `docs/client-integration.md` - Added WebSocket section
   - `docs/WEBSOCKET_PROTOCOL.md` - Explains why JSON doesn't work
   - `docs/ZERO_DEPENDENCY_CLIENT.md` - Full zero-dep architecture guide

### Client-Side API

The bundle exposes `window.MindMeldWebSocketClient`:

```javascript
// Connect
const client = new MindMeldWebSocketClient(serverUrl, mapId);

// Wait for sync
await client.whenSynced();

// Listen for changes
client.onNotesChange(() => console.log('Notes changed!'));
client.onConnectionsChange(() => console.log('Connections changed!'));

// Work with data
const json = client.toJSON(); // Export to MindMeld JSON
client.fromJSON(jsonData); // Import from JSON

// Access Y.js directly (advanced)
client.notes; // Y.Map of notes
client.connections; // Y.Map of connections
client.meta; // Y.Map of metadata

// Also available: window.Y (full Yjs library)
```

## Benefits vs REST Polling

| Feature            | REST (Current)          | WebSocket (New)        |
| ------------------ | ----------------------- | ---------------------- |
| Latency            | 5+ seconds              | <100ms                 |
| Server load        | High (polling)          | Low (push-based)       |
| Conflicts          | Last-write-wins + ETags | Automatic CRDT merging |
| Collaborative text | ❌                      | ✅ (Y.Text)            |
| Dependencies       | 0                       | 0 (from server)        |
| Bundle size        | 0                       | 95KB (cached)          |

## Philosophy Alignment

This respects the client's zero-dependency philosophy:

✅ **No npm in client code** - Bundle comes from server  
✅ **No build step** - Load via `<script>` tag  
✅ **No package.json** - Pure vanilla JavaScript  
✅ **Trust model** - They already trust our REST API, now trust our client bundle

**Think of it as:**

- REST API = Server provides **data**
- WebSocket Bundle = Server provides **data + real-time client**

## Files Changed

### Server Files

- `scripts/yjs-client-entry.js` - Bundle entry point
- `scripts/build-yjs-client.js` - Build script
- `src/modules/yjs/client-bundle-route.js` - Route handler
- `src/factories/server-factory.js` - Wire up route
- `package.json` - Add `build:client` script

### Documentation

- `docs/client-integration.md` - Added WebSocket section
- `docs/WEBSOCKET_PROTOCOL.md` - Why binary not JSON
- `docs/ZERO_DEPENDENCY_CLIENT.md` - Full architecture guide

### Bundle Output

- `dist/mindmeld-yjs-client.js` - 95KB minified browser bundle
- `dist/mindmeld-yjs-client.js.map` - Sourcemap for debugging

## For the Client Team

**Tell them:**

> "The WebSocket endpoint expects binary Yjs protocol messages, not JSON. Since you have a zero-dependency philosophy, we've created a solution:
>
> The server now provides a pre-built JavaScript bundle at:
> `http://localhost:3001/client/mindmeld-yjs-client.js`
>
> Just load this via `<script>` tag (no npm needed) and you get real-time WebSocket collaboration with automatic conflict resolution.
>
> Documentation: `/docs/client-integration.md` (WebSocket section)
> Full API: `/docs/ZERO_DEPENDENCY_CLIENT.md`
>
> This aligns with your philosophy - you're still writing vanilla JS with zero build tools, but now you can load the real-time client from our server instead of polling our REST API."

## Next Steps

1. **Client team**: Try the WebSocket bundle
2. **Server team**: Monitor bundle usage at `/client/info`
3. **Future**: Could add more bundles (e.g., offline-first with IndexedDB)

## Testing the Bundle

```bash
# Build the bundle
npm run build:client

# Start server
npm start

# Test availability
curl http://localhost:3001/client/info

# Load in browser
open http://localhost:3001/client/mindmeld-yjs-client.js
```

## Deployment Notes

- Bundle is gitignored (built during deployment)
- Add to deployment script: `npm run build:client`
- Bundle is served with caching headers (1 hour)
- No special server configuration needed

---

**Status**: ✅ Complete and tested  
**Bundle Size**: 95KB minified  
**Dependencies Added to Client**: 0  
**Real-time Collaboration**: Enabled
