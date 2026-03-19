import type { Context } from "grammy";
import {
  getLocations,
  getBlockAvgPriceHistory,
  getPriceHistory,
  getFlat,
} from "../../db/queries.js";
import { locationKeyboard, dynamicsPeriodKeyboard } from "../keyboards.js";
import { formatPriceTable, formatFlatPriceTable } from "../../formatters/price-table.js";
import { formatRooms, formatArea } from "../../formatters/helpers.js";

export async function handleDynamics(ctx: Context) {
  const locations = await getLocations();
  if (locations.length === 0) {
    await ctx.reply("Данные ещё не загружены. Попробуйте позже.");
    return;
  }

  await ctx.reply("📊 Выберите город для просмотра динамики:", {
    reply_markup: locationKeyboard(locations, "dyn"),
  });
}

export async function handleDynamicsLocationSelect(ctx: Context, locationId: number) {
  // Reuse project location handler but with dynamics context
  const { getBlocksByLocation } = await import("../../db/queries.js");
  const { blockListKeyboard } = await import("../keyboards.js");

  const blocks = await getBlocksByLocation(locationId);
  if (blocks.length === 0) {
    await ctx.answerCallbackQuery("Нет ЖК в этом городе");
    return;
  }

  const BLOCKS_PER_PAGE = 5;
  const totalPages = Math.ceil(blocks.length / BLOCKS_PER_PAGE);
  const pageBlocks = blocks.slice(0, BLOCKS_PER_PAGE);

  const lines = pageBlocks.map((b, i) => `${i + 1}. ${b.name}`);
  const text = `📊 Выберите ЖК:\n\n${lines.join("\n")}`;
  const kb = blockListKeyboard(
    pageBlocks.map((b) => ({ id: b.id, name: b.name })),
    `dyn:${locationId}`,
    1,
    totalPages,
  );

  await ctx.editMessageText(text, { reply_markup: kb });
  await ctx.answerCallbackQuery();
}

export async function handleDynamicsBlockSelect(ctx: Context, blockId: number) {
  const kb = dynamicsPeriodKeyboard(blockId);
  await ctx.editMessageText("📊 Выберите период:", { reply_markup: kb });
  await ctx.answerCallbackQuery();
}

export async function handleDynamicsPeriod(
  ctx: Context,
  blockId: number,
  days: number,
) {
  const { getBlock } = await import("../../db/queries.js");
  const block = await getBlock(blockId);
  if (!block) {
    await ctx.answerCallbackQuery("ЖК не найден");
    return;
  }

  const history = await getBlockAvgPriceHistory(blockId, days);
  const text = formatPriceTable(block.name, history);

  const kb = dynamicsPeriodKeyboard(blockId);
  await ctx.editMessageText(text, { reply_markup: kb });
  await ctx.answerCallbackQuery();
}

export async function handleFlatHistory(ctx: Context, flatId: number) {
  const flat = await getFlat(flatId);
  if (!flat) {
    await ctx.answerCallbackQuery("Квартира не найдена");
    return;
  }

  const history = await getPriceHistory(flatId, 90);
  const label = `${flat.block.name} · ${formatRooms(flat.rooms)} · ${formatArea(flat.area)}`;
  const text = formatFlatPriceTable(label, history);

  await ctx.editMessageText(text);
  await ctx.answerCallbackQuery();
}
