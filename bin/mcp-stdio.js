#!/usr/bin/env node

// bin/mcp-stdio.js
// Entry point to launch the MCP server over stdio.
// Ensures FEATURE_MCP is on by default.

process.env.FEATURE_MCP = process.env.FEATURE_MCP || '1';
process.env.MCP_TRANSPORT = process.env.MCP_TRANSPORT || 'stdio';

(async () => {
  try {
    const logger = require('../src/utils/logger');
    const { startMcpServer } = require('../src/mcp/server');
    await startMcpServer();
    logger.info('MCP stdio server started');
  } catch (err) {
    // MCP clients typically read stderr, keep this simple
    console.error('MCP server failed:', err && err.stack ? err.stack : err);
    process.exit(1);
  }
})();
