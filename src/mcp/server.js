/**
 * src/mcp/server.js
 * Minimal MCP server over stdio with read-only resources/tools (maps-first).
 */

const { config: CONFIG } = require('../config/config');
const logger = require('../utils/logger');

async function loadMcpSdk() {
  // Prefer the high-level McpServer API for resources/tools
  const mcpMod = await import('@modelcontextprotocol/sdk/server/mcp.js');
  const stdioMod = await import('@modelcontextprotocol/sdk/server/stdio.js');

  const McpServer =
    mcpMod.McpServer || (mcpMod.default && mcpMod.default.McpServer);
  const StdioServerTransport =
    stdioMod.StdioServerTransport ||
    (stdioMod.default && stdioMod.default.StdioServerTransport);

  if (!McpServer || !StdioServerTransport) {
    throw new Error(
      'Unsupported MCP SDK API: expected named exports McpServer and StdioServerTransport'
    );
  }
  return { McpServer, StdioServerTransport };
}

function ensureMcpEnabled() {
  if (!CONFIG.featureMcp) {
    throw new Error(
      'FEATURE_MCP is not enabled. Set FEATURE_MCP=1 to start the MCP server.'
    );
  }
  if (CONFIG.mcpTransport !== 'stdio') {
    throw new Error(
      `Unsupported MCP transport: ${CONFIG.mcpTransport}. Only 'stdio' is implemented at this time.`
    );
  }
}

async function startMcpServer() {
  ensureMcpEnabled();

  logger.info({ transport: CONFIG.mcpTransport }, 'Starting MCP server');

  const { McpServer, StdioServerTransport } = await loadMcpSdk();

  // Construct high-level McpServer
  const mcp = new McpServer({ name: 'mindmeld-mcp', version: '0.1.0' });

  // Health resource only (maps tools/resources to be added separately)
  mcp.resource('health', 'mindmeld://health', async _extra => {
    const payload = { status: 'ok', timestamp: new Date().toISOString() };
    return {
      contents: [
        { mimeType: 'application/json', text: JSON.stringify(payload) }
      ]
    };
  });

  const transport = new StdioServerTransport();
  await mcp.connect(transport);
  return mcp;
}

module.exports = { startMcpServer };
