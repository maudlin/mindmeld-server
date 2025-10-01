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
const createClientBundleRouter = require('../modules/yjs/client-bundle-route');

/**
 * Create configured Express server
 * @param {object} config - Server configuration
 * @returns {object} Express app with configured services
 */
function createServer(config = {}) {
  const {
    port = 3001,
    corsOrigin = 'http://127.0.0.1:8080', // Updated default for better localhost compatibility
    jsonLimit = '50mb',
  } = config;

  Logger.info('Creating server with configuration', {
    port,
    corsOrigin,
    jsonLimit,
  });

  // Create Express app
  const app = express();

  // Apply middleware
  const middleware = createMiddleware({ corsOrigin, jsonLimit });
  middleware.forEach((mw) => app.use(mw));

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
      database: 'sqlite',
    });
  }

  // Dev-only docs (Redoc)
  if (process.env.NODE_ENV !== 'production') {
    app.use('/', createDocsRouter());
  }

  // Client bundle route (serves pre-built Yjs client for zero-dependency clients)
  app.use('/client', createClientBundleRouter());
  Logger.info('Client bundle route enabled', {
    endpoint: '/client/mindmeld-yjs-client.js',
  });

  // Store minimal config on app
  app.locals.config = {
    port,
    corsOrigin,
    jsonLimit,
  };

  // Add WebSocket setup function if Yjs is enabled
  const currentConfig = buildConfig(); // Get fresh config that reads current env vars
  Logger.debug('Checking SERVER_SYNC config', {
    serverSync: currentConfig.serverSync,
  });
  if (currentConfig.serverSync === 'on') {
    app.setupWebSocket = (httpServer) => {
      const sqliteFile =
        config.sqliteFile || path.join(process.cwd(), 'data', 'db.sqlite');
      const yjsRoutes = createYjsRoutes(httpServer, {
        logger: Logger,
        dbFile: sqliteFile.replace('.sqlite', '-yjs.sqlite'), // Use separate Yjs database
      });

      // Store YjsService reference for health checks
      yjsService = yjsRoutes.yjsService;

      Logger.info('Yjs WebSocket server enabled');
      return yjsRoutes;
    };

    // Setup function to register API routes after WebSocket initialization
    app.setupApiRoutes = () => {
      // Now that we have YjsService, set up API routes with health checks
      const apiRoutes = createApiRoutes({ yjsService });
      app.use('/', apiRoutes);
      Logger.info('Health and API routes registered with YjsService');
    };

    // Setup function for final handlers in WebSocket mode
    app.setupFinalHandlers = () => {
      if (app._finalHandlersSetup) {
        return; // Already set up
      }

      // 404 handler (after all routes)
      app.use((req, res) => {
        const problem = {
          type: 'https://mindmeld.dev/problems/not-found',
          title: 'Not Found',
          status: 404,
          detail: `Route ${req.method} ${req.path} not found`,
          instance: req.originalUrl,
          error: 'Not Found', // legacy field
        };
        res
          .status(404)
          .set('Content-Type', 'application/problem+json')
          .json(problem);
      });

      // Global error handler (must be after routes and 404)
      const { errorHandler } = require('../core/error-handler');
      app.use(errorHandler);

      app._finalHandlersSetup = true;
    };

    Logger.debug(
      'setupWebSocket function added to app - will be called after HTTP server starts',
    );
  } else {
    Logger.debug('SERVER_SYNC is off, WebSocket not enabled');

    // Set up API routes without YjsService
    const apiRoutes = createApiRoutes();
    app.use('/', apiRoutes);

    // For non-WebSocket mode, setup final handlers immediately
    const setupFinalHandlers = () => {
      // 404 handler (after all routes)
      app.use((req, res) => {
        const problem = {
          type: 'https://mindmeld.dev/problems/not-found',
          title: 'Not Found',
          status: 404,
          detail: `Route ${req.method} ${req.path} not found`,
          instance: req.originalUrl,
          error: 'Not Found', // legacy field
        };
        res
          .status(404)
          .set('Content-Type', 'application/problem+json')
          .json(problem);
      });

      // Global error handler (must be after routes and 404)
      const { errorHandler } = require('../core/error-handler');
      app.use(errorHandler);
    };

    // Call it immediately for non-WebSocket mode
    setupFinalHandlers();

    // Mark that final handlers are already set up
    app._finalHandlersSetup = true;
  }

  Logger.info('API routes configured');

  Logger.info('Server factory completed');

  return app;
}

module.exports = createServer;
