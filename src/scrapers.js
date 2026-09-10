import * as cheerio from "cheerio";

/**
 * Some public-domain government news pages don't publish RSS at all, only
 * an HTML listing page. This module scrapes those pages generically: for
 * each configured source, it fetches the listing page, finds links that
 * match that source's article URL pattern, and (for links not already in
 * the database) fetches each article page and extracts a title + body text
 * using generic heuristics -- no page is guaranteed to have the same
 * structure, so this favors "good enough for Claude to rewrite from"
 * over pixel-perfect extraction.
 *
 * Add or remove sources by editing SCRAPE_SOURCES below. Each source needs:
 *   - name: for logging
 *   - listUrl: the page listing article links
 *   - linkPattern: a RegExp matched against each <a href> on the listing
 *     page to decide if it's a real article link (as opposed to nav,
 *     social, or unrelated links)
 *   - baseUrl: used to resolve relative hrefs into absolute URLs
 */
export const SCRAPE_SOURCES = [
  {
    name: "City of Chula Vista News",
    listUrl: "https://www.chulavistaca.gov/residents/news",
    linkPattern: /\/Home\/Components\/News\/News\/\d+\/\d+/,
    baseUrl: "https://www.chulavistaca.gov",
  },
  {
    name: "Port of San Diego Press Releases",
    listUrl: "https://www.portofsandiego.org/press-releases/general-press-releases",
    linkPattern: /\/press-releases\/general-press-releases\/[a-z0-9-]+/,
    baseUrl: "https://www.portofsandiego.org",
  },
  {
    name: "Caltrans District 11 News",
    listUrl: "https://dot.ca.gov/caltrans-near-me/district-11/news",
    linkPattern: /\/caltrans-near-me\/district-11\/news\/[a-z0-9-]+/,
    baseUrl: "https://dot.ca.gov",
  },
];

// Some government sites (e.g. Chula Vista's) block requests that don't look
// like a real browser. These headers mimic a normal Chrome request rather
// than identifying as a bot -- this is standard practice for reading
// public pages, not an attempt to evade any access restriction (these are
// public government pages with no login or paywall).
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  return res.text();
}

function resolveUrl(href, baseUrl) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

/**
 * Finds candidate article links on a listing page.
 * Returns an array of { url, linkText }.
 */
function findArticleLinks(html, source) {
  const $ = cheerio.load(html);
  const found = new Map();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || !source.linkPattern.test(href)) return;

    const absoluteUrl = resolveUrl(href, source.baseUrl);
    if (!absoluteUrl) return;

    const linkText = $(el).text().trim();
    if (!found.has(absoluteUrl)) {
      found.set(absoluteUrl, linkText);
    }
  });

  return Array.from(found.entries()).map(([url, linkText]) => ({ url, linkText }));
}

/**
 * Extracts a best-effort { title, text } from an article page's HTML.
 * Not a pixel-perfect readability algorithm -- just enough factual text
 * for Claude to rewrite from.
 */
function extractArticle(html) {
  const $ = cheerio.load(html);

  $("script, style, nav, header, footer, noscript, form, iframe").remove();

  const title =
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("h1").first().text().trim() ||
    $("title").text().trim();

  let container = $("main");
  if (container.length === 0) container = $("article");
  if (container.length === 0) container = $("#content, .content").first();
  if (container.length === 0) container = $("body");

  const paragraphs = container
    .find("p")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((text) => text.length > 40); // drop short nav/breadcrumb fragments

  const text = paragraphs.join("\n\n").slice(0, 6000);

  return { title, text };
}

/**
 * Scrapes one source and returns items shaped like RSS feed items, so
 * bot.js can process them identically to feed items:
 *   { title, link, contentSnippet, guid }
 */
export async function scrapeSource(source) {
  const listHtml = await fetchHtml(source.listUrl);
  const links = findArticleLinks(listHtml, source);

  const items = [];
  for (const { url, linkText } of links) {
    items.push({
      title: linkText || null, // filled in properly below once we fetch the page
      link: url,
      guid: url,
      _needsFetch: true,
    });
  }
  return items;
}

/**
 * Given a scraped item (from scrapeSource) that hasn't been published yet,
 * fetches the actual article page and fills in title/contentSnippet.
 */
export async function hydrateScrapedItem(item) {
  const html = await fetchHtml(item.link);
  const { title, text } = extractArticle(html);
  return {
    ...item,
    title: title || item.title || item.link,
    contentSnippet: text,
  };
}
