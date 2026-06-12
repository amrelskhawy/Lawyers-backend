/**
 * Shared offset-pagination helpers for list endpoints.
 *
 * Request convention: `?page=1&limit=10&search=term&sortBy=field&sortOrder=asc|desc`
 * Response convention: `AppResponse.data` holds the page rows and `AppResponse.meta`
 * holds {@link PageMeta}. The frontend dashboard table reads both.
 */

export interface PageMeta {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface Paginated<T> {
    data: T[];
    meta: PageMeta;
}

export interface ListQuery {
    page: number;
    limit: number;
    skip: number;
    take: number;
    /** Trimmed search term, or "" when none. */
    search: string;
    sortBy?: string;
    sortOrder: "asc" | "desc";
}

export interface ParseOptions {
    defaultLimit?: number;
    maxLimit?: number;
    defaultSortBy?: string;
    defaultSortOrder?: "asc" | "desc";
}

/** Parse and clamp the standard list query params off an Express `req.query`. */
export function parseListQuery(
    query: Record<string, unknown>,
    opts: ParseOptions = {},
): ListQuery {
    const defaultLimit = opts.defaultLimit ?? 10;
    const maxLimit = opts.maxLimit ?? 100;

    let page = Number.parseInt(String(query.page ?? "1"), 10);
    let limit = Number.parseInt(String(query.limit ?? defaultLimit), 10);
    if (!Number.isFinite(page) || page < 1) page = 1;
    if (!Number.isFinite(limit) || limit < 1) limit = defaultLimit;
    if (limit > maxLimit) limit = maxLimit;

    const search = typeof query.search === "string" ? query.search.trim() : "";
    const sortBy =
        typeof query.sortBy === "string" && query.sortBy ? query.sortBy : opts.defaultSortBy;
    const sortOrder =
        query.sortOrder === "asc"
            ? "asc"
            : query.sortOrder === "desc"
              ? "desc"
              : (opts.defaultSortOrder ?? "desc");

    return { page, limit, skip: (page - 1) * limit, take: limit, search, sortBy, sortOrder };
}

/** Build the response metadata for a page. */
export function buildMeta(total: number, page: number, limit: number): PageMeta {
    return {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
}

/** Minimal shape of a Prisma model delegate this helper needs. */
interface CountFindModel<TRow> {
    count: (args: { where?: unknown }) => Promise<number>;
    findMany: (args: Record<string, unknown>) => Promise<TRow[]>;
}

/**
 * Run a `count` + `findMany` for one page in parallel and wrap the result.
 *
 * @param model  A Prisma delegate, e.g. `prisma.user`.
 * @param where  The Prisma `where` filter (already built by the caller).
 * @param q      Parsed query from {@link parseListQuery}.
 * @param extra  Optional `include`/`select`/`orderBy` (orderBy defaults to the
 *               parsed sort, falling back to none).
 */
export async function paginate<TRow>(
    model: CountFindModel<TRow>,
    where: unknown,
    q: ListQuery,
    extra: { include?: unknown; select?: unknown; orderBy?: unknown } = {},
): Promise<Paginated<TRow>> {
    const orderBy =
        extra.orderBy ?? (q.sortBy ? { [q.sortBy]: q.sortOrder } : undefined);

    const findArgs: Record<string, unknown> = {
        where,
        skip: q.skip,
        take: q.take,
        orderBy,
    };
    if (extra.include) findArgs.include = extra.include;
    if (extra.select) findArgs.select = extra.select;

    const [total, data] = await Promise.all([
        model.count({ where }),
        model.findMany(findArgs),
    ]);

    return { data, meta: buildMeta(total, q.page, q.limit) };
}
