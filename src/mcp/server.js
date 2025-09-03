// This file has been removed as part of MCP simplification.
// STDIO transport has been removed in favor of SSE + HTTP JSON-RPC.
// See src/mcp/http-server.js for SSE implementation.
// See src/core/mcp-routes.js for HTTP JSON-RPC fallback.

throw new Error('STDIO MCP transport has been removed. Use SSE or HTTP transports instead.');

module.exports = {};
