# Auto Article Bot

A small Node.js website + bot: every 15 minutes the bot checks an RSS/API
feed, rewrites new items into original articles using the Claude API, and
publishes them to a simple website.

**Important:** point `FEED_URL` at a feed you actually have the right to
republish from (your own site's feed, a licensed partner feed, or a feed
whose terms allow this). This tool is built for that use case, not for
scraping and republishing other people's content without permission.

## What's included

- `src/server.js` — Express website (article list + article pages), backed
  by a local SQLite database (`better-sqlite3`, no separate DB server needed)
- `src/bot.js` — fetches the feed, skips items it's already published
  (tracked by feed GUID), and rewrites new ones
- `src/rewrite.js` — calls the Claude API to turn a feed item into an
  original article (title + HTML body), with an optional attribution link
  back to the source
- `src/scheduler.js` — the process you actually run: starts the website
  and schedules the bot to run every 15 minutes (`node-cron`), plus once
  immediately on startup
- `views/`, `public/style.css` — minimal templates/styling for the site

## Setup

1. Install dependencies:
   ```
   npm install
   ```
2. Copy the environment template and fill it in:
   ```
   cp .env.example .env
   ```
   - `ANTHROPIC_API_KEY` — get one at https://console.anthropic.com/
     (Settings -> API Keys). Requires billing set up on the account.
   - `FEED_URL` — the RSS/Atom feed to pull from.
   - `INCLUDE_SOURCE_LINK` — leave `true` unless your license says
     otherwise.
3. Run everything (website + 15-minute scheduler) with:
   ```
   npm start
   ```
   Then open http://localhost:3000

To run the bot a single time without the scheduler (useful for testing):
```
npm run run-once
```

## How scheduling works here

`npm start` keeps a long-running Node process alive and uses `node-cron`
inside it to fire every 15 minutes (`*/15 * * * *`). This is the simplest
option and is fine as long as something keeps that process running
(a VPS with `pm2`/`systemd`, a Docker container that restarts on crash,
a "Background Worker" on a PaaS like Render/Railway, etc).

### Alternative: external cron instead of node-cron

If you'd rather not keep a long process alive for scheduling, you can drop
`node-cron` and instead have your OS or platform call the bot directly
every 15 minutes:

- **Linux server cron:** `*/15 * * * * cd /path/to/auto-article-bot && npm run run-once >> bot.log 2>&1`
- **GitHub Actions:** a workflow with `on: schedule: cron: '*/15 * * * *'`
  that runs `npm run run-once` (note: GitHub's actual minimum interval is
  looser than 15 minutes in practice and can drift)
- **Vercel Cron / Render Cron Jobs / Railway Cron:** point them at a
  script that runs `runOnce()` from `src/bot.js`

In any of these cases you'd still run `npm run server` separately (or
deploy it) to serve the website itself, since the website and the
scheduled job become two separate processes.

## Deploying

- **Simplest:** a small VPS (DigitalOcean, Hetzner, etc.) running
  `npm start` under `pm2` or a `systemd` service so it restarts on crash
  or reboot.
- **PaaS:** Render, Railway, or Fly.io — deploy as a "worker"/"web service"
  running `npm start`. Note the SQLite file lives on local disk, so use a
  persistent volume (most of these platforms offer one) or swap
  `better-sqlite3` for a hosted Postgres/MySQL database if you need
  multiple instances or ephemeral filesystems.

## Extending it

- **WordPress instead of the built-in site:** in `src/bot.js`, replace the
  `insertArticle(...)` call with a `fetch()` POST to the WordPress REST API
  (`/wp-json/wp/v2/posts`) using an application password.
- **A different LLM:** swap the body of `rewriteArticle()` in
  `src/rewrite.js` for another provider's SDK; keep the same
  `{ title, bodyHtml }` return shape so nothing else needs to change.
- **Multiple feeds:** change `FEED_URL` to a comma-separated list and loop
  over them in `runOnce()`.
