/**
 * Centralized logging utility
 * Provides consistent logging across the application
 */

class Logger {
  static info(message, data = {}) {
    console.log(`${new Date().toISOString()} [INFO] ${message}`, data);
  }

  static error(message, error = null) {
    console.error(`${new Date().toISOString()} [ERROR] ${message}`, error);
  }

  static warn(message, data = {}) {
    console.warn(`${new Date().toISOString()} [WARN] ${message}`, data);
  }

  static debug(message, data = {}) {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`${new Date().toISOString()} [DEBUG] ${message}`, data);
    }
  }

  static request(method, path, statusCode = null) {
    const status = statusCode ? ` ${statusCode}` : '';
    console.log(
      `${new Date().toISOString()} [HTTP] ${method} ${path}${status}`
    );
  }
}

module.exports = Logger;
