import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

/**
 * Express middleware factory that validates request body against a Zod schema.
 * Returns 400 with formatted error messages on validation failure.
 */
export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const messages = result.error.issues.map(
        (issue) => `${String(issue.path.join('.'))}: ${issue.message}`
      );
      res.status(400).json({ error: 'Validation failed', details: messages });
      return;
    }
    req.body = result.data;
    next();
  };
}
