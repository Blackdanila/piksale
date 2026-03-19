import { formatDate, formatPercent } from "./helpers.js";

interface PriceRow {
  date: string | Date;
  avg_meter_price: number;
}

export function formatPriceTable(
  blockName: string,
  rows: PriceRow[],
): string {
  if (rows.length === 0) {
    return `📊 ${blockName}\n\nНет данных за выбранный период`;
  }

  const lines: string[] = [`📊 ${blockName} · ₽/м²`, ""];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const date = formatDate(row.date);
    const price = row.avg_meter_price.toLocaleString("ru-RU");

    let trend = "——";
    if (i < rows.length - 1) {
      const prev = rows[i + 1]; // rows are desc, so i+1 is earlier
      if (prev.avg_meter_price !== row.avg_meter_price) {
        trend = formatPercent(prev.avg_meter_price, row.avg_meter_price);
      }
    }

    lines.push(`${date}  ${price}  ${trend}`);
  }

  return lines.join("\n");
}

interface FlatPriceRow {
  date: Date;
  price: number;
  meterPrice: number;
}

export function formatFlatPriceTable(
  flatLabel: string,
  rows: FlatPriceRow[],
): string {
  if (rows.length === 0) {
    return `📊 ${flatLabel}\n\nНет данных`;
  }

  const lines: string[] = [`📊 ${flatLabel}`, ""];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const date = formatDate(row.date);
    const price = row.price.toLocaleString("ru-RU");

    let trend = "——";
    if (i < rows.length - 1) {
      const prev = rows[i + 1];
      if (prev.price !== row.price) {
        trend = formatPercent(prev.price, row.price);
      }
    }

    lines.push(`${date}  ${price} ₽  ${trend}`);
  }

  return lines.join("\n");
}
