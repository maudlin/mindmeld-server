/**
 * Structured logger (pino)
 * - JSON logs by default; pretty in development
 * - Use with pino-http in middleware for request logging
 */

const pino = require('pino');

const isDev = process.env.NODE_ENV !== 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          singleLine: true
        }
      }
    : undefined,
  base: undefined // don't include pid, hostname by default
});

module.exports = logger;
