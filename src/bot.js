import "dotenv/config";
import Parser from "rss-parser";
import { articleExistsForGuid, insertArticle } from "./db.js";
import { rewriteArticle } from "./rewrite.js";
import { SCRAPE_SOURCES, scrapeSource, hydrateScrapedItem } from "./scrapers.js";

const parser = new Parser();

function slugify(title) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${base}-${Date.now().toString(36)}`;
}

function getFeedUrls() {
  const raw = process.env.FEED_URL || "";
  return raw
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
}

async function processItem(item) {
  const guid = item.guid || item.id || item.link;

  if (articleExistsForGuid(guid)) {
    return "skipped";
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

    return "processed";
  } catch (err) {
    console.error(`[bot] Failed to process "${item.title}":`, err.message);
    return "failed";
  }
}

async function processFeed(feedUrl) {
  console.log(`[bot] Fetching feed: ${feedUrl}`);

  let feed;
  try {
    feed = await parser.parseURL(feedUrl);
  } catch (err) {
    console.error(`[bot] Failed to fetch feed ${feedUrl}:`, err.message);
    return { processed: 0, skipped: 0 };
  }

  let processed = 0;
  let skipped = 0;

  for (const item of feed.items) {
    const result = await processItem(item);
    if (result === "processed") processed++;
    else if (result === "skipped") skipped++;
  }

  return { processed, skipped };
}

async function processScrapeSource(source) {
  console.log(`[bot] Scraping: ${source.name} (${source.listUrl})`);

  let items;
  try {
    items = await scrapeSource(source);
  } catch (err) {
    console.error(`[bot] Failed to scrape ${source.name}:`, err.message);
    return { processed: 0, skipped: 0 };
  }

  let processed = 0;
  let skipped = 0;

  for (const item of items) {
    if (articleExistsForGuid(item.guid)) {
      skipped++;
      continue;
    }

    let hydrated;
    try {
      hydrated = await hydrateScrapedItem(item);
    } catch (err) {
      console.error(`[bot] Failed to fetch article ${item.link}:`, err.message);
      continue;
    }

    const result = await processItem(hydrated);
    if (result === "processed") processed++;
    else if (result === "skipped") skipped++;
  }

  return { processed, skipped };
}

export async function runOnce() {
  const feedUrls = getFeedUrls();
  const hasFeedUrls = feedUrls.length > 0 && !feedUrls.some((u) => u.includes("example.com"));
  const hasScrapeSources = SCRAPE_SOURCES.length > 0;

  if (!hasFeedUrls && !hasScrapeSources) {
    console.log(
      "[bot] FEED_URL is not set to a real feed yet, and no scrape sources are configured. Edit .env and set FEED_URL, then rerun."
    );
    return { processed: 0, skipped: 0 };
  }

  let totalProcessed = 0;
  let totalSkipped = 0;
  let sourceCount = 0;

  if (hasFeedUrls) {
    for (const feedUrl of feedUrls) {
      const { processed, skipped } = await processFeed(feedUrl);
      totalProcessed += processed;
      totalSkipped += skipped;
      sourceCount++;
    }
  }

  for (const source of SCRAPE_SOURCES) {
    const { processed, skipped } = await processScrapeSource(source);
    totalProcessed += processed;
    totalSkipped += skipped;
    sourceCount++;
  }

  console.log(
    `[bot] Done. New articles: ${totalProcessed}, already had: ${totalSkipped} (across ${sourceCount} source${sourceCount === 1 ? "" : "s"})`
  );
  return { processed: totalProcessed, skipped: totalSkipped };
}

const isMain = process.argv[1] && process.argv[1].endsWith("bot.js");
if (isMain) {
  runOnce()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[bot] Fatal error:", err);
      process.exit(1);
    });
}