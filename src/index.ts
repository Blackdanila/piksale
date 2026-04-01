import "dotenv/config";
import dns from "node:dns";

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
import { createBot } from "./bot/index.js";
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

// Bot webhook endpoint
if (WEBHOOK_URL) {
  app.post("/bot/webhook", async (c) => {
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
    console.log(`Bot running via webhook: ${WEBHOOK_URL}/bot/webhook`);
  } else {
    bot.start({
      onStart: () => console.log("Bot started (long polling)"),
    });
  }
});
