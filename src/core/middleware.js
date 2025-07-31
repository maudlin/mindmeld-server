/**
 * Express Middleware Configuration
 * Centralized middleware setup following MindMeld patterns
 */

const express = require('express');
const cors = require('cors');
const Logger = require('../utils/logger');
const eventBus = require('../utils/event-bus');

/**
 * Create middleware array for Express app
 * @param {object} config - Middleware configuration
 * @returns {Array} Array of middleware functions
 */
function createMiddleware(config = {}) {
  const { corsOrigin = 'http://localhost:8080', jsonLimit = '50mb' } = config;

  const middleware = [];

  // JSON parsing with size limit
  middleware.push(
    express.json({
      limit: jsonLimit,
      verify: (req, res, buf) => {
        // Emit event for large payloads
        if (buf.length > 1024 * 1024) {
          // > 1MB
          eventBus.emit('request.large-payload', {
            size: buf.length,
            endpoint: req.path,
            method: req.method
          });
        }
      }
    })
  );

  // CORS configuration
  middleware.push(
    cors({
      origin: corsOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    })
  );

  // Request logging middleware
  middleware.push((req, res, next) => {
    const startTime = Date.now();

    // Log request
    Logger.request(req.method, req.path);
    eventBus.emit('request.started', {
      method: req.method,
      path: req.path,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });

    // Hook into response to log completion
    const originalSend = res.send;
    res.send = function(data) {
      const duration = Date.now() - startTime;

      Logger.request(req.method, req.path, res.statusCode);
      eventBus.emit('request.completed', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        timestamp: new Date().toISOString()
      });

      return originalSend.call(this, data);
    };

    next();
  });

  // Error handling middleware
  middleware.push((error, req, res, _next) => {
    Logger.error(`Request error on ${req.method} ${req.path}:`, error);

    eventBus.emit('request.error', {
      method: req.method,
      path: req.path,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    // Don't expose internal errors in production
    const isDevelopment = process.env.NODE_ENV === 'development';

    res.status(error.status || 500).json({
      error: error.message,
      ...(isDevelopment && { stack: error.stack }),
      timestamp: new Date().toISOString()
    });
  });

  Logger.info('Middleware configured', {
    corsOrigin,
    jsonLimit,
    middlewareCount: middleware.length
  });

  return middleware;
}

module.exports = createMiddleware;
