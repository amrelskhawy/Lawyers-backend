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
    language: true,
    createdBy: { select: { name: true, picture: true } },
} as const;

export const EXCERPT_LENGTH = 200;

/** Google truncates the SERP snippet around here. */
export const META_DESCRIPTION_LENGTH = 160;

// ── Arabic text handling ───────────────────────────────────────────────────
// Most readers here write and search in Arabic, where the same word is spelled
// several equally correct ways. Postgres' `insensitive` mode only folds case,
// which does nothing for Arabic — so anything that has to *match* Arabic text
// (search, slugs) is normalised through the helpers below first.

/** Tashkeel (harakat) and the superscript alef — decoration, never spelling. */
const ARABIC_DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;
/** Tatweel: a typographic stretch character with no phonetic value. */
const TATWEEL = /\u0640/g;

/** Arabic-Indic and extended Arabic-Indic digits, in value order. */
const ARABIC_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g;

/**
 * Folds the spelling variants readers actually mix up:
 *   أ إ آ ٱ → ا   (hamza on the alef is routinely dropped when typing)
 *   ى → ي         (alef maqsura vs ya at the end of a word)
 *   ة → ه         (ta marbuta vs ha)
 *   ؤ ئ → و ي     (hamza carriers)
 * A reader who types "الاجراءات" must find an article titled "الإجراءات".
 */
const LETTER_FOLDING: Record<string, string> = {
    "\u0623": "\u0627", // أ
    "\u0625": "\u0627", // إ
    "\u0622": "\u0627", // آ
    "\u0671": "\u0627", // ٱ
    "\u0649": "\u064A", // ى
    "\u0629": "\u0647", // ة
    "\u0624": "\u0648", // ؤ
    "\u0626": "\u064A", // ئ
};

/**
 * The comparison form of a piece of text: no diacritics, folded letter
 * variants, ASCII digits, lowercase, single-spaced. Only ever used for
 * matching — never for anything the reader sees.
 */
export function normalizeArabic(text: string): string {
    return text
        .normalize("NFKC")
        .replace(ARABIC_DIACRITICS, "")
        .replace(TATWEEL, "")
        .replace(ARABIC_DIGITS, (digit) => String(digit.charCodeAt(0) & 0x0f))
        .replace(/[\u0622-\u0671]/g, (char) => LETTER_FOLDING[char] ?? char)
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

/** Arabic script anywhere in the string. */
const HAS_ARABIC = /[\u0600-\u06FF]/;

/**
 * Which language an article is written in. Decided from the body rather than
 * from the dashboard's UI language: an editor working with an English
 * interface still writes most of these articles in Arabic, and it is the
 * article's own language that belongs in `og:locale` and `inLanguage`.
 */
export function detectLanguage(...parts: (string | null | undefined)[]): "ar" | "en" {
    const text = parts.filter(Boolean).join(" ");
    const arabic = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
    const latin = (text.match(/[A-Za-z]/g) ?? []).length;
    // Arabic wins on a tie: a mostly-Arabic article quoting an English statute
    // name is still an Arabic article.
    return arabic >= latin && arabic > 0 ? "ar" : latin > 0 ? "en" : "ar";
}

/** BCP-47 / Open Graph locale for a detected language. */
export function localeFor(language: string): string {
    return language === "en" ? "en_US" : "ar_SA";
}

/**
 * The blob the public search matches against: title, excerpt, keywords and the
 * stripped body, all normalised. Stored on the row so a search is one indexed
 * `contains` rather than a normalisation pass over every article.
 */
export function buildSearchText(article: {
    title: string;
    excerpt?: string | null;
    keywords?: string[];
    content?: string | null;
    metaTitle?: string | null;
    metaDescription?: string | null;
}): string {
    return normalizeArabic(
        [
            article.title,
            article.metaTitle,
            article.excerpt,
            article.metaDescription,
            ...(article.keywords ?? []),
            article.content ? htmlToText(article.content) : "",
        ]
            .filter(Boolean)
            .join(" "),
    );
}

/**
 * URL key for the reader page. Arabic letters are kept (the browser
 * percent-encodes them) so an Arabic title still produces a readable link;
 * everything that is not a letter or digit collapses into a single dash.
 * Diacritics are stripped first — they are invisible in a URL bar but make two
 * links to the same title compare as different pages.
 */
export function slugify(title: string): string {
    const slug = normalizeArabic(title)
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
