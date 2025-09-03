# Warp MCP Configuration for MindMeld Server

## Simplified MCP Integration

MindMeld server now has **streamlined MCP support** with two transport options:

1. **Server-Sent Events (SSE)** - Primary, recommended for real-time AI interactions
2. **HTTP JSON-RPC** - Fallback for compatibility

## Connection Details

- **Primary Endpoint (SSE)**: `http://localhost:3001/mcp/sse`
- **Fallback Endpoint (HTTP)**: `http://localhost:3001/mcp/*`  
- **Protocol Version**: 2024-11-05
- **Health Check**: `http://localhost:3001/health`

## Available Resources

- **mindmeld://health** - Server status and health information
- **mindmeld://maps** - List of all accessible mind maps
- **mindmeld://maps/{id}** - Individual map data by ID

## Available Tools

- **maps.list** - List all maps with pagination (limit: 1-100, offset: 0+)
- **maps.get** - Get specific map by UUID
- **maps.create** - Create new mind map (requires name + data)
- **maps.update** - Update existing map with version control
- **maps.delete** - Delete map permanently

## Quick Setup for Warp

### Recommended Configuration (Proven to Work)

Add this to your Warp MCP configuration:

```json
{
  "mindmeld-server": {
    "command": "npx",
    "args": [
      "-y", 
      "mcp-remote",
      "http://localhost:3001/mcp/sse"
    ],
    "env": {},
    "working_directory": null
  }
}
```

### Why This Approach?

This configuration:
- ✅ **Uses `mcp-remote`** - The same pattern as Atlassian's Jira integration
- ✅ **Battle-tested** - Handles SSE connections, retries, and error recovery
- ✅ **No custom client code** - Standard npm package handles complexity
- ✅ **Proven to work** - Successfully tested with live connections

### Alternative (Direct HTTP - Limited)

If `mcp-remote` isn't available, you can try direct HTTP (less reliable):

```json
{
  "mindmeld-server-direct": {
    "command": "curl",
    "args": [
      "-X", "POST",
      "http://localhost:3001/mcp/initialize",
      "-H", "Content-Type: application/json"
    ]
  }
}
```

## Testing the Connection

### 1. Start the Server
```bash
FEATURE_MCP=1 npm start
```

### 2. Test HTTP Endpoints
```bash
# Test server health
curl http://localhost:3001/health

# List available resources
curl -X POST http://localhost:3001/mcp/resources/list \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "resources/list", "params": {}}'

# List available tools  
curl -X POST http://localhost:3001/mcp/tools/list \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}'

# Call maps.list tool
curl -X POST http://localhost:3001/mcp/tools/call \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "maps.list", "arguments": {"limit": 5}}}'
```

### 3. Test SSE Endpoint
```bash
# Connect to SSE stream
curl -N http://localhost:3001/mcp/sse

# Send JSON-RPC over SSE (in another terminal)
curl -X POST http://localhost:3001/mcp/sse \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}'
```

## Example Commands for Warp

Once connected, you should be able to use these natural language commands in Warp:

- "List my mind maps"
- "Show me the health status of my mindmeld server"
- "Create a new mind map called 'Project Planning'"
- "Get the details of map [map-id]"
- "What mind mapping resources are available?"
- "Delete the map called [map-name]"

## Troubleshooting

### Common Issues

1. **Server not responding**
   - Ensure server is running: `FEATURE_MCP=1 npm start`
   - Check health endpoint: `curl http://localhost:3001/health`

2. **Connection refused**
   - Verify server is on port 3001
   - Check firewall/network settings

3. **SSE connection issues**
   - Try HTTP fallback transport instead
   - Check browser/client SSE support

4. **Invalid JSON-RPC responses**
   - Ensure requests include `"jsonrpc": "2.0"`
   - Validate request structure

### Debug Mode

```bash
# Run with debug logging
FEATURE_MCP=1 LOG_LEVEL=debug npm start
```

## Simplified Architecture

✅ **Transport**: SSE (primary) + HTTP JSON-RPC (fallback)  
✅ **Integration**: Single server, no separate ports  
✅ **Resources**: health, maps list, individual maps  
✅ **Tools**: list, get, create, update, delete  
✅ **Configuration**: Single `warp-mcp.json` file  
✅ **CORS**: Enabled for localhost and Warp
