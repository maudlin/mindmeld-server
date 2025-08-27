/**
 * src/mcp/server.js
 * Minimal MCP server scaffold over stdio with read-only resources/tools for MS-41/MS-42.
 * Uses dynamic import to load the MCP SDK to avoid ESM/CJS friction.
 */

const createApp = require('../factories/server-factory');
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

  // Build DI graph without opening a TCP port
  const app = createApp(CONFIG);
  const services = app.locals && app.locals.services ? app.locals.services : {};
  const stateService = services.stateService;

  if (!stateService) {
    throw new Error(
      'stateService not available; server factory must expose app.locals.services.stateService'
    );
  }

  const { McpServer, StdioServerTransport } = await loadMcpSdk();

  // Construct high-level McpServer
  const mcp = new McpServer({ name: 'mindmeld-mcp', version: '0.1.0' });

  // ---- MS-42: Resources (health + legacy state) ----
  mcp.resource('health', 'mindmeld://health', async _extra => {
    const stats = await stateService.getStats();
    return {
      contents: [
        {
          mimeType: 'application/json',
          text: JSON.stringify({
            status: 'ok',
            timestamp: new Date().toISOString(),
            stats
          })
        }
      ]
    };
  });

  mcp.resource('state', 'mindmeld://state', async _extra => {
    const state = await stateService.readState();
    return {
      contents: [{ mimeType: 'application/json', text: JSON.stringify(state) }]
    };
  });

  // ---- MS-42: Tools (state.get) ----
  mcp.tool(
    'state.get',
    'Return the legacy single global state',
    async _extra => {
      const state = await stateService.readState();
      return {
        content: [{ type: 'text', text: JSON.stringify(state) }]
      };
    }
  );

  const transport = new StdioServerTransport();
  await mcp.connect(transport);
  return mcp;
}

module.exports = { startMcpServer };
