import type { Context } from "grammy";
import { mainMenu } from "../keyboards.js";

export async function handleStart(ctx: Context) {
  await ctx.reply(
    [
      "👋 Привет! Я PIKsale — бот для мониторинга цен ПИК.",
      "",
      "Что я умею:",
      "🏠 **Мои ЖК** — ваши подписки и уведомления",
      "🔍 **Поиск** — найти квартиры с фильтрами",
      "📊 **Динамика** — история изменения цен",
      "⚙ **Настройки** — управление подписками",
      "",
      "Выберите действие в меню 👇",
    ].join("\n"),
    { reply_markup: mainMenu, parse_mode: "Markdown" },
  );
}
