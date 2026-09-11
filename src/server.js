import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  listArticles,
  listArticlesByCategory,
  listFrontPageSections,
  getArticleBySlug,
  listAllArticleSlugs,
  categoryCounts,
  CATEGORIES,
} from "./db.js";

const ARTICLES_PER_SECTION = 3;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const SITE_NAME = process.env.SITE_NAME || "Balboa Post";
const SITE_URL = process.env.SITE_URL || "https://balboapost.com";

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "views"));
app.use(express.static(path.join(__dirname, "..", "public")));

// Made available to every template.
app.use((req, res, next) => {
  res.locals.siteName = SITE_NAME;
  res.locals.siteTagline = "San Diego County News";
  res.locals.categories = CATEGORIES;
  res.locals.categoryCounts = categoryCounts();
  res.locals.today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  });
  next();
});

app.get("/", (req, res) => {
  const [lead] = listArticles(1);
  const sections = listFrontPageSections(ARTICLES_PER_SECTION, lead ? lead.id : null);
  res.render("front-page", {
    sections,
    lead,
    activeCategory: null,
    metaDescription: `${SITE_NAME} - San Diego County news drawn from government and public-agency sources, updated throughout the day.`,
  });
});

function slugifyCategory(category) {
  return category.toLowerCase().replace(/\s+/g, "-");
}

app.get("/section/:category", (req, res) => {
  const category = CATEGORIES.find(
    (c) => slugifyCategory(c) === req.params.category.toLowerCase()
  );
  if (!category) return res.status(404).send("Section not found");

  const articles = listArticlesByCategory(category, 30);
  const [lead, ...rest] = articles;
  res.render("section", {
    articles: rest,
    lead,
    activeCategory: category,
    metaDescription: `${category} news for San Diego County from ${SITE_NAME}.`,
  });
});

app.get("/about", (req, res) => {
  res.render("about", {
    activeCategory: null,
    metaDescription: `About ${SITE_NAME} - who we are, what we cover, and how our stories are reported.`,
  });
});

app.get("/article/:slug", (req, res) => {
  const article = getArticleBySlug(req.params.slug);
  if (!article) return res.status(404).send("Article not found");
  res.render("article", {
    article,
    activeCategory: article.category,
    metaDescription: article.dek || article.title,
  });
});

// XML sitemap -- lists the homepage, every section page, and every
// published article so search engines can discover and crawl them. Rebuilt
// fresh on every request from the live database, so it's always current.
app.get("/sitemap.xml", (req, res) => {
  const staticUrls = [
    { loc: `${SITE_URL}/`, changefreq: "hourly", priority: "1.0" },
    { loc: `${SITE_URL}/about`, changefreq: "monthly", priority: "0.3" },
    ...CATEGORIES.map((c) => ({
      loc: `${SITE_URL}/section/${slugifyCategory(c)}`,
      changefreq: "hourly",
      priority: "0.7",
    })),
  ];

  const articleUrls = listAllArticleSlugs().map((a) => ({
    loc: `${SITE_URL}/article/${a.slug}`,
    lastmod: a.created_at.replace(" ", "T") + "Z",
    changefreq: "never",
    priority: "0.5",
  }));

  const urls = [...staticUrls, ...articleUrls];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;

  res.type("application/xml").send(xml);
});

const PORT = process.env.PORT || 3000;

// Avoid double-listening if this file is imported by scheduler.js.
if (!app.get("__listening")) {
  app.listen(PORT, () => {
    console.log(`[server] Website running at http://localhost:${PORT}`);
  });
  app.set("__listening", true);
}

export default app;