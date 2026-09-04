/**
 * Backfills `searchText` and `language` on articles written before those
 * columns existed.
 *
 * Both are derived on every write, so new and edited articles fill themselves
 * in — but rows already in the database come out of `prisma db push` with an
 * empty search blob, which means they match no search at all until this has
 * run. Safe to re-run: it recomputes from the article's own fields.
 *
 *   npx tsx src/scripts/backfillArticleSearchIndex.ts
 */
import prisma from "../core/db/prisma.js";
import { buildSearchText, detectLanguage } from "../modules/articles/utils/index.js";

const BATCH_SIZE = 100;

async function main() {
    let processed = 0;
    let cursor: string | undefined;

    for (;;) {
        const articles = await prisma.article.findMany({
            take: BATCH_SIZE,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            orderBy: { id: "asc" },
            select: {
                id: true,
                title: true,
                excerpt: true,
                content: true,
                metaTitle: true,
                metaDescription: true,
                keywords: true,
            },
        });
        if (articles.length === 0) break;

        await Promise.all(
            articles.map((article) =>
                prisma.article.update({
                    where: { id: article.id },
                    data: {
                        searchText: buildSearchText(article),
                        language: detectLanguage(article.title, article.content),
                    },
                }),
            ),
        );

        processed += articles.length;
        cursor = articles[articles.length - 1]!.id;
        console.log(`indexed ${processed} article(s)`);
    }

    console.log(`done — ${processed} article(s) reindexed`);
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
