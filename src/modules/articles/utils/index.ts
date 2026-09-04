import { Prisma } from "@prisma/client";
import { htmlToText } from "../../../core/utils/html-sanitize.js";

/** Author/editor stamped on every write. */
export type Actor = { id: string };

/** Where the public site lives — every absolute URL in a sitemap or a
 * canonical tag has to be built from it. */
export const SITE_URL = (process.env.SITE_URL ?? "https://www.saadalboqami.com").replace(/\/+$/, "");

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
    // Crawlers read `article:modified_time` from this, and the sitemap uses it
    // as <lastmod> so an edited article gets recrawled.
    updatedAt: true,
    metaTitle: true,
    metaDescription: true,
    keywords: true,
    noIndex: true,
    createdBy: { select: { name: true, picture: true } },
} as const;

export const EXCERPT_LENGTH = 200;

/** Google truncates the SERP snippet around here. */
export const META_DESCRIPTION_LENGTH = 160;

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

/**
 * The description a crawler actually gets: the writer's own `metaDescription`
 * when they wrote one, otherwise the excerpt, otherwise the body — always
 * trimmed to a length that survives the SERP snippet intact.
 */
export function deriveMetaDescription(
    article: { metaDescription?: string | null; excerpt?: string | null; content?: string },
): string {
    const source =
        article.metaDescription?.trim() ||
        article.excerpt?.trim() ||
        (article.content ? htmlToText(article.content) : "");
    if (source.length <= META_DESCRIPTION_LENGTH) return source;
    // Cut on a word boundary — a description ending mid-word reads as broken.
    const clipped = source.slice(0, META_DESCRIPTION_LENGTH);
    const lastSpace = clipped.lastIndexOf(" ");
    return `${(lastSpace > 80 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`;
}

/** Absolute canonical URL for one article — what the sitemap and the reader
 * page's <link rel="canonical"> must agree on, character for character. */
export function articleUrl(slug: string): string {
    return `${SITE_URL}/articles/${encodeURIComponent(slug)}`;
}

/** XML text escape. Titles carry quotes and ampersands often enough that an
 * unescaped sitemap is a matter of time. */
function xmlEscape(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

export type SitemapEntry = {
    loc: string;
    lastmod?: Date | string | null;
    changefreq?: string;
    priority?: string;
};

/** sitemaps.org urlset document. */
export function buildSitemapXml(entries: SitemapEntry[]): string {
    const urls = entries
        .map((entry) => {
            const parts = [`    <loc>${xmlEscape(entry.loc)}</loc>`];
            if (entry.lastmod) {
                parts.push(`    <lastmod>${new Date(entry.lastmod).toISOString()}</lastmod>`);
            }
            if (entry.changefreq) parts.push(`    <changefreq>${entry.changefreq}</changefreq>`);
            if (entry.priority) parts.push(`    <priority>${entry.priority}</priority>`);
            return `  <url>\n${parts.join("\n")}\n  </url>`;
        })
        .join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
