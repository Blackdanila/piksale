import cron from "node-cron";
import type { Bot } from "grammy";
import type { Context } from "grammy";
import { collectAll } from "./scraper/collector.js";
import { getSubscriptionsForBlock, getFlat } from "./db/queries.js";
import { formatPriceChangeNotification } from "./formatters/flat-card.js";
import { InlineKeyboard } from "grammy";

export function startScheduler(bot: Bot<Context>) {
  // Run daily at 06:00 MSK (03:00 UTC)
  cron.schedule("0 3 * * *", async () => {
    console.log("Scheduled collection started");

    try {
      const changes = await collectAll();

      if (changes.length > 0) {
        await notifySubscribers(bot, changes);
      }

      console.log(`Scheduled collection done. ${changes.length} changes.`);
    } catch (err) {
      console.error("Scheduled collection failed:", err);
    }
  });

  console.log("Scheduler started: daily at 06:00 MSK");
}

interface PriceChange {
  flatId: number;
  blockId: number;
  oldPrice: number;
  newPrice: number;
  rooms: number | null;
}

async function notifySubscribers(bot: Bot<Context>, changes: PriceChange[]) {
  // Group changes by block
  const changesByBlock = new Map<number, PriceChange[]>();
  for (const change of changes) {
    const existing = changesByBlock.get(change.blockId) ?? [];
    existing.push(change);
    changesByBlock.set(change.blockId, existing);
  }

  for (const [blockId, blockChanges] of changesByBlock) {
    const subs = await getSubscriptionsForBlock(blockId);
    if (subs.length === 0) continue;

    for (const sub of subs) {
      // Filter changes by rooms if subscription has rooms filter
      const relevant = sub.rooms
        ? blockChanges.filter((c) => c.rooms === sub.rooms)
        : blockChanges;

      if (relevant.length === 0) continue;

      // Send up to 5 most significant changes
      const sorted = relevant
        .map((c) => ({
          ...c,
          pctChange: Math.abs((c.newPrice - c.oldPrice) / c.oldPrice),
        }))
        .sort((a, b) => b.pctChange - a.pctChange)
        .slice(0, 5);

      for (const change of sorted) {
        try {
          const flat = await getFlat(change.flatId);
          if (!flat) continue;

          const text = formatPriceChangeNotification(flat, change.oldPrice);
          const kb = new InlineKeyboard()
            .text("📊 История", `flat:history:${change.flatId}`);

          if (flat.url) {
            const pikUrl = flat.url.startsWith("http") ? flat.url : `https://www.pik.ru${flat.url}`;
            kb.url("🔗 pik.ru", pikUrl);
          }

          await bot.api.sendMessage(Number(sub.chatId), text, {
            reply_markup: kb,
          });
        } catch (err) {
          console.error(`Failed to notify chat ${sub.chatId}:`, err);
        }
      }
    }
  }
}
