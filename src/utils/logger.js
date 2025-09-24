/**
 * Structured logger (pino)
 * - JSON logs by default; pretty in development
 * - Use with pino-http in middleware for request logging
 */

const pino = require('pino');

const isDev = process.env.NODE_ENV !== 'production';
const isTesting = process.env.NODE_ENV === 'test';

const pinoOptions = {
  level:
    process.env.LOG_LEVEL || (isTesting ? 'silent' : isDev ? 'debug' : 'info'),
  base: undefined, // don't include pid, hostname by default
};

if (isDev) {
  pinoOptions.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      singleLine: true,
    },
  };
}

const logger = pino(pinoOptions);

module.exports = logger;
