/**
 * MindMeld Server - Main Entry Point
 * Production-ready server following MindMeld standards
 */

const path = require('path');
const fs = require('fs').promises;
const createServer = require('./factories/server-factory');
const Logger = require('./utils/logger');
const eventBus = require('./utils/event-bus');

// Configuration
const CONFIG = {
  port: process.env.PORT || 3001,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:8080',
  stateFilePath:
    process.env.STATE_FILE_PATH ||
    path.join(process.cwd(), 'data', 'state.json'),
  jsonLimit: process.env.JSON_LIMIT || '50mb',
  nodeEnv: process.env.NODE_ENV || 'development'
};

/**
 * Ensure data directory exists
 */
async function ensureDataDirectory() {
  const dataDir = path.dirname(CONFIG.stateFilePath);
  try {
    await fs.mkdir(dataDir, { recursive: true });
    Logger.info(`Data directory ensured: ${dataDir}`);
  } catch (error) {
    Logger.error('Failed to create data directory:', error);
    throw error;
  }
}

/**
 * Setup graceful shutdown
 */
function setupGracefulShutdown(server) {
  const shutdown = signal => {
    Logger.info(`Received ${signal}, shutting down gracefully...`);
    eventBus.emit('server.shutdown', {
      signal,
      timestamp: new Date().toISOString()
    });

    server.close(() => {
      Logger.info('Server closed');
      eventBus.emit('server.closed', { timestamp: new Date().toISOString() });
      process.exit(0);
    });

    // Force close after 10 seconds
    setTimeout(() => {
      Logger.error(
        'Could not close connections in time, forcefully shutting down'
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
  process.on('uncaughtException', error => {
    Logger.error('Uncaught Exception:', error);
    eventBus.emit('error.uncaught', {
      error: error.message,
      stack: error.stack
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
    Logger.info('Starting MindMeld Server...', CONFIG);

    // Setup error handling
    setupErrorHandlers();

    // Ensure data directory exists
    await ensureDataDirectory();

    // Create server
    const app = createServer(CONFIG);

    // Start listening
    const server = app.listen(CONFIG.port, () => {
      Logger.info(
        `🚀 MindMeld Server running on http://localhost:${CONFIG.port}`
      );
      Logger.info(`📁 State file: ${CONFIG.stateFilePath}`);
      Logger.info(`🔗 Health check: http://localhost:${CONFIG.port}/health`);
      Logger.info(`🌐 CORS origin: ${CONFIG.corsOrigin}`);
      Logger.info(
        `📊 Stats endpoint: http://localhost:${CONFIG.port}/api/state/stats`
      );

      eventBus.emit('server.started', {
        port: CONFIG.port,
        timestamp: new Date().toISOString(),
        config: CONFIG
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
