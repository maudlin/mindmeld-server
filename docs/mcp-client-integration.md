# MCP Client Integration Guide

## Overview

This guide shows how to integrate MCP clients (like Warp AI) with the MindMeld server's **MCP protocol** - providing AI assistants with direct access to your mind maps.

## Quick Start

### Server Setup

```bash
npm install
FEATURE_MCP=1 npm start
# Server runs on http://localhost:3001 with MCP at /mcp/sse
```

### Client Configuration

#### Warp AI Configuration

Add to your Warp MCP config:

```json
{
  "mindmeld-server": {
    "command": "npx",
    "args": ["-y", "mcp-remote", "http://localhost:3001/mcp/sse"],
    "env": {},
    "working_directory": null
  }
}
```

#### Generic MCP Client Configuration

```javascript
const MCP_ENDPOINT = 'http://localhost:3001/mcp/sse';
const TRANSPORT = 'mcp-remote'; // SSE over HTTP
```

## MCP Operations Integration

### List Maps

**Natural language**: "List my mind maps"  
**MCP operation**: `maps.list`

```javascript
// Response: [{ id, name, version, updatedAt, sizeBytes }]
```

### Get Map Details

**Natural language**: "Get map details for abc-123"  
**MCP operation**: `maps.get`

```javascript
// Request: { id: "abc-123" }
// Response: { id, name, version, updatedAt, stateJson, sizeBytes }
```

### Create Map

**Natural language**: "Create a new map called 'Project'"  
**MCP operation**: `maps.create`

```javascript
// Request: { name: "Project", data: { n: [], c: [] } }
// Response: { id, name, version, updatedAt, stateJson, sizeBytes }
```

### Delete Map

**Natural language**: "Delete the map called 'Test'"  
**MCP operation**: `maps.delete`

```javascript
// Request: { id: "map-id" }
// Response: { success: true }
```

## Data Format

### Map Data Structure (Same as REST API)

```javascript
{
  "n": [  // Notes
    {
      "i": "unique-id",       // Node ID
      "c": "Node content",    // Text content
      "p": [x, y],           // Position [x, y]
      "cl": "color"          // Color (optional)
    }
  ],
  "c": [  // Connections
    { "f": "from-id", "t": "to-id" }  // From/To node IDs
  ]
}
```

## Error Handling

### Connection Issues

**Cause**: Server offline or MCP endpoint unavailable  
**Solution**: Check server health and ensure FEATURE_MCP=1

```bash
# Check server health
curl http://localhost:3001/health

# Check MCP endpoint
curl http://localhost:3001/mcp/sse
```

### Operation Failures

**Cause**: Invalid map ID or data format  
**Solution**: MCP client will receive structured error response

```javascript
// Error response format
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Map with id 'abc-123' not found"
  }
}
```

## Integration Patterns

### Health Monitoring

**Natural language**: "Show server health status"  
**MCP operation**: Queries `/health` endpoint

```javascript
// Response: { status: "ok", timestamp: "...", uptime: 12345 }
```

### Conversation Flow

```
User: "List my mind maps"
AI: "Here are your mind maps: [lists maps]"

User: "Create a new map called 'Meeting Notes'"
AI: "Created map 'Meeting Notes' with ID: abc-123"

User: "Show me the details of that map"
AI: "Map 'Meeting Notes' contains... [shows structure]"
```

## Protocol Details

- **Transport**: SSE over HTTP (Server-Sent Events)
- **Library**: `mcp-remote` (same as Atlassian integrations)
- **Endpoint**: `http://localhost:3001/mcp/sse`
- **Reliability**: Built-in retry/reconnection handling
- **Format**: JSON-RPC 2.0 over SSE

## Advanced Configuration

### Custom Environment Variables

```json
{
  "mindmeld-server": {
    "command": "npx",
    "args": ["-y", "mcp-remote", "http://localhost:3001/mcp/sse"],
    "env": {
      "DEBUG": "mcp:*",
      "TIMEOUT": "30000"
    }
  }
}
```

This integration approach provides AI assistants with natural language access to your mind maps through a reliable, standards-based MCP protocol.

## Related Guides

- **REST API Integration**: See [Client Integration Guide](client-integration.md) for traditional API client integration
- **Advanced MCP**: See [MCP Developer Guide](mcp-developer-guide.md) for detailed technical documentation
- **Manual Testing**: See [Testing Guide](testing-guide.md) for API testing workflows
