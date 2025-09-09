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

## 🏗️ Architecture Overview

```
AI Assistant (Warp/Claude) → mcp-remote → MindMeld Server (SSE)
                                      ↗
                                   HTTP fallback
```

## 🔧 Configuration Files

Located in project root:

- `warp-mcp.json` - Proven Warp MCP configuration
- `package.json` - Server dependencies and scripts
- `test-mcp.js` - MCP integration test suite

## 🚀 Quick Reference

### Start Server

```bash
FEATURE_MCP=1 npm start
```

### Test Connection

```bash
curl http://localhost:3001/health
npm run mcp:test
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
├── mcp-developer-guide.md      # Complete integration guide
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

## 📞 Support

- **Issues**: Create GitHub issues for bugs or feature requests
- **Questions**: Check the developer guide first, then create a discussion
- **Testing**: Use `npm run mcp:test` to validate your setup

---

**Last Updated**: January 2025  
**MCP Protocol Version**: 2024-11-05  
**Tested Integrations**: Warp Terminal, Claude Desktop
