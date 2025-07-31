/**
 * API Routes
 * RESTful endpoints for MindMeld state management
 */

const express = require('express');
const Logger = require('../utils/logger');
const eventBus = require('../utils/event-bus');

/**
 * Create API routes with injected services
 * @param {StateService} stateService - Injected state service
 * @returns {Router} Express router with configured routes
 */
function createApiRoutes(stateService) {
  const router = express.Router();

  /**
   * Health check endpoint
   * GET /health
   */
  router.get('/health', async(req, res) => {
    try {
      const stats = await stateService.getStateStats();

      eventBus.emit('health.checked', {
        healthy: true,
        stats,
        timestamp: new Date().toISOString()
      });

      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        stats
      });
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
        error: 'Service unavailable'
      });
    }
  });

  /**
   * Get current state
   * GET /api/state
   */
  router.get('/api/state', async(req, res) => {
    try {
      eventBus.emit('api.state.get-requested', {
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      });

      const state = await stateService.getCurrentState();

      eventBus.emit('api.state.get-completed', {
        success: true,
        notesCount: state.notes?.length || 0,
        connectionsCount: state.connections?.length || 0,
        timestamp: new Date().toISOString()
      });

      res.json(state);
    } catch (error) {
      Logger.error('Failed to get state:', error);

      eventBus.emit('api.state.get-failed', {
        error: error.message,
        timestamp: new Date().toISOString()
      });

      res.status(500).json({
        error: 'Failed to retrieve state',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Save state
   * PUT /api/state
   */
  router.put('/api/state', async(req, res) => {
    try {
      eventBus.emit('api.state.put-requested', {
        notesCount: req.body.notes?.length || 0,
        connectionsCount: req.body.connections?.length || 0,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      });

      const result = await stateService.saveState(req.body);

      eventBus.emit('api.state.put-completed', {
        success: true,
        stats: result,
        timestamp: new Date().toISOString()
      });

      res.json(result);
    } catch (error) {
      Logger.error('Failed to save state:', error);

      eventBus.emit('api.state.put-failed', {
        error: error.message,
        timestamp: new Date().toISOString()
      });

      // Return appropriate error status
      const status = error.message.includes('Invalid state') ? 400 : 500;

      res.status(status).json({
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Get state statistics (useful for monitoring)
   * GET /api/state/stats
   */
  router.get('/api/state/stats', async(req, res) => {
    try {
      const stats = await stateService.getStateStats();

      eventBus.emit('api.stats.requested', {
        stats,
        timestamp: new Date().toISOString()
      });

      res.json(stats);
    } catch (error) {
      Logger.error('Failed to get state stats:', error);

      res.status(500).json({
        error: 'Failed to get statistics',
        timestamp: new Date().toISOString()
      });
    }
  });

  Logger.info('API routes configured');
  return router;
}

module.exports = createApiRoutes;
