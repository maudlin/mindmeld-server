/**
 * Global Error Handler (RFC 7807 Problem Details)
 * Returns application/problem+json for 4xx/5xx responses
 * Includes legacy "error" field for backward compatibility during migration
 */

const logger = require('../utils/logger');

function problemFromError(err, req) {
  // Derive status and classification
  let status = err.status || 500;
  let title = 'Internal Server Error';
  let type = 'about:blank';
  let detail = err.message || 'An unexpected error occurred';

  // Basic mappings by message and known fields
  const msg = (err.message || '').toLowerCase();
  if (
    status === 400 ||
    msg.includes('invalid state') ||
    msg.includes('validation')
  ) {
    status = 400;
    title = 'Invalid state';
    type = 'https://mindmeld.dev/problems/invalid-state';
  } else if (status === 404 || msg.includes('not found')) {
    status = 404;
    title = 'Not Found';
    type = 'https://mindmeld.dev/problems/not-found';
  } else if (status === 409 || msg.includes('conflict')) {
    status = 409;
    title = 'Conflict';
    type = 'https://mindmeld.dev/problems/conflict';
  } else if (status >= 500) {
    status = 500;
    title = 'Internal Server Error';
    type = 'https://mindmeld.dev/problems/internal-error';
  }

  // Body-parser JSON syntax errors -> 400
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    status = 400;
    title = 'Invalid JSON';
    type = 'https://mindmeld.dev/problems/invalid-json';
    if (!detail) {
      detail = 'Request body is not valid JSON';
    }
  }

  const problem = {
    type,
    title,
    status,
    detail,
    instance: req.originalUrl,
  };

  // Include validation details if provided (e.g., Zod mapping in future)
  if (Array.isArray(err.errors) && err.errors.length > 0) {
    problem.errors = err.errors;
  }

  // Backward compatibility for existing clients/tests
  problem.error = title;

  return problem;
}

function errorHandler(err, req, res) {
  const problem = problemFromError(err, req);

  logger.error(
    { err, path: req.path, status: problem.status },
    'Request error',
  );

  res
    .status(problem.status)
    .set('Content-Type', 'application/problem+json')
    .json(problem);
}

module.exports = { errorHandler, problemFromError };
