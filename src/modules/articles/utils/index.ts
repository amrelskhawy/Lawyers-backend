import { Prisma } from "@prisma/client";
import { htmlToText } from "../../../core/utils/html-sanitize.js";

/** Author/editor stamped on every write. */
export type Actor = { id: string };

export const articleInclude = {
    createdBy: { select: { id: true, name: true, picture: true } },
    updatedBy: { select: { id: true, name: true } },
} satisfies Prisma.ArticleInclude;

/** What the public site is allowed to read — no author ids, no draft fields. */
export const PUBLIC_SELECT = {
    id: true,
    slug: true,
    title: true,
    excerpt: true,
    content: true,
    coverImage: true,
    publishedAt: true,
    createdBy: { select: { name: true, picture: true } },
} as const;

export const EXCERPT_LENGTH = 200;

/**
 * URL key for the reader page. Arabic letters are kept (the browser
 * percent-encodes them) so an Arabic title still produces a readable link;
 * everything that is not a letter or digit collapses into a single dash.
 */
export function slugify(title: string): string {
    const slug = title
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-+|-+$/g, "");
    // A title made entirely of punctuation would slugify to "" — never let a
    // row end up with an empty URL key.
    return slug || `article-${Date.now()}`;
}

/** First words of the body, used when the writer left the excerpt empty. */
export function deriveExcerpt(content: string): string {
    const text = htmlToText(content);
    return text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH).trimEnd()}…` : text;
}
