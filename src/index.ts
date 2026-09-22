import "dotenv/config";
import dns from "node:dns";
import { createHash } from "node:crypto";

// Patch dns.resolve4/resolve6 to check /etc/hosts first (for Docker extra_hosts)
// Node.js fetch (undici) uses dns.resolve which bypasses /etc/hosts
const hostsMap: Record<string, string> = {};
try {
  const fs = require("node:fs");
  const hostsFile = fs.readFileSync("/etc/hosts", "utf8");
  for (const line of hostsFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      for (let i = 1; i < parts.length; i++) {
        hostsMap[parts[i]] = parts[0];
      }
    }
  }
} catch {}

const origResolve4 = dns.resolve4;
(dns as any).resolve4 = function(hostname: string, optionsOrCb: any, maybeCb?: any) {
  const cb = typeof maybeCb === "function" ? maybeCb : typeof optionsOrCb === "function" ? optionsOrCb : null;
  if (hostsMap[hostname] && cb) {
    return cb(null, [hostsMap[hostname]]);
  }
  return origResolve4.call(dns, hostname, optionsOrCb, maybeCb);
};

import { serve } from "@hono/node-server";
import { createBot, setupBotMenu } from "./bot/index.js";
import { createWebApp } from "./web/server.js";
import { startScheduler } from "./scheduler.js";
import { warmupCache } from "./db/queries.js";

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("BOT_TOKEN is required in .env");
  process.exit(1);
}

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const bot = createBot(token, {
  botInfo: {
    id: 8503668466,
    is_bot: true,
    first_name: "ПИК | Динамика цен",
    username: "piksalebot",
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
    can_connect_to_business: false,
    has_main_web_app: false,
    has_topics_enabled: false,
    allows_users_to_create_topics: false,
  },
});

// Web app
const app = createWebApp();

// Bot webhook endpoint.
// The secret is derived from the token so no extra env var is needed; Telegram
// echoes it back in a header, which keeps the public endpoint from accepting
// forged updates.
const WEBHOOK_SECRET = createHash("sha256")
  .update(token)
  .digest("hex")
  .slice(0, 32);

if (WEBHOOK_URL) {
  app.post("/bot/webhook", async (c) => {
    if (c.req.header("x-telegram-bot-api-secret-token") !== WEBHOOK_SECRET) {
      console.warn("Rejected webhook call with bad secret token");
      return c.json({ ok: true });
    }
    try {
      const body = await c.req.json();
      // Process update asynchronously — respond immediately to TG
      bot.handleUpdate(body).catch((err) => {
        console.error("Bot update error:", err);
      });
      return c.json({ ok: true });
    } catch (err) {
      console.error("Webhook parse error:", err);
      return c.json({ ok: true });
    }
  });
}

// Register the webhook with Telegram on every boot. Without this the bot goes
// silent whenever the registration is lost on Telegram's side, with no signal
// here: the container stays up and the endpoint keeps answering 200.
async function registerWebhook(url: string) {
  const endpoint = `${url.replace(/\/$/, "")}/bot/webhook`;
  await bot.api.setWebhook(endpoint, {
    secret_token: WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query"],
  });
  const info = await bot.api.getWebhookInfo();
  console.log(
    `Webhook registered: ${info.url} (pending=${info.pending_update_count}` +
      `${info.last_error_message ? `, last_error="${info.last_error_message}"` : ""})`,
  );
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

  setupBotMenu(bot).catch((err) =>
    console.error("Failed to publish bot commands:", err),
  );

  if (WEBHOOK_URL) {
    registerWebhook(WEBHOOK_URL).catch((err) =>
      console.error("Webhook registration FAILED — bot will not receive updates:", err),
    );
  } else {
    // Long polling only needs the outbound direction. A webhook left registered
    // on Telegram's side makes getUpdates fail with 409, so clear it first.
    bot.api
      .deleteWebhook()
      .catch((err) => console.error("deleteWebhook failed:", err))
      .then(() =>
        bot.start({
          onStart: () => console.log("Bot started (long polling)"),
        }),
      );
  }
});
