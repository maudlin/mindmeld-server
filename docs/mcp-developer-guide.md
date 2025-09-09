# MCP Developer Integration Guide

## Connecting to MindMeld Server via MCP

This guide shows developers how to integrate with the MindMeld server using the Model Context Protocol (MCP). Our server follows industry standards used by companies like Atlassian.

## Architecture Overview

```
Your App/Tool → mcp-remote → MindMeld Server (SSE endpoint)
```

**Why this architecture?**

- ✅ **Battle-tested**: Same pattern used by Atlassian for Jira MCP integration
- ✅ **Reliable**: `mcp-remote` handles connection management, retries, and SSE complexities
- ✅ **Standard**: Compatible with all MCP-aware tools (Warp, Claude Desktop, etc.)
- ✅ **Simple**: No custom SSE client code needed

## Server Endpoints

- **Primary**: `http://localhost:3001/mcp/sse` (Server-Sent Events)
- **Fallback**: `http://localhost:3001/mcp/*` (HTTP JSON-RPC)
- **Health**: `http://localhost:3001/health`

## Quick Setup

### 1. Start the MindMeld Server

```bash
# Enable MCP support
FEATURE_MCP=1 npm start
```

### 2. Test Direct Connection

```bash
# Install mcp-remote globally (optional)
npm install -g mcp-remote

# Test the connection
npx mcp-remote http://localhost:3001/mcp/sse
```

## Integration Examples

### Warp Terminal

Add to your Warp MCP configuration:

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

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mindmeld": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:3001/mcp/sse"]
    }
  }
}
```

### Custom Application (Node.js)

```javascript
const { spawn } = require('child_process');

// Spawn mcp-remote as subprocess
const mcpClient = spawn(
  'npx',
  ['-y', 'mcp-remote', 'http://localhost:3001/mcp/sse'],
  {
    stdio: ['pipe', 'pipe', 'pipe']
  }
);

// Send JSON-RPC requests via stdin
function sendMcpRequest(method, params = {}) {
  const request = {
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params
  };

  mcpClient.stdin.write(JSON.stringify(request) + '\n');
}

// Handle responses via stdout
mcpClient.stdout.on('data', data => {
  const response = JSON.parse(data.toString());
  console.log('MCP Response:', response);
});

// Initialize connection
sendMcpRequest('initialize', {
  protocolVersion: '2024-11-05',
  capabilities: {
    tools: {}
  }
});

// List available tools
sendMcpRequest('tools/list');

// Call a tool
sendMcpRequest('tools/call', {
  name: 'maps.list',
  arguments: { limit: 10 }
});
```

### Custom Application (Python)

```python
import subprocess
import json
import sys

class MindMeldMcpClient:
    def __init__(self):
        self.process = subprocess.Popen([
            'npx', '-y', 'mcp-remote',
            'http://localhost:3001/mcp/sse'
        ],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True, bufsize=0)

    def send_request(self, method, params=None):
        request = {
            'jsonrpc': '2.0',
            'id': 1,
            'method': method,
            'params': params or {}
        }

        self.process.stdin.write(json.dumps(request) + '\n')
        self.process.stdin.flush()

        # Read response
        response = self.process.stdout.readline()
        return json.loads(response)

    def initialize(self):
        return self.send_request('initialize', {
            'protocolVersion': '2024-11-05',
            'capabilities': {'tools': {}}
        })

    def list_maps(self, limit=10):
        return self.send_request('tools/call', {
            'name': 'maps.list',
            'arguments': {'limit': limit}
        })

# Usage
client = MindMeldMcpClient()
client.initialize()
maps = client.list_maps()
print(json.dumps(maps, indent=2))
```

## Available Resources

| URI                 | Description   | Content                       |
| ------------------- | ------------- | ----------------------------- |
| `mindmeld://health` | Server status | Health info, uptime, features |
| `mindmeld://maps`   | All maps      | List of accessible mind maps  |

## Available Tools

| Tool          | Description                   | Parameters                                       |
| ------------- | ----------------------------- | ------------------------------------------------ |
| `maps.list`   | List all maps with pagination | `limit` (1-100), `offset` (0+)                   |
| `maps.get`    | Get specific map by UUID      | `id` (required UUID)                             |
| `maps.create` | Create new mind map           | `name` (string), `data` (object)                 |
| `maps.update` | Update existing map           | `id` (UUID), `data` (object), `version` (number) |
| `maps.delete` | Delete map permanently        | `id` (required UUID)                             |

## Example API Calls

### Get Server Health

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "resources/read",
  "params": {
    "uri": "mindmeld://health"
  }
}
```

### List Mind Maps

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "maps.list",
    "arguments": {
      "limit": 10,
      "offset": 0
    }
  }
}
```

### Create New Map

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "maps.create",
    "arguments": {
      "name": "My Project",
      "data": {
        "n": [
          {
            "i": "root",
            "c": "My Project",
            "p": [400, 300],
            "cl": "blue"
          }
        ],
        "c": []
      }
    }
  }
}
```

## Mind Map Data Format

Our server uses a compact JSON format:

```json
{
  "n": [
    {
      "i": "unique-id",       // Node ID
      "c": "Node text",       // Content
      "p": [x, y],           // Position [x, y]
      "cl": "color"          // Color (optional)
    }
  ],
  "c": [
    ["from-id", "to-id", 1] // Connection [from, to, type]
  ]
}
```

## Error Handling

The server returns RFC 7807 Problem Details for errors:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32602,
    "message": "Invalid params",
    "data": "Map ID is required"
  }
}
```

Common error codes:

- `-32600`: Invalid Request
- `-32601`: Method not found
- `-32602`: Invalid params
- `-32603`: Internal error

## Testing Your Integration

### 1. Test Server Health

```bash
curl http://localhost:3001/health
```

### 2. Test MCP Connection

```bash
# This should show initialization handshake
npx -y mcp-remote http://localhost:3001/mcp/sse
```

### 3. Use Our Test Script

```bash
npm run mcp:test
```

## Production Deployment

### Environment Variables

- `FEATURE_MCP=1` - Enable MCP support
- `PORT=3001` - Server port (default: 3001)
- `CORS_ORIGIN` - CORS origin (default: http://localhost:8080)

### Health Monitoring

Monitor the `/health` endpoint:

```json
{
  "status": "ok",
  "timestamp": "2025-01-03T16:18:11.837Z",
  "uptime": 125.234
}
```

### Docker Deployment

```dockerfile
FROM node:24-alpine
WORKDIR /app
ENV FEATURE_MCP=1
ENV PORT=3001
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
EXPOSE 3001
CMD ["npm", "start"]
```

## Troubleshooting

### Connection Issues

1. Ensure server is running with `FEATURE_MCP=1`
2. Check firewall settings for port 3001
3. Verify `/health` endpoint responds

### mcp-remote Issues

```bash
# Test mcp-remote installation
npx -y mcp-remote --version

# Test with verbose logging
DEBUG=* npx -y mcp-remote http://localhost:3001/mcp/sse
```

### Server Logs

```bash
# Run with debug logging
FEATURE_MCP=1 LOG_LEVEL=debug npm start
```

Look for these log entries:

- `MCP SSE JSON-RPC call: initialize` - Connection established
- `MCP SSE JSON-RPC call: resources/list` - Resources discovered
- `MCP SSE JSON-RPC call: tools/list` - Tools discovered

## Support

- **GitHub Issues**: [Report bugs or request features]
- **Documentation**: See `../README.md` for general server info

## License

MIT - Same as the MindMeld Server project.
