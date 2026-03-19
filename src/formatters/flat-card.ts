import type { Flat, Block } from "@prisma/client";
import {
  formatRooms,
  formatArea,
  formatPriceExact,
  formatMeterPriceExact,
  formatPercent,
  formatPriceDiff,
} from "./helpers.js";

interface FlatWithBlock extends Flat {
  block: Block;
}

export function formatFlatCard(
  flat: FlatWithBlock,
  prevPrice?: number,
): string {
  const lines: string[] = [];

  const bulkInfo = flat.bulkName ? ` · корп. ${flat.bulkName}` : "";
  lines.push(`🏠 ${flat.block.name}${bulkInfo}`);
  lines.push(
    `${formatRooms(flat.rooms)} · ${formatArea(flat.area)} · ${flat.floor} эт.${flat.number ? ` · кв.${flat.number}` : ""}`,
  );
  lines.push(
    `💰 ${formatPriceExact(flat.currentPrice)} (${formatMeterPriceExact(flat.meterPrice)})`,
  );

  if (prevPrice && prevPrice !== flat.currentPrice) {
    lines.push(`${formatPercent(prevPrice, flat.currentPrice)} за месяц`);
  }

  return lines.join("\n");
}

export function formatFlatListItem(
  flat: FlatWithBlock,
  index: number,
): string {
  const price =
    flat.currentPrice >= 1_000_000
      ? `${(flat.currentPrice / 1_000_000).toFixed(1)} млн ₽`
      : `${flat.currentPrice.toLocaleString("ru-RU")} ₽`;
  const meterPrice = `${Math.round(flat.meterPrice / 1000)}к/м²`;

  return `${index}. ${flat.block.name} · ${formatArea(flat.area)} · ${flat.floor} эт.\n   💰 ${price} · ${meterPrice}`;
}

export function formatPriceChangeNotification(
  flat: FlatWithBlock,
  oldPrice: number,
): string {
  const bulkInfo = flat.bulkName ? ` · корп. ${flat.bulkName}` : "";
  return [
    `🔔 Изменение цены!`,
    ``,
    `🏠 ${flat.block.name}${bulkInfo}`,
    `${formatRooms(flat.rooms)} · ${formatArea(flat.area)} · ${flat.floor} эт.${flat.number ? ` · кв.${flat.number}` : ""}`,
    `💰 ${formatPriceExact(oldPrice)} → ${formatPriceExact(flat.currentPrice)}`,
    `${formatPercent(oldPrice, flat.currentPrice)} (${formatPriceDiff(oldPrice, flat.currentPrice)})`,
  ].join("\n");
}
