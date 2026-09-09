import "dotenv/config";
import cron from "node-cron";
import { runOnce } from "./bot.js";
import "./server.js"; // starts the website in the same process

console.log("[scheduler] Starting. Bot will run every 15 minutes.");

// Run once immediately on startup, then every 15 minutes.
runOnce().catch((err) => console.error("[scheduler] initial run failed:", err));

cron.schedule("*/15 * * * *", () => {
  console.log(`[scheduler] Triggering scheduled run at ${new Date().toISOString()}`);
  runOnce().catch((err) => console.error("[scheduler] run failed:", err));
});
