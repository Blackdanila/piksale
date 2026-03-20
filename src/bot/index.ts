import { Bot, type BotConfig, type Context } from "grammy";
import { handleStart } from "./commands/start.js";
import { handleProjects } from "./commands/projects.js";
import { handleSearch } from "./commands/search.js";
import { handleMyProjects } from "./commands/subscribe.js";
import { handleDynamics } from "./commands/dynamics.js";
import { handleCallback } from "./callbacks.js";

export function createBot(token: string, config?: Omit<BotConfig<Context>, "client">) {
  const bot = new Bot(token, config);

  // Commands
  bot.command("start", handleStart);
  bot.command("projects", handleProjects);
  bot.command("search", handleSearch);
  bot.command("dynamics", handleDynamics);
  bot.command("myprojects", handleMyProjects);

  // Reply keyboard menu handlers
  bot.hears("🏠 Мои ЖК", handleMyProjects);
  bot.hears("🔍 Поиск", handleSearch);
  bot.hears("📊 Динамика", handleDynamics);
  bot.hears("⚙ Настройки", async (ctx) => {
    await ctx.reply(
      [
        "⚙ Настройки",
        "",
        "/myprojects — мои подписки",
        "/search — поиск квартир",
        "/dynamics — динамика цен",
      ].join("\n"),
    );
  });

  // Callback queries
  bot.on("callback_query:data", handleCallback);

  // Error handler
  bot.catch((err) => {
    console.error("Bot error:", err);
  });

  return bot;
}
