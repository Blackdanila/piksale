export function formatPrice(price: number): string {
  if (price >= 1_000_000) {
    const millions = price / 1_000_000;
    return `${millions.toFixed(1)} млн ₽`;
  }
  return `${price.toLocaleString("ru-RU")} ₽`;
}

export function formatPriceExact(price: number): string {
  return `${price.toLocaleString("ru-RU")} ₽`;
}

export function formatMeterPrice(price: number): string {
  if (price >= 1000) {
    return `${Math.round(price / 1000)}к/м²`;
  }
  return `${price.toLocaleString("ru-RU")}/м²`;
}

export function formatMeterPriceExact(price: number): string {
  return `${price.toLocaleString("ru-RU")} ₽/м²`;
}

export function formatArea(area: number): string {
  return `${area}м²`;
}

export function formatRooms(rooms: number): string {
  if (rooms === 0) return "Студия";
  return `${rooms}-комн`;
}

export function formatPercent(oldPrice: number, newPrice: number): string {
  const diff = ((newPrice - oldPrice) / oldPrice) * 100;
  const sign = diff > 0 ? "📈" : diff < 0 ? "📉" : "——";
  if (diff === 0) return "——";
  return `${sign} ${diff > 0 ? "+" : ""}${diff.toFixed(1)}%`;
}

export function formatPriceDiff(oldPrice: number, newPrice: number): string {
  const diff = newPrice - oldPrice;
  const sign = diff > 0 ? "+" : "";
  return `${sign}${formatPriceExact(diff)}`;
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}
