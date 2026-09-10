import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  listArticles,
  listArticlesByCategory,
  listFrontPageSections,
  getArticleBySlug,
  categoryCounts,
  CATEGORIES,
} from "./db.js";

const ARTICLES_PER_SECTION = 3;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const SITE_NAME = process.env.SITE_NAME || "Balboa Post";

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
  res.render("front-page", { sections, lead, activeCategory: null });
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
  res.render("section", { articles: rest, lead, activeCategory: category });
});

app.get("/about", (req, res) => {
  res.render("about", { activeCategory: null });
});

app.get("/article/:slug", (req, res) => {
  const article = getArticleBySlug(req.params.slug);
  if (!article) return res.status(404).send("Article not found");
  res.render("article", { article, activeCategory: article.category });
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