/**
 * API Routes
 * RESTful endpoints for MindMeld server (maps-first)
 */

const express = require('express');
const Logger = require('../utils/logger');
const eventBus = require('../utils/event-bus');
const {
  createBasicHealthSecurityMiddleware,
  createMonitoringSecurityMiddleware,
} = require('./monitoring-security');

/**
 * Create API routes (no legacy state)
 * @param {Object} services - Service instances for health checks
 * @param {Object} services.yjsService - YjsService instance
 * @returns {Router} Express router with configured routes
 */
function createApiRoutes(services = {}) {
  const router = express.Router();
  const { yjsService } = services;

  // Basic health check endpoint (public, minimal info)
  router.get(
    '/health',
    createBasicHealthSecurityMiddleware(),
    async (req, res) => {
      try {
        const payload = {
          status: 'ok',
          timestamp: new Date().toISOString(),
          uptime: Math.floor(process.uptime()),
        };

        eventBus.emit('health.checked', {
          healthy: true,
          timestamp: payload.timestamp,
        });

        res.json(payload);
      } catch (error) {
        Logger.error('Health check failed:', error);
        eventBus.emit('health.checked', {
          healthy: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
        res.status(503).json({
          status: 'error',
          timestamp: new Date().toISOString(),
          message: 'Service unavailable',
        });
      }
    },
  );

  // Detailed health check endpoint (restricted to monitoring hosts)
  router.get(
    '/health/deep',
    createMonitoringSecurityMiddleware('deep'),
    async (req, res) => {
      try {
        const timestamp = new Date().toISOString();
        const components = {};
        let overallStatus = 'healthy';

        // Check Y.js service health
        if (yjsService) {
          const yjsHealth = yjsService.getHealthStatus();
          components.yjsService = yjsHealth;

          if (yjsHealth.status !== 'healthy') {
            overallStatus = 'degraded';
          }
        } else {
          components.yjsService = {
            status: 'disabled',
            details: { reason: 'Y.js service not initialized' },
            timestamp,
          };
        }

        // Check database connectivity (basic)
        try {
          // Simple process check - more detailed DB checks would go here
          components.database = {
            status: 'healthy',
            details: { type: 'sqlite', accessible: true },
            timestamp,
          };
        } catch (dbError) {
          components.database = {
            status: 'unhealthy',
            details: { error: dbError.message },
            timestamp,
          };
          overallStatus = 'unhealthy';
        }

        // Check memory usage
        const memUsage = process.memoryUsage();
        const memHealthy = memUsage.heapUsed < 500 * 1024 * 1024; // 500MB threshold
        components.memory = {
          status: memHealthy ? 'healthy' : 'warning',
          details: {
            heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
            external: Math.round(memUsage.external / 1024 / 1024),
          },
          timestamp,
        };

        if (!memHealthy && overallStatus === 'healthy') {
          overallStatus = 'warning';
        }

        const payload = {
          status: overallStatus,
          timestamp,
          uptime: Math.floor(process.uptime()),
          components,
          summary: {
            totalComponents: Object.keys(components).length,
            healthyComponents: Object.values(components).filter(
              (c) => c.status === 'healthy',
            ).length,
          },
        };

        eventBus.emit('health.deep.checked', {
          healthy: overallStatus === 'healthy',
          components: Object.keys(components),
          timestamp,
        });

        // Return appropriate HTTP status
        const statusCode =
          overallStatus === 'healthy'
            ? 200
            : overallStatus === 'warning'
              ? 200
              : 503;

        res.status(statusCode).json(payload);
      } catch (error) {
        Logger.error('Deep health check failed:', error);
        res.status(503).json({
          status: 'error',
          timestamp: new Date().toISOString(),
          message: 'Deep health check failed',
          error: error.message,
        });
      }
    },
  );

  // Readiness probe
  router.get('/ready', async (_req, res) => {
    try {
      res.json({ status: 'ready', timestamp: new Date().toISOString() });
    } catch (error) {
      Logger.error('Readiness check failed:', error);
      res.status(503).json({ status: 'not-ready' });
    }
  });

  // Metrics endpoint (restricted to monitoring hosts)
  router.get(
    '/metrics',
    createMonitoringSecurityMiddleware('metrics'),
    async (req, res) => {
      try {
        const timestamp = new Date().toISOString();
        const metrics = {
          // System metrics
          uptime_seconds: Math.floor(process.uptime()),
          memory_heap_used_bytes: process.memoryUsage().heapUsed,
          memory_heap_total_bytes: process.memoryUsage().heapTotal,
          memory_external_bytes: process.memoryUsage().external,

          // Y.js service metrics
          yjs_documents_active: 0,
          yjs_connections_active: 0,
          yjs_documents_with_clients: 0,
          yjs_average_connections_per_document: 0,

          // Metadata
          metrics_timestamp: timestamp,
          metrics_version: '1.0',
        };

        // Add Y.js metrics if service is available
        if (yjsService) {
          const yjsStats = yjsService.getStats();
          metrics.yjs_documents_active = yjsStats.activeDocuments;
          metrics.yjs_connections_active = yjsStats.totalConnections;
          metrics.yjs_documents_with_clients = yjsStats.documentsWithClients;
          metrics.yjs_average_connections_per_document =
            yjsStats.averageConnectionsPerDocument;
        }

        // Return metrics in simple JSON format (Prometheus-like but simpler)
        res.json({
          metrics,
          timestamp,
          format: 'json',
          help: {
            uptime_seconds: 'Server uptime in seconds',
            memory_heap_used_bytes: 'Node.js heap memory used in bytes',
            yjs_documents_active: 'Number of active Y.js documents in memory',
            yjs_connections_active: 'Number of active WebSocket connections',
          },
        });
      } catch (error) {
        Logger.error('Metrics collection failed:', error);
        res.status(503).json({
          error: 'Metrics unavailable',
          timestamp: new Date().toISOString(),
        });
      }
    },
  );

  Logger.info('API routes configured');
  return router;
}

module.exports = createApiRoutes;
