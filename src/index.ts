import "dotenv/config";
import { serve } from "@hono/node-server";
import { createBot } from "./bot/index.js";
import { createWebApp } from "./web/server.js";
import { startScheduler } from "./scheduler.js";
import { webhookCallback } from "grammy";
import { warmupCache } from "./db/queries.js";

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("BOT_TOKEN is required in .env");
  process.exit(1);
}

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const bot = createBot(token);

// Web app
const app = createWebApp();

// Bot webhook endpoint
if (WEBHOOK_URL) {
  const handleWebhook = webhookCallback(bot, "std/http");
  app.post("/bot/webhook", async (c) => {
    try {
      const response = await handleWebhook(c.req.raw);
      return response;
    } catch (err) {
      console.error("Webhook handler error:", err);
      return c.json({ ok: true });
    }
  });
}

// Start scheduler
startScheduler(bot);

// Warmup cache
warmupCache()
  .then(() => console.log("Cache ready"))
  .catch((err) => console.error("Cache warmup failed:", err));

// Start server
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`PIKsale server running on http://localhost:${PORT}`);

  if (WEBHOOK_URL) {
    bot.api
      .setWebhook(`${WEBHOOK_URL}/bot/webhook`)
      .then(() => console.log(`Webhook set: ${WEBHOOK_URL}/bot/webhook`))
      .catch((err) => console.error("Failed to set webhook:", err));
  } else {
    bot.start({
      onStart: () => console.log("Bot started (long polling)"),
    });
  }
});
