import type { Context } from "grammy";
import {
  handleProjectLocationSelect,
  handleProjectBlockSelect,
} from "./commands/projects.js";
import {
  handleSearchLocationSelect,
  handleSearchRoomsSelect,
  handleSearchPriceSelect,
  handleSearchResultPage,
  handleSearch,
} from "./commands/search.js";
import {
  handleSubscribe,
  handleUnsubscribe,
} from "./commands/subscribe.js";
import {
  handleDynamics,
  handleDynamicsLocationSelect,
  handleDynamicsCity,
  handleDynamicsBlockSelect,
  handleDynamicsPeriod,
  handleFlatHistory,
} from "./commands/dynamics.js";
import { getFlat } from "../db/queries.js";
import { formatFlatCard } from "../formatters/flat-card.js";
import { flatCardKeyboard } from "./keyboards.js";

export async function handleCallback(ctx: Context) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  if (data === "noop") {
    await ctx.answerCallbackQuery();
    return;
  }

  // Answer callback early to prevent Telegram timeout (ignore errors for stale queries)
  await ctx.answerCallbackQuery().catch(() => {});

  try {
    const t = Date.now();
    await routeCallback(ctx, data);
    const elapsed = Date.now() - t;
    if (elapsed > 1000) console.warn(`Slow callback "${data}": ${elapsed}ms`);
  } catch (err) {
    console.error(`Callback error for "${data}":`, err);
  }
}

async function routeCallback(ctx: Context, data: string) {
  // Projects: proj:loc:{id}, proj:{locId}:block:{id}, proj:{locId}:page:{n}
  if (data.startsWith("proj:loc:")) {
    const locId = parseInt(data.split(":")[2], 10);
    await handleProjectLocationSelect(ctx, locId);
    return;
  }

  if (data.match(/^proj:\d+:block:\d+$/)) {
    const blockId = parseInt(data.split(":")[3], 10);
    await handleProjectBlockSelect(ctx, blockId);
    return;
  }

  if (data.match(/^proj:\d+:page:\d+$/)) {
    const parts = data.split(":");
    const locId = parseInt(parts[1], 10);
    const page = parseInt(parts[3], 10);
    await handleProjectLocationSelect(ctx, locId, page);
    return;
  }

  // Search: search:loc:{id}, search:rooms:{n}, search:price:{range}
  if (data.startsWith("search:loc:")) {
    const locId = parseInt(data.split(":")[2], 10);
    await handleSearchLocationSelect(ctx, locId);
    return;
  }

  if (data.startsWith("search:rooms:")) {
    const rooms = data.split(":")[2];
    await handleSearchRoomsSelect(ctx, rooms);
    return;
  }

  if (data.startsWith("search:price:")) {
    const price = data.split(":")[2];
    await handleSearchPriceSelect(ctx, price);
    return;
  }

  if (data.startsWith("search:result:")) {
    const page = parseInt(data.split(":")[2], 10);
    await handleSearchResultPage(ctx, page);
    return;
  }

  if (data === "search:restart") {
    await handleSearch(ctx);
    return;
  }

  if (data === "search:back") {
    await handleSearch(ctx);
    return;
  }

  // Subscribe/unsubscribe
  if (data.startsWith("sub:")) {
    const blockId = parseInt(data.split(":")[1], 10);
    await handleSubscribe(ctx, blockId);
    return;
  }

  if (data.startsWith("unsub:")) {
    const parts = data.split(":");
    const blockId = parseInt(parts[1], 10);
    const rooms = parts[2];
    await handleUnsubscribe(ctx, blockId, rooms);
    return;
  }

  // Dynamics: dynloc:{locId}:{days}, dyn:loc:{id}, dyn:{locId}:block:{id}, dyn:{blockId}:{days}
  if (data.match(/^dynloc:\d+:\d+$/)) {
    const parts = data.split(":");
    const locId = parseInt(parts[1], 10);
    const days = parseInt(parts[2], 10);
    await handleDynamicsCity(ctx, locId, days);
    return;
  }

  if (data === "dyn:back") {
    await handleDynamics(ctx);
    return;
  }

  if (data.startsWith("dyn:loc:")) {
    const locId = parseInt(data.split(":")[2], 10);
    await handleDynamicsLocationSelect(ctx, locId);
    return;
  }

  if (data.match(/^dyn:\d+:block:\d+$/)) {
    const blockId = parseInt(data.split(":")[3], 10);
    await handleDynamicsBlockSelect(ctx, blockId);
    return;
  }

  if (data.match(/^dyn:\d+:\d+$/) && !data.match(/^dyn:\d+:block:/)) {
    const parts = data.split(":");
    const blockId = parseInt(parts[1], 10);
    const days = parseInt(parts[2], 10);
    await handleDynamicsPeriod(ctx, blockId, days);
    return;
  }

  // Flat: flat:view:{id}, flat:history:{id}, flat:plan:{id}
  if (data.startsWith("flat:view:")) {
    const flatId = parseInt(data.split(":")[2], 10);
    const flat = await getFlat(flatId);
    if (!flat) {
      await ctx.answerCallbackQuery("Квартира не найдена");
      return;
    }
    const text = formatFlatCard(flat);
    const kb = flatCardKeyboard(flatId, flat.url);
    const planUrl = flat.planRender ?? flat.planSvg;

    if (planUrl) {
      // Send plan as photo with flat info as caption
      try {
        await ctx.replyWithPhoto(planUrl, {
          caption: text,
          reply_markup: kb,
        });
      } catch {
        // Fallback to text if photo fails
        await ctx.editMessageText(text, { reply_markup: kb });
      }
    } else {
      await ctx.editMessageText(text, { reply_markup: kb });
    }
    await ctx.answerCallbackQuery();
    return;
  }

  if (data.startsWith("flat:history:")) {
    const flatId = parseInt(data.split(":")[2], 10);
    await handleFlatHistory(ctx, flatId);
    return;
  }

  if (data.startsWith("flat:plan:")) {
    const flatId = parseInt(data.split(":")[2], 10);
    const flatForPlan = await getFlat(flatId);
    if (!flatForPlan) {
      await ctx.answerCallbackQuery("Квартира не найдена");
      return;
    }
    const planUrl = flatForPlan.planRender ?? flatForPlan.planSvg;
    if (!planUrl) {
      await ctx.answerCallbackQuery("Планировка недоступна для этой квартиры");
      return;
    }
    try {
      await ctx.replyWithPhoto(planUrl, {
        caption: `📐 ${flatForPlan.block.name}${flatForPlan.bulkName ? ` · ${flatForPlan.bulkName}` : ""}\n${flatForPlan.rooms === 0 ? "Студия" : `${flatForPlan.rooms}-комн`} · ${flatForPlan.area}м² · ${flatForPlan.floor} эт.`,
      });
    } catch {
      await ctx.answerCallbackQuery("Не удалось загрузить планировку");
    }
    await ctx.answerCallbackQuery();
    return;
  }

  await ctx.answerCallbackQuery();
}
