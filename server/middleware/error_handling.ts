import { Request, Response, NextFunction } from 'express';
import { trace, SpanStatusCode } from '@opentelemetry/api';
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
 * 500 Environment / Configuration Error
 * Represents errors caused by missing, invalid, or misconfigured environment variables.
 * These are logged as authentic errors to OpenTelemetry, but masked as generic server errors when returned to the client.
 */
export class EnvError extends AppError {
  public readonly isEnvError: boolean = true;

  constructor(message: string = 'Environment configuration error', details?: any) {
    super(message, 500, details);
    this.name = 'EnvError';
  }
}

/**
 * Helper to determine if an error is caused by missing, invalid, or unconfigured .env / environment variables.
 */
export function isEnvRelatedError(err: any): boolean {
  if (!err) return false;
  if (err.isEnvError || err.name === 'EnvError' || err.name === 'EnvironmentError') {
    return true;
  }
  const msg = typeof err.message === 'string' ? err.message : String(err || '');
  const stack = typeof err.stack === 'string' ? err.stack : '';
  const name = typeof err.name === 'string' ? err.name : '';
  const combined = `${name} ${msg} ${stack}`.toLowerCase();

  const envKeywords = [
    '.env',
    'environment variable',
    'invalid environment',
    'missing environment',
    'process.env',
    'gemini_api_key',
    'openai_api_key',
    'anthropic_api_key',
    'jwt_secret',
    'supabase_url',
    'supabase_anon_key',
    'supabase_service_role_key',
    'google_client_id',
    'google_client_secret',
    'encryption_secret',
    'otel_exporter_otlp_endpoint',
    'otel_service_name',
    'add it via secrets',
    'set in .env',
    'defined in the environment',
  ];

  if (envKeywords.some(keyword => combined.includes(keyword))) {
    return true;
  }

  if (err.cause && isEnvRelatedError(err.cause)) {
    return true;
  }

  return false;
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

  // Check if error is related to .env / environment variable configuration
  if (isEnvRelatedError(err)) {
    // 1. Log authentic error to OpenTelemetry and Pino logger
    logger.error('💥 [GlobalErrorHandler] [OpenTelemetry] Authentic Environment Error:', {
      errorName: err.name || 'EnvError',
      errorMessage: err.message,
      errorStack: err.stack,
      errorDetails: err.details,
      isEnvError: true,
      path: req.originalUrl || req.url,
      method: req.method,
    });

    try {
      const activeSpan = trace.getActiveSpan();
      if (activeSpan) {
        activeSpan.recordException(err);
        activeSpan.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      }
    } catch (e) {
      // Ignore span recording errors
    }

    // 2. Mask as generic server error for client-side response
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      statusCode: 500,
    });
    return;
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
