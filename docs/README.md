# MindMeld Server Documentation

This directory contains comprehensive documentation for the MindMeld Server.

## 📖 Documentation Index

### Getting Started

- **[MCP Client Integration](mcp-client-integration.md)** - MCP client integration for AI assistants
- **[REST Client Integration](rest-client-integration.md)** - REST API client integration patterns

### Developer Resources

- **[MCP Developer Guide](mcp-developer-guide.md)** - Complete integration reference
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
├── mcp-client-integration.md   # MCP client integration for AI assistants
├── mcp-developer-guide.md      # Complete integration reference
├── rest-client-integration.md  # REST API client integration patterns
├── architecture.md             # System architecture
├── developer-guide.md          # Development workflows
└── testing-guide.md            # Testing strategies
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
