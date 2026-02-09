import { z } from 'zod';

export const CreateServiceSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters").max(50, "Name cannot exceed 50 characters"),
  description: z.string().max(500, "Description cannot exceed 500 characters"),
  price: z.number().positive("Price must be a positive number"),
});

export const UpdateServiceSchema = CreateServiceSchema.partial();

