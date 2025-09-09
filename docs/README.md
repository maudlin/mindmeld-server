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

## 🎨 Documentation Types

- **Integration Guides**: Step-by-step setup for clients (REST and MCP)
- **Reference Guides**: Architecture, development workflows, testing strategies
- **Examples**: Working code samples and configuration files

## 🚀 Quick Navigation by Use Case

- **Web/Mobile App Development**: Start with [REST Client Integration](rest-client-integration.md)
- **AI Assistant Integration**: Start with [MCP Client Integration](mcp-client-integration.md)
- **Server Development**: Start with [Developer Guide](developer-guide.md)
- **Manual API Testing**: Start with [Testing Guide](testing-guide.md)
- **System Architecture**: See [Architecture Guide](architecture.md)

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

## 📞 Getting Help

- **Server Setup**: See the main [README](../README.md) for quick start
- **Development**: Check [Developer Guide](developer-guide.md) for workflows
- **Issues**: Create GitHub issues for bugs or feature requests

---

**Complete guide index for the MindMeld Server documentation suite.**
