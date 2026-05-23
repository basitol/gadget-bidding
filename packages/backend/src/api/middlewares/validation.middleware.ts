import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { sendError } from '../../utils/response';

/**
 * Middleware to handle validation errors
 */
export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const formattedErrors: Record<string, string[]> = {};

    errors.array().forEach(error => {
      if (error.type === 'field') {
        const field = error.path;
        if (!formattedErrors[field]) {
          formattedErrors[field] = [];
        }
        formattedErrors[field].push(error.msg);
      }
    });

    return sendError(res, 'Validation failed', 400, formattedErrors);
  }

  next();
};
