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

// Fills Telegram's native "Menu" button. Without this the button is empty even
// though the commands are registered on our side.
export async function setupBotMenu(bot: Bot) {
  await bot.api.setMyCommands(botCommands);
  console.log(`Bot menu published (${botCommands.length} commands)`);
}
