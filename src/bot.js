import "dotenv/config";
import Parser from "rss-parser";
import { articleExistsForGuid, insertArticle } from "./db.js";
import { rewriteArticle } from "./rewrite.js";

const parser = new Parser();

function slugify(title) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${base}-${Date.now().toString(36)}`;
}

export async function runOnce() {
  const feedUrl = process.env.FEED_URL;
  if (!feedUrl || feedUrl.includes("example.com")) {
    console.log(
      "[bot] FEED_URL is not set to a real feed yet. Edit .env and set FEED_URL, then rerun."
    );
    return { processed: 0, skipped: 0 };
  }

  console.log(`[bot] Fetching feed: ${feedUrl}`);
  const feed = await parser.parseURL(feedUrl);

  let processed = 0;
  let skipped = 0;

  for (const item of feed.items) {
    const guid = item.guid || item.id || item.link;

    if (articleExistsForGuid(guid)) {
      skipped++;
      continue;
    }

    try {
      console.log(`[bot] Rewriting: ${item.title}`);
      const { title, dek, category, bodyHtml } = await rewriteArticle(item);

      insertArticle({
        slug: slugify(title),
        title,
        dek,
        category,
        bodyHtml,
        sourceUrl: item.link || null,
        sourceGuid: guid || null,
      });

      processed++;
    } catch (err) {
      console.error(`[bot] Failed to process "${item.title}":`, err.message);
    }
  }

  console.log(`[bot] Done. New articles: ${processed}, already had: ${skipped}`);
  return { processed, skipped };
}

// Allow `npm run run-once` to trigger a single pass directly.
const isMain = process.argv[1] && process.argv[1].endsWith("bot.js");
if (isMain) {
  runOnce()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[bot] Fatal error:", err);
      process.exit(1);
    });
}
