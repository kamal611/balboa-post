import * as cheerio from "cheerio";

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
  {
    name: "San Diego MTS News Releases",
    listUrl: "https://www.sdmts.com/inside-mts/media-center/news-releases",
    linkPattern: /\/inside-mts\/media-center\/news-releases\/[a-z0-9-]+/,
    baseUrl: "https://www.sdmts.com",
  },
  {
    name: "Chula Vista Elementary School District News",
    listUrl: "https://www.cvesd.org/news/what-s-new",
    linkPattern: /\/news\/what-s-new\/news\/~board\/whats-new\/post\/[a-z0-9-]+/,
    baseUrl: "https://www.cvesd.org",
  },
  {
    name: "City of Oceanside News",
    listUrl: "https://www.ci.oceanside.ca.us/government/about-us/city-news",
    linkPattern: /\/Home\/Components\/News\/News\/\d+\/\d+/,
    baseUrl: "https://www.ci.oceanside.ca.us",
  },
  {
    name: "City of Carlsbad News",
    listUrl: "https://www.carlsbadca.gov/city-hall/communication-engagement/city-newsroom",
    linkPattern: /\/Home\/Components\/News\/News\/\d+\/\d+/,
    baseUrl: "https://www.carlsbadca.gov",
  },
  {
    name: "City of Vista News",
    listUrl: "https://www.vista.gov/city-hall/vista-news-center",
    linkPattern: /\/Home\/Components\/News\/News\/\d+\/\d+/,
    baseUrl: "https://www.vista.gov",
  },
  {
    name: "City of Encinitas News",
    listUrl: "https://www.encinitasca.gov/community/news-center/city-news/-arch-1",
    linkPattern: /\/Home\/Components\/News\/News\/\d+\/\d+/,
    baseUrl: "https://www.encinitasca.gov",
  },
  {
    name: "City of El Cajon News",
    listUrl: "https://www.elcajon.gov/i-want-to/view/city-news",
    linkPattern: /\/Home\/Components\/News\/News\/\d+\/\d+/,
    baseUrl: "https://www.elcajon.gov",
  },
  {
    name: "City of Santee News",
    listUrl: "https://www.cityofsanteeca.gov/our-community/news-announcements",
    linkPattern: /\/our-community\/news-announcements\/[a-z0-9-]+\/\d+/,
    baseUrl: "https://www.cityofsanteeca.gov",
  },
  {
    name: "City of San Diego Mayor's Press Releases",
    listUrl: "https://www.sandiego.gov/mayor/news-room/press-releases",
    linkPattern:
      /\/mayor\/(?!about$|staff$|our-san-diego$|policy$|news-room|around-town$|contact$)[a-z0-9-]{10,}/,
    baseUrl: "https://www.sandiego.gov",
  },
  {
    name: "San Diego Unified School District News",
    listUrl: "https://www.sandiegounified.org/about/newscenter/all_news",
    linkPattern: /\/about\/newscenter\/all_news\/[a-z0-9_-]+\//,
    baseUrl: "https://www.sandiegounified.org",
  },
];

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
    .filter((text) => text.length > 40);

  const text = paragraphs.join("\n\n").slice(0, 6000);

  return { title, text };
}

export async function scrapeSource(source) {
  const listHtml = await fetchHtml(source.listUrl);
  const links = findArticleLinks(listHtml, source);

  const items = [];
  for (const { url, linkText } of links) {
    items.push({
      title: linkText || null,
      link: url,
      guid: url,
      _needsFetch: true,
    });
  }
  return items;
}

export async function hydrateScrapedItem(item) {
  const html = await fetchHtml(item.link);
  const { title, text } = extractArticle(html);
  return {
    ...item,
    title: title || item.title || item.link,
    contentSnippet: text,
  };
}
