import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { BadRequestError } from './error_handling';

/**
 * Middleware to validate the request body against a Zod schema.
 */
export const validateBody = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const message = err.issues
          .map((e) => `${e.path.join('.') || 'body'}: ${e.message}`)
          .join(', ');
        next(new BadRequestError(message, err.issues));
      } else {
        next(err);
      }
    }
  };
};
