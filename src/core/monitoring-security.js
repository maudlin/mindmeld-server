/**
 * Security middleware for monitoring endpoints
 * Restricts access to health checks and metrics based on client IP
 */

const Logger = require('../utils/logger');

/**
 * Get list of allowed monitoring hosts from environment
 * Always includes localhost variants for security
 */
function getAllowedMonitoringHosts() {
  const defaultHosts = [
    '127.0.0.1',
    '::1', // IPv6 localhost
    'localhost',
    '::ffff:127.0.0.1', // IPv4-mapped IPv6 localhost
  ];

  // Add configured hosts (comma-separated)
  const configuredHosts = process.env.MONITORING_HOSTS
    ? process.env.MONITORING_HOSTS.split(',')
        .map((h) => h.trim())
        .filter(Boolean)
    : [];

  return [...defaultHosts, ...configuredHosts];
}

/**
 * Extract client IP from request, handling proxy headers
 */
function getClientIP(req) {
  // Handle common proxy headers (in order of trust)
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor) {
    // Take the first IP (original client) from comma-separated list
    return xForwardedFor.split(',')[0].trim();
  }

  const xRealIP = req.headers['x-real-ip'];
  if (xRealIP) {
    return xRealIP.trim();
  }

  // Fallback to connection remote address
  return (
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    'unknown'
  );
}

/**
 * Check if IP address is in allowed list
 * Handles IPv4, IPv6, and hostname resolution
 */
function isIPAllowed(clientIP, allowedHosts) {
  // Direct match
  if (allowedHosts.includes(clientIP)) {
    return true;
  }

  // Handle IPv4-mapped IPv6 addresses
  if (clientIP.startsWith('::ffff:')) {
    const ipv4 = clientIP.replace('::ffff:', '');
    if (allowedHosts.includes(ipv4)) {
      return true;
    }
  }

  return false;
}

/**
 * Middleware factory for monitoring endpoint security
 * @param {string} endpointType - Type of endpoint ('health', 'metrics', 'deep')
 * @returns {Function} Express middleware
 */
function createMonitoringSecurityMiddleware(endpointType = 'health') {
  return (req, res, next) => {
    const clientIP = getClientIP(req);
    const allowedHosts = getAllowedMonitoringHosts();

    if (!isIPAllowed(clientIP, allowedHosts)) {
      Logger.warn('Monitoring endpoint access denied', {
        endpoint: req.path,
        type: endpointType,
        clientIP,
        userAgent: req.headers['user-agent'],
        allowedHosts: allowedHosts.length, // Don't log actual allowed hosts
      });

      // Return generic 404 to avoid information disclosure
      return res.status(404).json({
        error: 'Not Found',
        message: 'The requested resource was not found',
      });
    }

    // Log allowed access for audit trail
    Logger.debug('Monitoring endpoint access granted', {
      endpoint: req.path,
      type: endpointType,
      clientIP,
    });

    next();
  };
}

/**
 * Create middleware for basic health checks (less restrictive)
 * Only blocks obviously external IPs, allows internal networks
 */
function createBasicHealthSecurityMiddleware() {
  return (req, res, next) => {
    const clientIP = getClientIP(req);

    // Block obviously external requests, but be permissive for internal networks
    // This allows docker containers, kubernetes health checks, load balancers, etc.
    const isObviouslyExternal =
      !clientIP.startsWith('127.') &&
      !clientIP.startsWith('::1') &&
      !clientIP.startsWith('10.') &&
      !clientIP.startsWith('172.') &&
      !clientIP.startsWith('192.168.') &&
      !clientIP.startsWith('::ffff:127.') &&
      !clientIP.startsWith('::ffff:10.') &&
      !clientIP.startsWith('::ffff:172.') &&
      !clientIP.startsWith('::ffff:192.168.') &&
      clientIP !== 'localhost' &&
      clientIP !== 'unknown';

    if (isObviouslyExternal && process.env.NODE_ENV === 'production') {
      Logger.warn('Basic health check denied for external IP', {
        clientIP,
        userAgent: req.headers['user-agent'],
      });

      return res.status(404).json({
        error: 'Not Found',
      });
    }

    next();
  };
}

module.exports = {
  createMonitoringSecurityMiddleware,
  createBasicHealthSecurityMiddleware,
  getAllowedMonitoringHosts,
  getClientIP,
  isIPAllowed,
};
