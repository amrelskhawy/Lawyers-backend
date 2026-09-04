import { z } from "zod";

const statusEnum = z.enum(["DRAFT", "PUBLISHED"]);

/**
 * A slug is optional on write — when omitted the service derives one from the
 * title. When provided it must already be URL-safe (Arabic letters allowed, the
 * public reader page percent-encodes them).
 */
const slugSchema = z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u, "Invalid slug format");

export const CreateArticleSchema = z.object({
    title: z.string().trim().min(1, "Title is required").max(200),
    slug: slugSchema.optional(),
    excerpt: z.string().trim().max(500).nullable().optional(),
    // The editor's HTML. Capped generously — a long article with a few inline
    // images stays well under this, a runaway paste does not.
    content: z.string().trim().min(1, "Content is required").max(200_000),
    coverImage: z.string().trim().url("Invalid image URL").nullable().optional(),
    status: statusEnum.optional(),

    // ── SEO ──────────────────────────────────────────────────────────────
    // Capped a little above what Google shows so a writer who deliberately
    // runs long is not blocked, only warned in the dashboard.
    metaTitle: z.string().trim().max(70).nullable().optional(),
    metaDescription: z.string().trim().max(200).nullable().optional(),
    keywords: z.array(z.string().trim().min(1).max(60)).max(15).optional(),
    noIndex: z.boolean().optional(),
});

export const UpdateArticleSchema = CreateArticleSchema.partial();

export type CreateArticlePayload = z.infer<typeof CreateArticleSchema>;
export type UpdateArticlePayload = z.infer<typeof UpdateArticleSchema>;
