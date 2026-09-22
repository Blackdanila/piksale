import type { Context } from "grammy";
import {
  getUserSubscriptions,
  addSubscription,
  removeSubscription,
  getBlock,
} from "../../db/queries.js";
import { InlineKeyboard } from "grammy";

export async function handleMyProjects(ctx: Context) {
  const chatId = BigInt(ctx.chat?.id ?? 0);
  const subs = await getUserSubscriptions(chatId);

  // Refreshing after an unsubscribe edits the list in place instead of
  // posting a fresh copy under it.
  const send = async (text: string, kb?: InlineKeyboard) => {
    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { reply_markup: kb }).catch(() => {});
    } else {
      await ctx.reply(text, { reply_markup: kb });
    }
  };

  if (subs.length === 0) {
    await send(
      "🔔 У вас пока нет подписок.\n\nНайдите ЖК через 🔍 Поиск или 🏢 Каталог ЖК и нажмите «Подписаться» — каждое утро буду присылать изменения цен.",
    );
    return;
  }

  const lines = subs.map((s, i) => {
    const roomsLabel = s.rooms ? ` · ${s.rooms}-комн` : " · все";
    return `${i + 1}. ${s.block.name}${roomsLabel}`;
  });

  const kb = new InlineKeyboard();
  subs.forEach((s, i) => {
    kb.text(`❌ ${i + 1}`, `unsub:${s.blockId}:${s.rooms ?? "all"}`);
    if ((i + 1) % 3 === 0) kb.row();
  });

  await send(
    `🔔 Ваши подписки:\n\n${lines.join("\n")}\n\nНажмите ❌ чтобы отписаться:`,
    kb,
  );
}

export async function handleSubscribe(ctx: Context, blockId: number) {
  const chatId = BigInt(ctx.chat?.id ?? 0);
  const block = await getBlock(blockId);

  if (!block) {
    await ctx.answerCallbackQuery("ЖК не найден");
    return;
  }

  await addSubscription(chatId, blockId);
  await ctx.answerCallbackQuery(`✅ Подписка на ${block.name} оформлена!`);

  // Update the message to show unsubscribe button
  if (ctx.callbackQuery?.message) {
    const kb = new InlineKeyboard().text("🔕 Отписаться", `unsub:${blockId}`);
    try {
      await ctx.editMessageReplyMarkup({ reply_markup: kb });
    } catch {
      // Message might not be editable
    }
  }
}

export async function handleUnsubscribe(
  ctx: Context,
  blockId: number,
  rooms?: string,
) {
  const chatId = BigInt(ctx.chat?.id ?? 0);
  const roomsNum = rooms && rooms !== "all" ? parseInt(rooms, 10) : undefined;

  await removeSubscription(chatId, blockId, roomsNum);
  await ctx.answerCallbackQuery("🔕 Отписка оформлена");

  // Refresh the list
  await handleMyProjects(ctx);
}
