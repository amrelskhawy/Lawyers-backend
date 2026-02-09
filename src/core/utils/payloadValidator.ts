import { ZodObject, ZodError } from 'zod';
import { AppError } from './AppError.js';

/**
 * Validates data against a schema and throws a formatted AppError on failure.
 */
export const validateData = <T>(schema: ZodObject<any>, data: unknown): T => {
  try {
    return schema.parse(data) as T;
  } catch (error) {
    if (error instanceof ZodError) {
      const errors = error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));

      throw new AppError("Validation Error", 400, "VALIDATION_ERROR", errors);
    }
  }
};