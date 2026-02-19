import { z } from 'zod';

export const CreateServiceSchema = z.object({
  name: z.string().min(3).max(50).optional(),
  name_ar: z.string().min(3).max(50).optional(),
  name_en: z.string().min(3).max(50).optional(),
  description: z.string().max(500).optional(),
  description_ar: z.string().max(500).optional(),
  description_en: z.string().max(500).optional(),
  price: z.number().positive("Price must be a positive number"),
});

export const UpdateServiceSchema = CreateServiceSchema.partial();

