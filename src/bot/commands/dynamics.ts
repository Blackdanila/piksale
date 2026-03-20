import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import {
  getLocations,
  getBlockAvgPriceHistory,
  getPriceHistory,
  getFlat,
  getBlocksByLocation,
  getBlock,
} from "../../db/queries.js";
import { prisma } from "../../db/prisma.js";
import { locationKeyboard, dynamicsPeriodKeyboard, blockListKeyboard } from "../keyboards.js";
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
  const blocks = await getBlocksByLocation(locationId);
  if (blocks.length === 0) {
    await ctx.answerCallbackQuery("Нет ЖК в этом городе");
    return;
  }

  // Show city-level dynamics first + block list
  const location = (await getLocations()).find((l) => l.id === locationId);
  const cityName = location?.name ?? "Город";

  const BLOCKS_PER_PAGE = 5;
  const totalPages = Math.ceil(blocks.length / BLOCKS_PER_PAGE);
  const pageBlocks = blocks.slice(0, BLOCKS_PER_PAGE);

  const lines = pageBlocks.map((b, i) => `${i + 1}. ${b.name}`);
  const text = `📊 ${cityName} · динамика\n\nВыберите ЖК или смотрите общую::\n\n${lines.join("\n")}`;

  const kb = new InlineKeyboard()
    .text(`📊 Вся динамика ${cityName}`, `dynloc:${locationId}:30`)
    .row();

  pageBlocks.forEach((b, i) => {
    kb.text(`${i + 1}`, `dyn:${locationId}:block:${b.id}`);
  });
  kb.row();

  if (totalPages > 1) {
    kb.text(`Стр 1/${totalPages}`, "noop");
    kb.text("След ▶", `dyn:${locationId}:page:2`);
    kb.row();
  }

  kb.text("← Назад", "dyn:back");

  await ctx.editMessageText(text, { reply_markup: kb });
  await ctx.answerCallbackQuery();
}

export async function handleDynamicsCity(
  ctx: Context,
  locationId: number,
  days: number,
) {
  const location = (await getLocations()).find((l) => l.id === locationId);
  const cityName = location?.name ?? "Город";

  const since = new Date();
  since.setDate(since.getDate() - days);

  const data = await prisma.blockDailyStats.findMany({
    where: {
      block: { locationId },
      date: { gte: since },
      avgMeterPrice: { gt: 0 },
    },
    select: { date: true, avgMeterPrice: true, medianMeterPrice: true, totalFlats: true },
    orderBy: { date: "desc" },
  });

  // Group by date
  const byDate = new Map<string, { prices: number[]; flats: number }>();
  for (const row of data) {
    const d = row.date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
    if (!byDate.has(d)) byDate.set(d, { prices: [], flats: 0 });
    const entry = byDate.get(d)!;
    entry.prices.push(row.medianMeterPrice);
    entry.flats += row.totalFlats;
  }

  const lines: string[] = [`📊 ${cityName} · ₽/м² (медиана)`, ""];

  const dates = [...byDate.entries()];
  for (let i = 0; i < dates.length; i++) {
    const [date, { prices, flats }] = dates[i];
    const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);

    let trend = "——";
    if (i < dates.length - 1) {
      const prevPrices = dates[i + 1][1].prices;
      const prevAvg = Math.round(prevPrices.reduce((a, b) => a + b, 0) / prevPrices.length);
      if (avg !== prevAvg) {
        const pct = (((avg - prevAvg) / prevAvg) * 100).toFixed(1);
        trend = avg > prevAvg ? `📈 +${pct}%` : `📉 ${pct}%`;
      }
    }

    lines.push(`${date}  ${avg.toLocaleString("ru-RU")}  ${trend}`);
  }

  if (dates.length === 0) {
    lines.push("Нет данных за выбранный период");
  }

  const kb = new InlineKeyboard()
    .text("30 дн", `dynloc:${locationId}:30`)
    .text("90 дн", `dynloc:${locationId}:90`)
    .text("Год", `dynloc:${locationId}:365`)
    .row()
    .text("← К ЖК", `dyn:loc:${locationId}`);

  await ctx.editMessageText(lines.join("\n"), { reply_markup: kb });
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
