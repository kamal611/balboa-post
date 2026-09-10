import "dotenv/config";
import cron from "node-cron";
import { runOnce } from "./bot.js";
import "./server.js"; // starts the website in the same process

console.log("[scheduler] Starting. Bot will run every 15 minutes.");

// Guards against two runs overlapping. Without this, a run that takes
// longer than 15 minutes (e.g. a big backlog, or a slow source) would
// still be going when the next scheduled tick fires, and both would hit
// the Claude API and the database at the same time.
let isRunning = false;

async function runGuarded(label) {
  if (isRunning) {
    console.log(`[scheduler] Skipping ${label} -- previous run is still in progress.`);
    return;
  }
  isRunning = true;
  try {
    await runOnce();
  } catch (err) {
    console.error(`[scheduler] ${label} failed:`, err);
  } finally {
    isRunning = false;
  }
}

// Run once immediately on startup, then every 15 minutes.
runGuarded("initial run");

cron.schedule("*/15 * * * *", () => {
  console.log(`[scheduler] Triggering scheduled run at ${new Date().toISOString()}`);
  runGuarded("scheduled run");
});