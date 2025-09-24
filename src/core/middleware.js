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
      genReqId: (req) =>
        req.headers['x-request-id'] ||
        `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      // Ensure correct signature to avoid misclassification of log levels
      customLogLevel: (req, res, err) => {
        if (err || res.statusCode >= 500) {
          return 'error';
        }
        if (res.statusCode >= 400) {
          return 'warn';
        }
        return 'info';
      },
    }),
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
            method: req.method,
          });
        }
      },
    }),
  );

  // CORS configuration - support localhost/127.0.0.1 variants and HTTPS/HTTP
  const createCorsOrigin = (configuredOrigin) => {
    return (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) {
        return callback(null, true);
      }

      const originUrl = new URL(origin);
      const configUrl = new URL(configuredOrigin);

      // Allow if exactly matches configured origin
      if (origin === configuredOrigin) {
        return callback(null, true);
      }

      // Allow localhost <-> 127.0.0.1 variants with same port and protocol
      const isLocalhostVariant =
        (originUrl.hostname === 'localhost' &&
          configUrl.hostname === '127.0.0.1') ||
        (originUrl.hostname === '127.0.0.1' &&
          configUrl.hostname === 'localhost');

      if (
        isLocalhostVariant &&
        originUrl.port === configUrl.port &&
        originUrl.protocol === configUrl.protocol
      ) {
        return callback(null, true);
      }

      // Allow HTTPS for any localhost/127.0.0.1 on same port (secure upgrade)
      const isSecureUpgrade =
        originUrl.protocol === 'https:' &&
        configUrl.protocol === 'http:' &&
        (originUrl.hostname === 'localhost' ||
          originUrl.hostname === '127.0.0.1') &&
        (configUrl.hostname === 'localhost' ||
          configUrl.hostname === '127.0.0.1') &&
        originUrl.port === configUrl.port;

      if (isSecureUpgrade) {
        return callback(null, true);
      }

      return callback(new Error('Not allowed by CORS'));
    };
  };

  middleware.push(
    cors({
      origin: createCorsOrigin(corsOrigin),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'If-Match',
        'If-None-Match',
      ],
      exposedHeaders: [
        // Allow client to read caching/concurrency and rate limit metadata
        'ETag',
        'RateLimit-Limit',
        'RateLimit-Remaining',
        'RateLimit-Reset',
        'RateLimit-Policy',
      ],
    }),
  );

  // Basic rate limiting for write endpoints
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
  });
  middleware.push((req, res, next) => {
    const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    if (isWrite) {
      return limiter(req, res, next);
    } else {
      return next();
    }
  });

  logger.info(
    { corsOrigin, jsonLimit, middlewareCount: middleware.length },
    'Middleware configured',
  );

  return middleware;
}

module.exports = createMiddleware;
