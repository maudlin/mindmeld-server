/**
 * Server Factory
 * Creates and configures the Express server with all dependencies
 */

const express = require('express');
const path = require('path');

const createApiRoutes = require('../core/api-routes');
const createMiddleware = require('../core/middleware');
const createDocsRouter = require('../core/docs-route');
const { createMcpRoutes } = require('../core/mcp-routes');
const { createMcpSseEndpoint } = require('../core/mcp-sse');
const Logger = require('../utils/logger');
const { buildConfig } = require('../config/config');
const { createYjsRoutes } = require('../modules/yjs/routes');

/**
 * Create configured Express server
 * @param {object} config - Server configuration
 * @returns {object} Express app with configured services
 */
function createServer(config = {}) {
  const {
    port = 3001,
    corsOrigin = 'http://localhost:8080',
    jsonLimit = '50mb'
  } = config;

  Logger.info('Creating server with configuration', {
    port,
    corsOrigin,
    jsonLimit
  });

  // Create Express app
  const app = express();

  // Apply middleware
  const middleware = createMiddleware({ corsOrigin, jsonLimit });
  middleware.forEach(mw => app.use(mw));

  // Will be populated when WebSocket is set up
  let yjsService = null;

  // /maps router and MCP endpoints (enabled by default)
  if (!config || config.featureMapsApi !== false) {
    const createMapsRouter = require('../modules/maps/routes');
    const MapsService = require('../modules/maps/service');
    const sqliteFile =
      config.sqliteFile || path.join(process.cwd(), 'data', 'db.sqlite');

    // REST API for MindMeld client
    app.use('/maps', createMapsRouter({ sqliteFile }));

    // MCP endpoints for LLM agents (uses same service layer)
    const mapsService = new MapsService(sqliteFile);
    const mcpRoutes = createMcpRoutes({ mapsService });
    const mcpSseRoutes = createMcpSseEndpoint({ mapsService });
    app.use('/mcp', mcpRoutes);
    app.use('/mcp', mcpSseRoutes);

    // Log endpoints without exposing filesystem paths
    Logger.info('Maps API and MCP endpoints enabled', {
      endpoints: ['/maps', '/mcp', '/mcp/sse'],
      database: 'sqlite'
    });
  }

  // Dev-only docs (Redoc)
  if (process.env.NODE_ENV !== 'production') {
    app.use('/', createDocsRouter());
  }

  // 404 handler (after routes)
  app.use((req, res) => {
    const problem = {
      type: 'https://mindmeld.dev/problems/not-found',
      title: 'Not Found',
      status: 404,
      detail: `Route ${req.method} ${req.path} not found`,
      instance: req.originalUrl,
      error: 'Not Found' // legacy field
    };
    res
      .status(404)
      .set('Content-Type', 'application/problem+json')
      .json(problem);
  });

  // Global error handler (must be after routes and 404)
  const { errorHandler } = require('../core/error-handler');
  app.use(errorHandler);

  // Store minimal config on app
  app.locals.config = {
    port,
    corsOrigin,
    jsonLimit
  };

  // Add WebSocket setup function if Yjs is enabled
  const currentConfig = buildConfig(); // Get fresh config that reads current env vars
  Logger.debug('Checking SERVER_SYNC config', {
    serverSync: currentConfig.serverSync
  });
  if (currentConfig.serverSync === 'on') {
    app.setupWebSocket = httpServer => {
      const sqliteFile =
        config.sqliteFile || path.join(process.cwd(), 'data', 'db.sqlite');
      const yjsRoutes = createYjsRoutes(httpServer, {
        logger: Logger,
        dbFile: sqliteFile.replace('.sqlite', '-yjs.sqlite') // Use separate Yjs database
      });

      // Store YjsService reference for health checks
      yjsService = yjsRoutes.yjsService;

      // Now that we have YjsService, set up API routes with health checks
      const apiRoutes = createApiRoutes({ yjsService });
      app.use('/', apiRoutes);

      Logger.info('Yjs WebSocket server enabled');
      return yjsRoutes;
    };
    Logger.debug('setupWebSocket function added to app');
  } else {
    Logger.debug('SERVER_SYNC is off, WebSocket not enabled');

    // Set up API routes without YjsService
    const apiRoutes = createApiRoutes();
    app.use('/', apiRoutes);
  }

  Logger.info('Server factory completed');

  return app;
}

module.exports = createServer;
