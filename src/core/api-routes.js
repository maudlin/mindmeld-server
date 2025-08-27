/**
 * API Routes
 * RESTful endpoints for MindMeld server (maps-first)
 */

const express = require('express');
const Logger = require('../utils/logger');
const eventBus = require('../utils/event-bus');

/**
 * Create API routes (no legacy state)
 * @returns {Router} Express router with configured routes
 */
function createApiRoutes() {
  const router = express.Router();

  // Health check endpoint
  router.get('/health', async (req, res) => {
    try {
      const payload = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      };

      eventBus.emit('health.checked', {
        healthy: true,
        timestamp: payload.timestamp
      });

      res.json(payload);
    } catch (error) {
      Logger.error('Health check failed:', error);
      eventBus.emit('health.checked', {
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      res.status(503).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        message: 'Service unavailable'
      });
    }
  });

  // Readiness probe
  router.get('/ready', async (_req, res) => {
    try {
      res.json({ status: 'ready', timestamp: new Date().toISOString() });
    } catch (error) {
      Logger.error('Readiness check failed:', error);
      res.status(503).json({ status: 'not-ready' });
    }
  });

  Logger.info('API routes configured');
  return router;
}

module.exports = createApiRoutes;
