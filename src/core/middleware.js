/**
 * Express Middleware Configuration
 * Centralized middleware setup following MindMeld patterns
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const pinoHttp = require('pino-http');
const logger = require('../utils/logger');
const eventBus = require('../utils/event-bus');

/**
 * Create middleware array for Express app
 * @param {object} config - Middleware configuration
 * @returns {Array} Array of middleware functions
 */
function createMiddleware(config = {}) {
  const { corsOrigin = 'http://localhost:8080', jsonLimit = '50mb' } = config;

  const middleware = [];

  // Request logging (first)
  middleware.push(
    pinoHttp({
      logger,
      genReqId: req =>
        req.headers['x-request-id'] ||
        `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      customLogLevel: (res, err) => {
        if (err || res.statusCode >= 500) {
          return 'error';
        }
        if (res.statusCode >= 400) {
          return 'warn';
        }
        return 'info';
      }
    })
  );

  // Security headers
  middleware.push(helmet());

  // JSON parsing with size limit
  middleware.push(
    express.json({
      limit: jsonLimit,
      verify: (req, res, buf) => {
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

  // CORS configuration (strict to provided origin)
  middleware.push(
    cors({
      origin: corsOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'If-Match',
        'If-None-Match'
      ],
      exposedHeaders: [
        // Allow client to read caching/concurrency and rate limit metadata
        'ETag',
        'RateLimit-Limit',
        'RateLimit-Remaining',
        'RateLimit-Reset',
        'RateLimit-Policy'
      ]
    })
  );

  // Basic rate limiting for write endpoints
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false
  });
  middleware.push((req, res, next) => {
    const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    if (isWrite) {
      return limiter(req, res, next);
    } else {
      return next();
    }
  });

  // Error handling middleware (kept to preserve existing behavior)
  middleware.push((error, req, res, _next) => {
    logger.error(
      { err: error, path: req.path, method: req.method },
      'Request error'
    );

    eventBus.emit('request.error', {
      method: req.method,
      path: req.path,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    const isDevelopment = process.env.NODE_ENV === 'development';

    res.status(error.status || 500).json({
      error: error.message,
      ...(isDevelopment && { stack: error.stack }),
      timestamp: new Date().toISOString()
    });
  });

  logger.info(
    { corsOrigin, jsonLimit, middlewareCount: middleware.length },
    'Middleware configured'
  );

  return middleware;
}

module.exports = createMiddleware;
