import { ZodObject, ZodError } from 'zod';
import { AppResponse } from './AppResponse.js';

/**
 * Validates data against a schema and throws a formatted AppResponse on failure.
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

      throw new AppResponse(false, "VALIDATION_ERROR", errors, 400);
    }
    throw error;
  }
};