import type { Context } from "grammy";
import {
  getLocations,
  getBlocksByLocation,
  countFlatsByBlock,
  getMinPriceByBlock,
} from "../../db/queries.js";
import {
  locationKeyboard,
  blockListKeyboard,
  subscribeKeyboard,
} from "../keyboards.js";
import { formatPrice } from "../../formatters/helpers.js";

const BLOCKS_PER_PAGE = 5;

export async function handleProjects(ctx: Context) {
  const locations = await getLocations();
  if (locations.length === 0) {
    await ctx.reply("Данные ещё не загружены. Попробуйте позже.");
    return;
  }

  await ctx.reply("📍 Выберите город:", {
    reply_markup: locationKeyboard(locations, "proj"),
  });
}

export async function handleProjectLocationSelect(
  ctx: Context,
  locationId: number,
  page = 1,
) {
  const blocks = await getBlocksByLocation(locationId);
  if (blocks.length === 0) {
    await ctx.answerCallbackQuery("Нет ЖК в этом городе");
    return;
  }

  const totalPages = Math.ceil(blocks.length / BLOCKS_PER_PAGE);
  const pageBlocks = blocks.slice(
    (page - 1) * BLOCKS_PER_PAGE,
    page * BLOCKS_PER_PAGE,
  );

  const lines: string[] = [];
  for (let i = 0; i < pageBlocks.length; i++) {
    const block = pageBlocks[i];
    const count = await countFlatsByBlock(block.id);
    const minPrice = await getMinPriceByBlock(block.id);
    const priceStr = minPrice ? `от ${formatPrice(minPrice)}` : "нет данных";
    lines.push(`${i + 1}. ${block.name}\n   ${priceStr} · ${count} кв.`);
  }

  const text = `📍 ЖК (стр. ${page}/${totalPages})\n\n${lines.join("\n")}`;
  const kb = blockListKeyboard(
    pageBlocks.map((b) => ({ id: b.id, name: b.name })),
    `proj:${locationId}`,
    page,
    totalPages,
  );

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { reply_markup: kb });
    await ctx.answerCallbackQuery();
  } else {
    await ctx.reply(text, { reply_markup: kb });
  }
}

export async function handleProjectBlockSelect(
  ctx: Context,
  blockId: number,
) {
  const block = await import("../../db/queries.js").then((m) =>
    m.getBlock(blockId),
  );
  if (!block) {
    await ctx.answerCallbackQuery("ЖК не найден");
    return;
  }

  const count = await countFlatsByBlock(blockId);
  const minPrice = await getMinPriceByBlock(blockId);
  const priceStr = minPrice ? formatPrice(minPrice) : "нет данных";

  // Check if user is subscribed
  const chatId = BigInt(ctx.chat?.id ?? 0);
  const subs = await import("../../db/queries.js").then((m) =>
    m.getUserSubscriptions(chatId),
  );
  const isSubscribed = subs.some((s) => s.blockId === blockId);

  const text = [
    `🏠 ${block.name}`,
    block.address ? `📍 ${block.address}` : null,
    ``,
    `🏢 ${count} свободных квартир`,
    `💰 от ${priceStr}`,
  ]
    .filter(Boolean)
    .join("\n");

  const kb = subscribeKeyboard(blockId, isSubscribed);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { reply_markup: kb });
    await ctx.answerCallbackQuery();
  } else {
    await ctx.reply(text, { reply_markup: kb });
  }
}
