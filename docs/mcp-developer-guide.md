# MCP Developer Guide

## Architecture Overview

MindMeld server implements MCP (Model Context Protocol) v2024-11-05 with dual transport support:

```
Client → mcp-remote → MindMeld Server
                          ├── SSE Transport (/mcp/sse)
                          └── HTTP JSON-RPC (/mcp/*)
```

## Implementation Details

### Service Layer Integration

MCP endpoints integrate directly with the existing Maps service:

```javascript
// src/factories/server-factory.js
const mapsService = new MapsService(sqliteFile);
app.use('/mcp', createMcpRoutes({ mapsService })); // HTTP
app.use('/mcp', createMcpSseEndpoint({ mapsService })); // SSE
```

### Method Mapping

| MCP Tool      | Service Method                              | Notes                       |
| ------------- | ------------------------------------------- | --------------------------- |
| `maps.list`   | `mapsService.list()`                        | Pagination in MCP layer     |
| `maps.get`    | `mapsService.getById(id)`                   | Fixed method name mismatch  |
| `maps.create` | `mapsService.create({ name, state })`       | Parameter: `data` → `state` |
| `maps.update` | `mapsService.update(id, { data, version })` | Optimistic concurrency      |
| `maps.delete` | `mapsService.delete(id)`                    | Direct mapping              |

## API Reference

### Tools (Read-Write Operations)

#### `maps.get` - Get Map by ID

```json
{
  "name": "maps.get",
  "arguments": { "id": "uuid-here" }
}
```

Returns full map object with `stateJson` containing node/connection data.

#### `maps.create` - Create New Map

```json
{
  "name": "maps.create",
  "arguments": {
    "name": "Map Name",
    "data": {
      "n": [{ "i": "root", "c": "Central Idea", "p": [400, 300] }],
      "c": []
    }
  }
}
```

#### `maps.list` - List All Maps

```json
{
  "name": "maps.list",
  "arguments": {
    "limit": 10, // Optional: 1-100, default 50
    "offset": 0 // Optional: default 0
  }
}
```

### Resources (Read-Only)

#### `mindmeld://health` - Server Status

Working on both SSE and HTTP transports.

#### `mindmeld://maps` - Maps List

Working on both transports. Returns summary view of all maps.

#### `mindmeld://maps/{id}` - Individual Map

**Status**: HTTP ✅ | SSE 🔧  
**Workaround**: Use `maps.get` tool instead.

## Data Format

### Mind Map Structure

```json
{
  "n": [
    {
      "i": "node-id",        // Node identifier
      "c": "Node Content",   // Text content
      "p": [x, y],          // Position [x, y]
      "cl": "color"         // Optional color
    }
  ],
  "c": [
    ["from-id", "to-id", 1]  // [source, target, type]
  ]
}
```

## Testing & Integration

### Direct HTTP Testing

```bash
# Initialize
curl -X POST http://localhost:3001/mcp/initialize \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{"tools":{}}}}'

# List maps
curl -X POST http://localhost:3001/mcp/tools/call \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"maps.list","arguments":{"limit":5}}}'
```

### Custom Client (Node.js)

```javascript
import { spawn } from 'child_process';

const mcp = spawn('npx', ['-y', 'mcp-remote', 'http://localhost:3001/mcp/sse']);

function sendMcpRequest(method, params) {
  const request = {
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params
  };
  mcp.stdin.write(JSON.stringify(request) + '\n');
}

// Initialize connection
sendMcpRequest('initialize', {
  protocolVersion: '2024-11-05',
  capabilities: { tools: {} }
});

// List maps
sendMcpRequest('tools/call', {
  name: 'maps.list',
  arguments: { limit: 10 }
});
```

## Error Handling

Service errors are translated to MCP error codes:

- `NotFoundError` → `-32602` (Invalid params)
- `ConflictError` → `-32602` (Version conflict)
- `ValidationError` → `-32602` (Invalid params)
- `Generic Error` → `-32603` (Internal error)

## Configuration

### Environment Variables

```bash
# MCP enabled automatically with Maps API
FEATURE_MAPS_API=true
PORT=3001
CORS_ORIGIN=http://localhost:8080
```

### Health Monitoring

```bash
curl http://localhost:3001/health
curl -X POST http://localhost:3001/mcp/resources/read \
  -d '{"jsonrpc":"2.0","id":1,"method":"resources/read","params":{"uri":"mindmeld://health"}}'
```

## Known Issues

### SSE Individual Map Resources

- **Issue**: `mindmeld://maps/{id}` not accessible via SSE
- **Workaround**: Use `maps.get` tool (identical functionality)
- **Status**: Under investigation

### Pagination

- **Current**: Client-side pagination in MCP layer
- **Future**: Service-layer pagination planned

## File Locations

- **HTTP JSON-RPC**: `src/core/mcp-routes.js`
- **SSE Transport**: `src/core/mcp-sse.js`
- **Service Integration**: `src/factories/server-factory.js`
- **Tests**: `tests/integration/maps.test.js`

## Contributing

When modifying MCP functionality:

1. Update both SSE and HTTP transports
2. Maintain service layer integration patterns
3. Update integration tests
4. Test with real MCP clients (Warp, Claude Desktop)

---

**See Also:**

- [MCP User Guide](mcp-user-guide.md) - Setup for end users
- [Maps API Documentation](maps-api.md) - Core API reference
