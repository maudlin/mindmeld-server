# MindMeld Server Documentation

This directory contains comprehensive documentation for the MindMeld Server, with a focus on MCP (Model Context Protocol) integration for AI assistants.

## 📖 Documentation Index

### For End Users

- **[MCP User Guide](mcp-user-guide.md)** - Step-by-step setup for Warp, Claude Desktop, and other AI assistants
  - What is MCP and what can you do with it
  - Quick setup instructions
  - Example interactions
  - Troubleshooting guide

### For Developers

- **[MCP Developer Guide](mcp-developer-guide.md)** - Technical implementation reference
  - Architecture overview and transport layers
  - API reference for tools and resources
  - Integration examples (Node.js, HTTP testing)
  - Error handling and data formats
  - Configuration and deployment

### System Documentation

- **[Architecture Guide](architecture.md)** - Overall system design and patterns
- **[Maps API Documentation](maps-api.md)** - Core REST API that MCP extends
- **[Developer Guide](developer-guide.md)** - General development patterns and workflows

### Testing & Quality Assurance

- **[Testing Guide](testing-guide.md)** - Comprehensive testing documentation
  - Jest unit & integration tests
  - Playwright E2E API tests
  - Manual testing with curl/Postman
  - CI/CD integration examples

## 🏗️ Architecture Overview

```
AI Assistant (Warp/Claude) → mcp-remote → MindMeld Server
                                              ├── SSE Transport (/mcp/sse)
                                              └── HTTP JSON-RPC (/mcp/*)
```

## 🚀 Quick Reference

### Start Server

```bash
npm start  # MCP enabled automatically with Maps API
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
├── mcp-user-guide.md           # User-friendly setup guide
├── mcp-developer-guide.md      # Technical implementation guide
├── architecture.md             # Overall system architecture
├── maps-api.md                 # Maps API documentation
├── developer-guide.md          # General development guide
└── todo.md                     # Development roadmap
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
