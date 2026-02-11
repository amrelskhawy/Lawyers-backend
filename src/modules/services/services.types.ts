import { z } from 'zod';

export const CreateServiceSchema = z.object({
  name_ar: z.string().min(3, "Name must be at least 3 characters").max(50, "Name cannot exceed 50 characters"),
  name_en: z.string().min(3, "Name must be at least 3 characters").max(50, "Name cannot exceed 50 characters"),
  description_ar: z.string().max(500, "Description cannot exceed 500 characters"),
  description_en: z.string().max(500, "Description cannot exceed 500 characters"),
  price: z.number().positive("Price must be a positive number"),
});

export const UpdateServiceSchema = CreateServiceSchema.partial();

