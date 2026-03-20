import { prisma } from "./prisma.js";
import type { Location, Block } from "@prisma/client";

// --- Cache ---

const CACHE_TTL = 10 * 60_000; // 10 minutes

interface CacheEntry<T> { data: T; at: number }

const cache = {
  locations: null as CacheEntry<Location[]> | null,
  blocksByLoc: new Map<number, CacheEntry<Block[]>>(),
  blocks: new Map<number, CacheEntry<Block>>(),
  flatCounts: new Map<number, CacheEntry<number>>(),
  minPrices: new Map<number, CacheEntry<number | null>>(),
};

function isFresh<T>(entry: CacheEntry<T> | null | undefined): entry is CacheEntry<T> {
  return !!entry && Date.now() - entry.at < CACHE_TTL;
}

// --- Locations ---

export async function getLocations() {
  if (isFresh(cache.locations)) return cache.locations.data;
  const data = await prisma.location.findMany({ orderBy: { name: "asc" } });
  cache.locations = { data, at: Date.now() };
  return data;
}

// --- Blocks ---

export async function getBlocksByLocation(locationId: number) {
  const cached = cache.blocksByLoc.get(locationId);
  if (isFresh(cached)) return cached.data;
  const data = await prisma.block.findMany({
    where: { locationId },
    orderBy: { name: "asc" },
  });
  cache.blocksByLoc.set(locationId, { data, at: Date.now() });
  return data;
}

export async function getBlock(blockId: number) {
  const cached = cache.blocks.get(blockId);
  if (isFresh(cached)) return cached.data;
  const data = await prisma.block.findUnique({ where: { id: blockId } });
  if (data) cache.blocks.set(blockId, { data, at: Date.now() });
  return data;
}

export async function countFlatsByBlock(blockId: number) {
  const cached = cache.flatCounts.get(blockId);
  if (isFresh(cached)) return cached.data;
  const data = await prisma.flat.count({ where: { blockId, status: "free" } });
  cache.flatCounts.set(blockId, { data, at: Date.now() });
  return data;
}

export async function getMinPriceByBlock(blockId: number) {
  const cached = cache.minPrices.get(blockId);
  if (isFresh(cached)) return cached.data;
  const result = await prisma.flat.aggregate({
    where: { blockId, status: "free" },
    _min: { currentPrice: true },
  });
  const data = result._min.currentPrice;
  cache.minPrices.set(blockId, { data, at: Date.now() });
  return data;
}

// --- Flats ---


export interface FlatFilter {
  blockId?: number;
  locationId?: number;
  rooms?: number;
  areaMin?: number;
  areaMax?: number;
  priceMin?: number;
  priceMax?: number;
  floorMin?: number;
  floorMax?: number;
}

export async function searchFlats(filter: FlatFilter, page = 1, pageSize = 5) {
  const where: Record<string, unknown> = { status: "free" };

  if (filter.blockId) where.blockId = filter.blockId;
  if (filter.locationId) where.block = { locationId: filter.locationId };
  if (filter.rooms) where.rooms = filter.rooms;
  if (filter.areaMin || filter.areaMax) {
    where.area = {
      ...(filter.areaMin ? { gte: filter.areaMin } : {}),
      ...(filter.areaMax ? { lte: filter.areaMax } : {}),
    };
  }
  if (filter.priceMin || filter.priceMax) {
    where.currentPrice = {
      ...(filter.priceMin ? { gte: filter.priceMin } : {}),
      ...(filter.priceMax ? { lte: filter.priceMax } : {}),
    };
  }
  if (filter.floorMin || filter.floorMax) {
    where.floor = {
      ...(filter.floorMin ? { gte: filter.floorMin } : {}),
      ...(filter.floorMax ? { lte: filter.floorMax } : {}),
    };
  }

  const [flats, total] = await Promise.all([
    prisma.flat.findMany({
      where,
      include: { block: true },
      orderBy: { currentPrice: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.flat.count({ where }),
  ]);

  return { flats, total, page, totalPages: Math.ceil(total / pageSize) };
}

type FlatWithBlock = NonNullable<Awaited<ReturnType<typeof _getFlatRaw>>>;

async function _getFlatRaw(flatId: number) {
  return prisma.flat.findUnique({
    where: { id: flatId },
    include: { block: true },
  });
}

const flatCache = new Map<number, CacheEntry<FlatWithBlock>>();

export async function getFlat(flatId: number) {
  const cached = flatCache.get(flatId);
  if (isFresh(cached)) return cached.data;
  const data = await _getFlatRaw(flatId);
  if (data) flatCache.set(flatId, { data, at: Date.now() });
  return data;
}

// --- Price Snapshots ---

export async function getPriceHistory(flatId: number, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  return prisma.priceSnapshot.findMany({
    where: { flatId, date: { gte: since } },
    orderBy: { date: "desc" },
  });
}

export async function getBlockAvgPriceHistory(blockId: number, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const snapshots = await prisma.$queryRaw<
    Array<{ date: string; avg_price: number; avg_meter_price: number }>
  >`
    SELECT
      DATE(date) as date,
      AVG("meterPrice")::int as avg_meter_price,
      AVG(price)::int as avg_price
    FROM "PriceSnapshot" ps
    JOIN "Flat" f ON f.id = ps."flatId"
    WHERE f."blockId" = ${blockId}
      AND ps.date >= ${since}
    GROUP BY DATE(date)
    ORDER BY date DESC
  `;

  return snapshots;
}

// --- Subscriptions ---

export async function addSubscription(chatId: bigint, blockId: number, rooms?: number) {
  return prisma.subscription.upsert({
    where: {
      chatId_blockId_rooms: { chatId, blockId, rooms: rooms ?? -1 },
    },
    update: {},
    create: { chatId, blockId, rooms: rooms ?? null },
  });
}

export async function removeSubscription(chatId: bigint, blockId: number, rooms?: number) {
  return prisma.subscription.deleteMany({
    where: { chatId, blockId, rooms: rooms ?? null },
  });
}

export async function getUserSubscriptions(chatId: bigint) {
  return prisma.subscription.findMany({
    where: { chatId },
    include: { block: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getSubscriptionsForBlock(blockId: number) {
  return prisma.subscription.findMany({
    where: { blockId },
  });
}
