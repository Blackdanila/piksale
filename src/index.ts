import "dotenv/config";
import { serve } from "@hono/node-server";
import { createBot } from "./bot/index.js";
import { createWebApp } from "./web/server.js";
import { startScheduler } from "./scheduler.js";
import { webhookCallback } from "grammy";

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("BOT_TOKEN is required in .env");
  process.exit(1);
}

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const WEBHOOK_URL = process.env.WEBHOOK_URL; // e.g. https://piksale.ru/bot/webhook
const bot = createBot(token);

// Web app
const app = createWebApp();

// Bot webhook endpoint
const handleWebhook = webhookCallback(bot, "std/http");

app.post("/bot/webhook", async (c) => {
  const response = await handleWebhook(c.req.raw);
  return response;
});

// Start scheduler
startScheduler(bot);

// Start server
serve({ fetch: app.fetch, port: PORT }, async () => {
  console.log(`PIKsale server running on http://localhost:${PORT}`);

  if (WEBHOOK_URL) {
    // Production: use webhooks
    await bot.api.setWebhook(`${WEBHOOK_URL}/bot/webhook`);
    console.log(`Bot webhook set to ${WEBHOOK_URL}/bot/webhook`);
  } else {
    // Development: use long polling
    bot.start({
      onStart: () => console.log("Bot started (long polling)"),
    });
  }
});
