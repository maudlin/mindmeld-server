/**
 * Server Factory
 * Creates and configures the Express server with all dependencies
 */

const express = require('express');
const path = require('path');

const createApiRoutes = require('../core/api-routes');
const createMiddleware = require('../core/middleware');
const createDocsRouter = require('../core/docs-route');
const Logger = require('../utils/logger');

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

  // Apply routes
  const apiRoutes = createApiRoutes();
  app.use('/', apiRoutes);

  // /maps router (enabled by default)
  if (!config || config.featureMapsApi !== false) {
    const createMapsRouter = require('../modules/maps/routes');
    const sqliteFile =
      config.sqliteFile || path.join(process.cwd(), 'data', 'db.sqlite');
    app.use('/maps', createMapsRouter({ sqliteFile }));
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

  Logger.info('Server factory completed');

  return app;
}

module.exports = createServer;
