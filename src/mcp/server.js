/**
 * src/mcp/server.js
 * Minimal MCP server scaffold over stdio with read-only resources/tools for MS-41/MS-42.
 * Uses dynamic import to load the MCP SDK to avoid ESM/CJS friction.
 */

const createApp = require('../factories/server-factory');
const { config: CONFIG } = require('../config/config');
const logger = require('../utils/logger');

async function loadMcpSdk() {
  // Prefer ESM import; Node 24 supports dynamic import in CJS
  const mod = await import('@modelcontextprotocol/sdk/server');
  // Handle possible API shapes
  const Server =
    mod.Server || (mod.default && mod.default.Server) || mod.createServer;
  const StdioServerTransport =
    mod.StdioServerTransport ||
    (mod.default && mod.default.StdioServerTransport);
  if (!Server || !StdioServerTransport) {
    throw new Error(
      'Unsupported MCP SDK API: expected { Server, StdioServerTransport }'
    );
  }
  return { Server, StdioServerTransport };
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

  const { Server, StdioServerTransport } = await loadMcpSdk();

  // Construct server
  const server = new Server({ name: 'mindmeld-mcp', version: '0.1.0' });

  // ---- MS-42: Resources (health + legacy state) ----
  // Depending on SDK, this may be server.resources.add or similar. We guard and no-op if unavailable.
  if (server.resources && typeof server.resources.add === 'function') {
    server.resources.add({
      uri: 'mindmeld://health',
      mimeType: 'application/json',
      async get() {
        const stats = await stateService.getStats();
        return { status: 'ok', timestamp: new Date().toISOString(), stats };
      }
    });

    server.resources.add({
      uri: 'mindmeld://state',
      mimeType: 'application/json',
      async get() {
        const state = await stateService.readState();
        return state;
      }
    });
  } else {
    logger.warn(
      'MCP SDK does not expose resources.add; skipping resource registration'
    );
  }

  // ---- MS-42: Tools (state.get) ----
  if (server.tools && typeof server.tools.add === 'function') {
    server.tools.add({
      name: 'state.get',
      description: 'Return the legacy single global state',
      parameters: {},
      async invoke() {
        const state = await stateService.readState();
        return state;
      }
    });
  } else {
    logger.warn(
      'MCP SDK does not expose tools.add; skipping tool registration'
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}

module.exports = { startMcpServer };
