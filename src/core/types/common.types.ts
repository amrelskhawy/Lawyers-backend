import { z } from 'zod';

export const BulkDeleteSchema = z.object({
    ids: z.array(z.string().uuid("Invalid ID format")).min(1, "At least one ID is required"),
});
