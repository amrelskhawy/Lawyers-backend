import { Request, Response, NextFunction } from 'express';
import { ZodObject } from 'zod';
import { validateData } from '../utils/payloadValidator.js';

export const validateRequest = (schema: ZodObject<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = validateData(schema, req.body);
      req.body = validatedData;
      next();
    } catch (error) {
      next(error);
    }
  };
};
