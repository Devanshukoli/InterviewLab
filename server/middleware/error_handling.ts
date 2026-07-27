import { Request, Response, NextFunction } from 'express';
import { logger } from '../observability';

/**
 * Base Application Error class for operational errors.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly status: string;
  public readonly isOperational: boolean;
  public readonly details?: any;

  constructor(message: string, statusCode: number = 500, details?: any) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);

    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 400 Bad Request Error
 */
export class BadRequestError extends AppError {
  constructor(message: string = 'Bad Request', details?: any) {
    super(message, 400, details);
  }
}

/**
 * 401 Unauthorized Error
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized access', details?: any) {
    super(message, 401, details);
  }
}

/**
 * 403 Forbidden Error
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Access forbidden', details?: any) {
    super(message, 403, details);
  }
}

/**
 * 404 Not Found Error
 */
export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found', details?: any) {
    super(message, 404, details);
  }
}

/**
 * 409 Conflict Error
 */
export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict', details?: any) {
    super(message, 409, details);
  }
}

/**
 * 422 Unprocessable Entity / Validation Error
 */
export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed', details?: any) {
    super(message, 422, details);
  }
}

/**
 * 500 Internal Server Error
 */
export class InternalServerError extends AppError {
  constructor(message: string = 'Internal server error', details?: any) {
    super(message, 500, details);
  }
}

/**
 * Generic Custom API Error with configurable status code
 */
export class ApiError extends AppError {
  constructor(statusCode: number, message: string, details?: any) {
    super(message, statusCode, details);
  }
}

/**
 * Async handler wrapper to automatically capture rejected promises in express routes
 */
export type AsyncController = (req: Request, res: Response, next: NextFunction) => Promise<any>;

export const catchAsync = (fn: AsyncController) => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

/**
 * 404 Not Found Route Middleware
 */
export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
  next(new NotFoundError(`Cannot ${req.method} ${req.originalUrl}`));
};

/**
 * Global Error Handling Middleware for Express
 */
export const globalErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'An unexpected error occurred on the server';
  let details = err.details || undefined;

  // Handle specific known error types (e.g. JWT errors, SyntaxErrors)
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid authorization token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Authorization token expired';
  } else if (err instanceof SyntaxError && 'body' in err) {
    statusCode = 400;
    message = 'Malformed JSON payload in request body';
  }

  // Log non-operational or 500 internal errors for debugging
  if (statusCode >= 500) {
    logger.error('💥 [GlobalErrorHandler] Server Error:', err);
  } else {
    logger.warn(`⚠️ [GlobalErrorHandler] Handled operational error (${statusCode}): ${message}`);
  }

  res.status(statusCode).json({
    success: false,
    error: message,
    statusCode,
    ...(details ? { details } : {}),
    ...(process.env.NODE_ENV === 'development' && err.stack ? { stack: err.stack } : {})
  });
};
