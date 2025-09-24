/**
 * MindMeld Server - Main Entry Point
 * Production-ready server following MindMeld standards
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;
const createServer = require('./factories/server-factory');
const Logger = require('./utils/logger');
const eventBus = require('./utils/event-bus');
const { config: CONFIG } = require('./config/config');

/**
 * Ensure data directory exists
 */
async function ensureDataDirectory() {
  try {
    if (!CONFIG || CONFIG.featureMapsApi === false) {
      return;
    }
    const dataDir = path.dirname(CONFIG.sqliteFile);
    await fs.mkdir(dataDir, { recursive: true });

    // Log relative path only (not full filesystem path)
    const relativePath = path.relative(process.cwd(), dataDir) || 'data';
    Logger.info(`Data directory ensured: ${relativePath}`);
  } catch (error) {
    Logger.error('Failed to create data directory:', error);
    throw error;
  }
}

/**
 * Setup graceful shutdown
 */
function setupGracefulShutdown(server) {
  const shutdown = (signal) => {
    Logger.info(`Received ${signal}, shutting down gracefully...`);
    eventBus.emit('server.shutdown', {
      signal,
      timestamp: new Date().toISOString(),
    });

    server.close(() => {
      Logger.info('Server closed');
      eventBus.emit('server.closed', { timestamp: new Date().toISOString() });
      process.exit(0);
    });

    // Force close after 10 seconds
    setTimeout(() => {
      Logger.error(
        'Could not close connections in time, forcefully shutting down',
      );
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

/**
 * Setup global error handlers
 */
function setupErrorHandlers() {
  process.on('uncaughtException', (error) => {
    Logger.error('Uncaught Exception:', error);
    eventBus.emit('error.uncaught', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    Logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    eventBus.emit('error.unhandled-rejection', { reason, promise });
  });
}

/**
 * Start the server
 */
async function startServer() {
  try {
    // Log sanitized config (no file paths in production)
    const sanitizedConfig = {
      port: CONFIG.port,
      corsOrigin: CONFIG.corsOrigin,
      nodeEnv: CONFIG.nodeEnv,
      featureMapsApi: CONFIG.featureMapsApi,
      featureMcp: CONFIG.featureMcp,
      mcpTransport: CONFIG.mcpTransport,
    };
    Logger.info({ config: sanitizedConfig }, 'Starting MindMeld Server...');

    // Setup error handling
    setupErrorHandlers();

    // Ensure data directory exists
    await ensureDataDirectory();

    // Create server
    const app = createServer(CONFIG);

    // Start listening
    const server = app.listen(CONFIG.port, () => {
      Logger.info({ port: CONFIG.port }, '🚀 MindMeld Server running');
      Logger.info({ health: '/health', ready: '/ready' }, 'Probes available');
      Logger.info({ corsOrigin: CONFIG.corsOrigin }, '🌐 CORS origin');
      Logger.info({ maps: '/maps' }, '🗺️ Maps API enabled');

      eventBus.emit('server.started', {
        port: CONFIG.port,
        timestamp: new Date().toISOString(),
        nodeEnv: CONFIG.nodeEnv,
        features: {
          maps: CONFIG.featureMapsApi,
          mcp: CONFIG.featureMcp,
        },
      });
    });

    // Setup graceful shutdown
    setupGracefulShutdown(server);

    return { app, server };
  } catch (error) {
    Logger.error('Failed to start server:', error);
    eventBus.emit('server.start-failed', { error: error.message });
    process.exit(1);
  }
}

// Start server if this file is run directly
if (require.main === module) {
  startServer();
}

module.exports = { startServer, CONFIG };
