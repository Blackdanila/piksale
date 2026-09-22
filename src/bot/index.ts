import { Bot, type BotConfig, type Context } from "grammy";
import { handleStart, handleHelp } from "./commands/start.js";
import { handleProjects } from "./commands/projects.js";
import { handleSearch } from "./commands/search.js";
import { handleMyProjects } from "./commands/subscribe.js";
import { handleDynamics } from "./commands/dynamics.js";
import { handleCallback } from "./callbacks.js";
import { botCommands, mainMenu } from "./keyboards.js";

export function createBot(token: string, config?: Omit<BotConfig<Context>, "client">) {
  const bot = new Bot(token, config);

  // Commands
  bot.command("start", handleStart);
  bot.command("help", handleHelp);
  bot.command("projects", handleProjects);
  bot.command("search", handleSearch);
  bot.command("dynamics", handleDynamics);
  bot.command("myprojects", handleMyProjects);

  // Reply keyboard menu handlers. The older labels are kept because a
  // persistent keyboard stays on the client until the user reopens /start.
  bot.hears(["🔍 Поиск"], handleSearch);
  bot.hears(["🏢 Каталог ЖК"], handleProjects);
  bot.hears(["📊 Динамика"], handleDynamics);
  bot.hears(["🔔 Мои подписки", "🏠 Мои ЖК"], handleMyProjects);
  bot.hears(["⚙ Настройки"], handleHelp);

  // Callback queries
  bot.on("callback_query:data", handleCallback);

  // Anything else: don't leave the message unanswered.
  bot.on("message:text", async (ctx) => {
    await ctx.reply(
      "Не понял запрос. Выберите действие в меню ниже или отправьте /help.",
      { reply_markup: mainMenu },
    );
  });

  // Error handler
  bot.catch((err) => {
    console.error("Bot error:", err);
  });

  return bot;
}

// Rejects if the call outlives the deadline. The underlying request is left to
// die on its own; what matters is that the caller gets to retry.
function withDeadline<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error(`timed out after ${ms}ms`)), ms).unref(),
    ),
  ]);
}

// Fills Telegram's native "Menu" button. Without this the button is empty even
// though the commands are registered on our side.
//
// Connectivity to api.telegram.org from this host is intermittent and a stuck
// request can hang for minutes, so each attempt gets its own deadline and the
// call is retried rather than silently lost.
export async function setupBotMenu(bot: Bot, attempts = 5) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await withDeadline(bot.api.setMyCommands(botCommands), 15_000);
      console.log(`Bot menu published (${botCommands.length} commands)`);
      return;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`setMyCommands attempt ${i}/${attempts} failed: ${reason}`);
      if (i < attempts) await new Promise((r) => setTimeout(r, 5_000));
    }
  }
  console.error("Could not publish bot commands — native menu stays empty");
}
