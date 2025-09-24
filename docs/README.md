# MindMeld Server Documentation

This directory contains comprehensive documentation for the MindMeld Server - a production-ready REST API with real-time collaboration, MCP integration, and flexible client architecture.

## 📚 Documentation Index

### Getting Started

- **[Client Integration Guide](client-integration.md)** - REST API and DataProvider client integration patterns
- **[MCP Client Integration](mcp-client-integration.md)** - AI assistant integration via MCP protocol
- **[DataProvider Reference](dataprovider-reference.md)** - Technical reference for client provider architecture

### AI Integration (MCP)

- **[MCP User Guide](mcp-user-guide.md)** - User-friendly setup for AI assistants
- **[MCP Developer Guide](mcp-developer-guide.md)** - Complete MCP integration reference
  - Node.js integration examples
  - Python integration examples
  - Claude Desktop configuration
  - Custom application development
  - API reference and error handling
  - Production deployment guidance

### System Documentation

- **[Architecture Guide](architecture.md)** - System design and patterns
- **[Developer Guide](developer-guide.md)** - Development workflows and testing
- **[Testing Guide](testing-guide.md)** - Manual API testing workflows
- **[Server Administration](server-admin.md)** - Database backup, health monitoring, and admin tools
- **[Health Checks](health-checks.md)** - Code quality health check documentation
- **[Monitoring Security](monitoring-security.md)** - Runtime monitoring endpoints and security

## 🏗️ Architecture Overview

```
Client Applications → MindMeld Server
    ├── REST API (/maps)
    ├── WebSocket (YJS) (ws://localhost:3001/yjs/{mapId})
    └── MCP Protocol (/mcp/sse)

AI Assistant (Warp/Claude) → mcp-remote → MCP Endpoints
                                              ├── SSE Transport (/mcp/sse)
                                              └── HTTP JSON-RPC (/mcp/*)

Browser Clients → DataProvider Architecture
    ├── LocalJSONProvider (localStorage)
    └── YjsProvider (real-time collaboration)
```

## 🚀 Quick Reference

### Start Server

```bash
# Standard server (Maps API + MCP)
npm start

# With real-time collaboration
SERVER_SYNC=on DATA_PROVIDER=yjs npm start

# MCP disabled
FEATURE_MCP=0 npm start
```

### Test Connection

```bash
curl http://localhost:3001/health
```

### Warp Configuration

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

## 🛠️ Development

### Project Structure

```
docs/
├── README.md                    # This index file
├── mcp-client-integration.md   # MCP client integration for AI assistants
├── mcp-developer-guide.md      # Complete integration reference
├── mcp-user-guide.md           # User-friendly MCP setup guide
├── client-integration.md       # REST API and DataProvider client integration
├── dataprovider-reference.md   # Technical reference for client providers
├── architecture.md             # System architecture
├── developer-guide.md          # Development workflows
├── testing-guide.md            # Testing strategies
├── server-admin.md             # Server administration and monitoring
├── health-checks.md            # Code quality health check documentation
├── monitoring-security.md      # Runtime monitoring endpoints and security
└── admin-testing.md            # Admin command testing
```

### Contributing to Documentation

1. Keep documentation up-to-date with code changes
2. Use kebab-case for file names
3. Include working examples and tested configurations
4. Link between documents for easy navigation

### MCP Integration Status

✅ **Working Features:**

- All MCP tools: `maps.list`, `maps.get`, `maps.create`, `maps.update`, `maps.delete`
- MCP resources: `mindmeld://health`, `mindmeld://maps`
- Both SSE and HTTP transports
- Integration with Warp Terminal and Claude Desktop

🔧 **Known Issues:**

- SSE individual map resources (`mindmeld://maps/{id}`) under investigation
- Use `maps.get` tool as workaround (provides identical functionality)

## 📞 Support

- **Issues**: Create GitHub issues for bugs or feature requests
- **Questions**: Check the user/developer guides first, then create a discussion
- **Testing**: Use `curl http://localhost:3001/health` to validate server status

---

**Last Updated**: September 2025  
**MCP Protocol Version**: 2024-11-05  
**Tested Integrations**: Warp Terminal, Claude Desktop
