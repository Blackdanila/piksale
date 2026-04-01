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
  const effPrice = flat.benefitPrice ?? flat.currentPrice;
  const effMeter = flat.benefitMeterPrice ?? flat.meterPrice;

  const bulkInfo = flat.bulkName ? ` · корп. ${flat.bulkName}` : "";
  lines.push(`🏠 ${flat.block.name}${bulkInfo}`);
  lines.push(
    `${formatRooms(flat.rooms)} · ${formatArea(flat.area)} · ${flat.floor} эт.${flat.number ? ` · кв.${flat.number}` : ""}`,
  );
  lines.push(
    `💰 ${formatPriceExact(effPrice)} (${formatMeterPriceExact(effMeter)})`,
  );

  if (flat.benefitPrice != null && flat.benefitPrice < flat.currentPrice) {
    lines.push(`🏷 Скидка: ${formatPriceExact(flat.currentPrice)} → ${formatPriceExact(flat.benefitPrice)}`);
  }

  if (prevPrice && prevPrice !== effPrice) {
    lines.push(`${formatPercent(prevPrice, effPrice)} за месяц`);
  }

  return lines.join("\n");
}

export function formatFlatListItem(
  flat: FlatWithBlock,
  index: number,
): string {
  const effPrice = flat.benefitPrice ?? flat.currentPrice;
  const effMeter = flat.benefitMeterPrice ?? flat.meterPrice;
  const price =
    effPrice >= 1_000_000
      ? `${(effPrice / 1_000_000).toFixed(1)} млн ₽`
      : `${effPrice.toLocaleString("ru-RU")} ₽`;
  const meterPrice = `${Math.round(effMeter / 1000)}к/м²`;

  return `${index}. ${flat.block.name} · ${formatArea(flat.area)} · ${flat.floor} эт.\n   💰 ${price} · ${meterPrice}`;
}

export function formatPriceChangeNotification(
  flat: FlatWithBlock,
  oldPrice: number,
): string {
  const effPrice = flat.benefitPrice ?? flat.currentPrice;
  const bulkInfo = flat.bulkName ? ` · корп. ${flat.bulkName}` : "";
  return [
    `🔔 Изменение цены!`,
    ``,
    `🏠 ${flat.block.name}${bulkInfo}`,
    `${formatRooms(flat.rooms)} · ${formatArea(flat.area)} · ${flat.floor} эт.${flat.number ? ` · кв.${flat.number}` : ""}`,
    `💰 ${formatPriceExact(oldPrice)} → ${formatPriceExact(effPrice)}`,
    `${formatPercent(oldPrice, effPrice)} (${formatPriceDiff(oldPrice, effPrice)})`,
  ].join("\n");
}
