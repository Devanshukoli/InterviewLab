import { Response } from 'express';
import { ApiResponse } from '../../src/shared/types';

/**
 * Sends a successful API response using the shared ApiResponse shape.
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  message?: string,
  statusCode: number = 200
): void {
  const response: ApiResponse<T> = {
    success: true,
    data,
    ...(message ? { message } : {}),
  };
  res.status(statusCode).json(response);
}

/**
 * Sends an error API response using the shared ApiResponse shape.
 */
export function sendError(
  res: Response,
  error: string,
  statusCode: number = 500,
  message?: string
): void {
  const response: ApiResponse<never> = {
    success: false,
    error,
    ...(message ? { message } : {}),
  };
  res.status(statusCode).json(response);
}
