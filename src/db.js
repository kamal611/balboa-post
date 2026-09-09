import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

// Uses Node's built-in SQLite (available unflagged since Node 22.13 / 23.4)
// instead of the better-sqlite3 npm package. better-sqlite3 ships as native
// C++ that has to be compiled per-platform, and on Windows that requires a
// full Visual Studio C++ toolchain -- a multi-GB install most people don't
// have. node:sqlite ships inside Node itself, so there's nothing to compile
// on any OS.
export const db = new DatabaseSync(path.join(dataDir, "articles.db"));

db.exec("PRAGMA journal_mode = WAL;");

db.exec(`
  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    dek TEXT,
    category TEXT NOT NULL DEFAULT 'Local',
    body_html TEXT NOT NULL,
    source_url TEXT,
    source_guid TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_articles_created_at ON articles(created_at);
  CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);
`);

// The site was originally shipped without dek/category columns. If someone
// upgrades an existing database in place, add the missing columns instead
// of forcing them to delete data/articles.db.
const existingColumns = db.prepare("PRAGMA table_info(articles)").all().map((c) => c.name);
if (!existingColumns.includes("category")) {
  db.exec("ALTER TABLE articles ADD COLUMN category TEXT NOT NULL DEFAULT 'Local'");
}
if (!existingColumns.includes("dek")) {
  db.exec("ALTER TABLE articles ADD COLUMN dek TEXT");
}

export const CATEGORIES = [
  "Local",
  "Government",
  "Public Safety",
  "Health",
  "Transportation",
  "Business",
  "Education",
  "Environment",
];

export function articleExistsForGuid(guid) {
  if (!guid) return false;
  const row = db.prepare("SELECT 1 FROM articles WHERE source_guid = ?").get(guid);
  return !!row;
}

export function insertArticle({ slug, title, dek, category, bodyHtml, sourceUrl, sourceGuid }) {
  const stmt = db.prepare(`
    INSERT INTO articles (slug, title, dek, category, body_html, source_url, source_guid)
    VALUES (@slug, @title, @dek, @category, @bodyHtml, @sourceUrl, @sourceGuid)
  `);
  return stmt.run({
    slug,
    title,
    dek: dek || null,
    category: CATEGORIES.includes(category) ? category : "Local",
    bodyHtml,
    sourceUrl,
    sourceGuid,
  });
}

export function listArticles(limit = 50) {
  return db
    .prepare("SELECT * FROM articles ORDER BY created_at DESC LIMIT ?")
    .all(limit);
}

export function listArticlesByCategory(category, limit = 50) {
  return db
    .prepare("SELECT * FROM articles WHERE category = ? ORDER BY created_at DESC LIMIT ?")
    .all(category, limit);
}

// For the front page: the N most recent articles per category, in
// CATEGORIES order, skipping any category with zero articles and
// excluding a given article id (used to keep the lead story out of its
// own section block below it).
export function listFrontPageSections(perCategory = 3, excludeId = null) {
  const sections = [];
  for (const category of CATEGORIES) {
    const rows = db
      .prepare(
        "SELECT * FROM articles WHERE category = ? AND id != ? ORDER BY created_at DESC LIMIT ?"
      )
      .all(category, excludeId ?? -1, perCategory);
    if (rows.length > 0) {
      sections.push({ category, articles: rows });
    }
  }
  return sections;
}

export function categoryCounts() {
  const rows = db
    .prepare("SELECT category, COUNT(*) as count FROM articles GROUP BY category")
    .all();
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  for (const row of rows) counts[row.category] = row.count;
  return counts;
}

export function getArticleBySlug(slug) {
  return db.prepare("SELECT * FROM articles WHERE slug = ?").get(slug);
}
