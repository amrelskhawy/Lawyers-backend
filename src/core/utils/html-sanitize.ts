import sanitizeHtml from "sanitize-html";

/**
 * Whitelist for rich-text written in the dashboard editor (Quill) and rendered
 * as trusted HTML on the public site.
 *
 * Only ADMIN/MODERATOR can write articles, but their markup still reaches every
 * visitor, so the body is narrowed to formatting: headings, lists, links,
 * images and the font/colour styling the toolbar can produce. Scripts, event
 * handlers, iframes and form elements are dropped.
 */
const ARTICLE_HTML_OPTIONS: sanitizeHtml.IOptions = {
    allowedTags: [
        "p", "br", "hr", "div", "span",
        "h1", "h2", "h3", "h4", "h5", "h6",
        "strong", "b", "em", "i", "u", "s", "sub", "sup",
        "blockquote", "pre", "code",
        "ol", "ul", "li",
        "a", "img", "figure", "figcaption",
        "table", "thead", "tbody", "tr", "th", "td",
    ],
    allowedAttributes: {
        a: ["href", "title", "target", "rel"],
        img: ["src", "alt", "title", "width", "height"],
        // Quill 2 emits every list as <ol> and marks bullet items with
        // data-list — drop it and bulleted lists come back numbered.
        li: ["data-list"],
        // Quill encodes size/font/alignment/indent as ql-* classes.
        "*": ["class", "style", "dir"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    allowedStyles: {
        "*": {
            color: [/^.*$/],
            "background-color": [/^.*$/],
            "text-align": [/^(left|right|center|justify)$/],
            "font-size": [/^\d+(?:\.\d+)?(?:px|em|rem|pt|%)$/],
            "font-family": [/^[\w\s"',-]+$/],
            "font-weight": [/^(normal|bold|[1-9]00)$/],
            "font-style": [/^(normal|italic)$/],
            "text-decoration": [/^[\w\s-]+$/],
            direction: [/^(ltr|rtl)$/],
            // Quill writes indentation as padding on the block.
            "padding-left": [/^\d+(?:\.\d+)?(?:px|em|rem)$/],
            "padding-right": [/^\d+(?:\.\d+)?(?:px|em|rem)$/],
        },
    },
    // Open external links safely; internal anchors keep their own target.
    transformTags: {
        a: (tagName, attribs) => ({
            tagName,
            attribs: attribs.target
                ? { ...attribs, rel: "noopener noreferrer" }
                : attribs,
        }),
    },
};

/** Sanitise editor HTML before it is stored. */
export function sanitizeArticleHtml(html: string): string {
    return sanitizeHtml(html, ARTICLE_HTML_OPTIONS);
}

/** Plain text of the given HTML, used for excerpts and search. */
export function htmlToText(html: string): string {
    // Blocks carry no whitespace of their own, so strip them naively and the
    // last word of a paragraph runs into the first word of the next.
    const spaced = html.replace(/<br\s*\/?>|<\/(?:p|div|h[1-6]|li|tr|blockquote|pre)>/gi, " ");
    return sanitizeHtml(spaced, { allowedTags: [], allowedAttributes: {} })
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
