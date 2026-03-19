import { prisma } from "../db/prisma.js";

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

function avgOrNull(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

export async function computeDailyStats(blockId: number, date: Date) {
  // All flats for sold stats
  const allFlats = await prisma.flat.findMany({
    where: { blockId },
    select: { currentPrice: true, meterPrice: true, rooms: true, floor: true, status: true },
  });

  if (allFlats.length === 0) return;

  const totalAll = allFlats.length;
  const soldCount = allFlats.filter((f) => f.status === "sold").length;
  const reservedCount = allFlats.filter((f) => f.status === "reserved").length;
  const soldPercent = totalAll > 0 ? (soldCount / totalAll) * 100 : 0;

  // Free flats only for price stats
  const flats = allFlats.filter((f) => f.status === "free");

  if (flats.length === 0) {
    // All sold/reserved — still save sold stats
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    await prisma.blockDailyStats.upsert({
      where: { blockId_date: { blockId, date: dateOnly } },
      update: { totalFlats: 0, totalFlatsAll: totalAll, soldCount, reservedCount, soldPercent },
      create: {
        blockId, date: dateOnly,
        totalFlats: 0, avgPrice: 0, medianPrice: 0, minPrice: 0, maxPrice: 0,
        avgMeterPrice: 0, medianMeterPrice: 0, minMeterPrice: 0, maxMeterPrice: 0,
        totalFlatsAll: totalAll, soldCount, reservedCount, soldPercent,
      },
    });
    return;
  }

  const prices = flats.map((f) => f.currentPrice).sort((a, b) => a - b);
  const meterPrices = flats.map((f) => f.meterPrice).sort((a, b) => a - b);

  // По комнатности
  const byRooms = new Map<number, number[]>();
  for (const f of flats) {
    const key = f.rooms >= 4 ? 4 : f.rooms;
    if (!byRooms.has(key)) byRooms.set(key, []);
    byRooms.get(key)!.push(f.currentPrice);
  }

  const countForRooms = (r: number) =>
    (byRooms.get(r) ?? []).length;
  const avgForRooms = (r: number) =>
    avgOrNull(byRooms.get(r) ?? []);

  // Премия за этаж
  const lowFloors = flats.filter((f) => f.floor <= 5).map((f) => f.meterPrice);
  const midFloors = flats.filter((f) => f.floor >= 6 && f.floor <= 15).map((f) => f.meterPrice);
  const highFloors = flats.filter((f) => f.floor >= 16).map((f) => f.meterPrice);

  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const statsData = {
    totalFlats: flats.length,
    avgPrice: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
    medianPrice: median(prices),
    minPrice: prices[0],
    maxPrice: prices[prices.length - 1],
    avgMeterPrice: Math.round(meterPrices.reduce((a, b) => a + b, 0) / meterPrices.length),
    medianMeterPrice: median(meterPrices),
    minMeterPrice: meterPrices[0],
    maxMeterPrice: meterPrices[meterPrices.length - 1],
    countStudio: countForRooms(0),
    countR1: countForRooms(1),
    countR2: countForRooms(2),
    countR3: countForRooms(3),
    countR4plus: countForRooms(4),
    avgPriceStudio: avgForRooms(0),
    avgPriceR1: avgForRooms(1),
    avgPriceR2: avgForRooms(2),
    avgPriceR3: avgForRooms(3),
    avgPriceR4plus: avgForRooms(4),
    avgMeterPriceLow: avgOrNull(lowFloors),
    avgMeterPriceMid: avgOrNull(midFloors),
    avgMeterPriceHigh: avgOrNull(highFloors),
    totalFlatsAll: totalAll,
    soldCount,
    reservedCount,
    soldPercent: Math.round(soldPercent * 100) / 100,
  };

  await prisma.blockDailyStats.upsert({
    where: { blockId_date: { blockId, date: dateOnly } },
    update: statsData,
    create: { blockId, date: dateOnly, ...statsData },
  });
}

export async function computeAllDailyStats() {
  console.log("Computing daily stats...");
  const today = new Date();
  const blocks = await prisma.block.findMany({ select: { id: true } });

  let computed = 0;
  for (const block of blocks) {
    await computeDailyStats(block.id, today);
    computed++;
    if (computed % 100 === 0) {
      console.log(`Stats progress: ${computed}/${blocks.length}`);
    }
  }

  console.log(`Computed daily stats for ${computed} blocks`);
}
