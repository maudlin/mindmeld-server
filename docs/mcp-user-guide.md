# MCP User Guide

## What is MCP?

Model Context Protocol (MCP) allows AI assistants to connect to your MindMeld server and help you manage your mind maps. Think of it as giving your AI assistant direct access to read, create, and modify your mind maps.

## What You Can Do

Once connected, AI assistants can:

- 📋 **Browse** all your mind maps
- 🔍 **Read** specific maps and their content
- ✨ **Create** new mind maps for you
- ✏️ **Update** existing maps
- 🗑️ **Delete** maps when needed

## Quick Setup

### Step 1: Start Your MindMeld Server

```bash
# Enable MCP protocol
FEATURE_MCP=1 npm start

# Or set in .env file: FEATURE_MCP=1
npm start
```

Your server will start on `http://localhost:3001` with MCP endpoint at `/mcp/sse`

### Step 2: Connect Your AI Assistant

#### Warp Terminal (Recommended)

1. Open Warp Terminal
2. Go to Settings → Features → Model Context Protocol
3. Add this configuration:

```json
{
  "mindmeld-server": {
    "command": "npx",
    "args": ["-y", "mcp-remote", "http://localhost:3001/mcp/sse"]
  }
}
```

4. Save and restart Warp
5. Your AI assistant now has access to your mind maps! 🎉

#### Claude Desktop

1. Find your Claude Desktop config file:
   - **Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

2. Add this configuration:

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

3. Restart Claude Desktop
4. Your AI assistant can now work with your mind maps!

### Step 3: Test the Connection

Ask your AI assistant:

- "Can you list my mind maps?"
- "Show me the content of my Demo Map"
- "Create a new mind map called 'AI Projects'"

## Example Interactions

### Listing Maps

**You**: "What mind maps do I have?"

**AI**: "I can see you have 16 mind maps, including:

- Demo Map (49 bytes)
- MCP Test Map (76 bytes)
- Welcome Map (50 bytes)
- And 13 others..."

### Reading Map Content

**You**: "What's in my Demo Map?"

**AI**: "Your Demo Map contains:

- One node with the text 'Demo' positioned at coordinates [200,120]
- No connections between nodes
- Last updated on 2025-09-08"

### Creating Maps

**You**: "Create a mind map for planning my vacation"

**AI**: "I've created a new mind map called 'Vacation Planning' with:

- Central node: 'Vacation Planning'
- Connected to: Destinations, Budget, Activities, Accommodation
- The map ID is: abc123..."

## Troubleshooting

### "MCP server not found"

1. Make sure your MindMeld server is running (`npm start`)
2. Check that port 3001 is available
3. Verify the URL in your AI assistant config is correct

### "Connection refused"

1. Restart your MindMeld server
2. Check firewall settings for port 3001
3. Try using `http://127.0.0.1:3001/mcp/sse` instead of `localhost`

### "No maps found"

1. Create a test map through the web interface first
2. Make sure you have permission to access the maps
3. Check the server logs for any errors

## Privacy & Security

- **Local Only**: Your mind maps never leave your computer
- **Direct Connection**: AI assistants connect directly to your local server
- **No Account Required**: No sign-ups or external services
- **Full Control**: You can disconnect at any time

## Need Help?

- **Server Issues**: Check the server logs for error messages
- **Technical Details**: Visit the [MCP Developer Guide](mcp-developer-guide.md) for advanced configuration
- **Integration Help**: See [MCP Client Integration](mcp-client-integration.md) for detailed technical integration
- **Quick Test**: Verify server health at `http://localhost:3001/health`

## Supported AI Assistants

- ✅ **Warp Terminal** - Native MCP support
- ✅ **Claude Desktop** - Full MCP integration
- ✅ **Custom Apps** - Any MCP-compatible application
- 🔄 **Coming Soon**: More AI assistants adding MCP support

---

_Ready to let AI help manage your mind maps? Follow the setup steps above and start collaborating with your AI assistant!_
