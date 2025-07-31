/**
 * Server Factory
 * Creates and configures the Express server with all dependencies
 */

const express = require('express');
const path = require('path');

const FileStorage = require('../data/file-storage');
const StateService = require('../services/state-service');
const createApiRoutes = require('../core/api-routes');
const createMiddleware = require('../core/middleware');
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
    stateFilePath = path.join(process.cwd(), 'data', 'state.json'),
    jsonLimit = '50mb'
  } = config;

  Logger.info('Creating server with configuration', {
    port,
    corsOrigin,
    stateFilePath,
    jsonLimit
  });

  // Create Express app
  const app = express();

  // Create services with dependency injection
  const storage = new FileStorage(stateFilePath);
  const stateService = new StateService(storage);

  // Apply middleware
  const middleware = createMiddleware({ corsOrigin, jsonLimit });
  middleware.forEach(mw => app.use(mw));

  // Apply routes
  const apiRoutes = createApiRoutes(stateService);
  app.use('/', apiRoutes);

  // Store services on app for testing access
  app.locals.services = {
    storage,
    stateService
  };

  app.locals.config = {
    port,
    corsOrigin,
    stateFilePath,
    jsonLimit
  };

  Logger.info('Server factory completed');

  return app;
}

module.exports = createServer;
