# MCP Quick Start Guide

## 🚀 For Developers: 30-Second Setup

### 1. Start MindMeld Server
```bash
FEATURE_MCP=1 npm start
```

### 2. Add to Warp MCP Config
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

### 3. Test in Warp
- "List my mind maps"
- "Create a new mind map called 'Test'"
- "Show server health status"

## 🎯 Key Architecture Points

- **Transport**: Uses `mcp-remote` (same as Atlassian Jira)
- **Protocol**: SSE over HTTP (industry standard)
- **Endpoint**: `http://localhost:3001/mcp/sse`
- **Reliability**: Built-in retry/reconnection handling

## 📋 Available Operations

| Operation | Description | Example Usage |
|-----------|-------------|---------------|
| `maps.list` | List all maps | "List my mind maps" |
| `maps.get` | Get map by ID | "Get map details for abc-123" |
| `maps.create` | Create new map | "Create a new map called 'Project'" |
| `maps.update` | Update existing map | (Programmatic only) |
| `maps.delete` | Delete map | "Delete the map called 'Test'" |

## 🔍 Health Check
```bash
curl http://localhost:3001/health
```

## 📚 Full Documentation
- **Developers**: See `mcp-developer-guide.md`
- **Warp Users**: See `warp-mcp-config.md`
- **Server Info**: See `../README.md`

---

**✅ This configuration is proven to work with live Warp connections!**
