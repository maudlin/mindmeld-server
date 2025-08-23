class HttpError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

class NotFoundError extends HttpError {
  constructor(message = 'Not Found') {
    super(message, 404);
  }
}

class ConflictError extends HttpError {
  constructor(message = 'Conflict') {
    super(message, 409);
  }
}

class BadRequestError extends HttpError {
  constructor(message = 'Bad Request') {
    super(message, 400);
  }
}

module.exports = { HttpError, NotFoundError, ConflictError, BadRequestError };
