import { prisma } from "./prisma.js";
import type { Location, Block, Flat } from "@prisma/client";

// =============================================================
// Aggressive in-memory cache — data changes once a day
// =============================================================

const CACHE_TTL = 24 * 60 * 60_000; // 24 hours

interface CacheEntry<T> {
  data: T;
  at: number;
}

function isFresh<T>(e: CacheEntry<T> | null | undefined): e is CacheEntry<T> {
  return !!e && Date.now() - e.at < CACHE_TTL;
}

function cached<T>(store: { entry: CacheEntry<T> | null }, fetcher: () => Promise<T>): () => Promise<T> {
  return async () => {
    if (isFresh(store.entry)) return store.entry.data;
    const data = await fetcher();
    store.entry = { data, at: Date.now() };
    return data;
  };
}

// --- Singleton caches ---

const _locCache = { entry: null as CacheEntry<Location[]> | null };
export const getLocations = cached(_locCache, () =>
  prisma.location.findMany({ orderBy: { name: "asc" } }),
);

type BlockWithCount = Block & { _count?: { flats: number } };
const _allBlocksCache = { entry: null as CacheEntry<BlockWithCount[]> | null };

async function _fetchAllBlocks() {
  return prisma.block.findMany({
    include: { _count: { select: { flats: { where: { status: "free" } } } } },
    orderBy: { name: "asc" },
  });
}
const _getAllBlocks = cached(_allBlocksCache, _fetchAllBlocks);

export async function getBlocksByLocation(locationId: number) {
  const all = await _getAllBlocks();
  return all.filter((b) => b.locationId === locationId);
}

export async function getBlock(blockId: number) {
  const all = await _getAllBlocks();
  return all.find((b) => b.id === blockId) ?? null;
}

export async function countFlatsByBlock(blockId: number) {
  const all = await _getAllBlocks();
  const b = all.find((x) => x.id === blockId);
  return b?._count?.flats ?? 0;
}

// --- Min prices (batch-loaded) ---

const _minPricesCache = { entry: null as CacheEntry<Map<number, number>> | null };

async function _fetchMinPrices() {
  const rows = await prisma.$queryRaw<Array<{ blockId: number; min_price: bigint }>>`
    SELECT "blockId", MIN(COALESCE("benefitPrice", "currentPrice"))::bigint as min_price
    FROM "Flat"
    WHERE status = 'free' AND "currentPrice" > 0
    GROUP BY "blockId"
  `;
  const map = new Map<number, number>();
  for (const r of rows) map.set(r.blockId, Number(r.min_price));
  return map;
}
const _getMinPrices = cached(_minPricesCache, _fetchMinPrices);

export async function getMinPriceByBlock(blockId: number) {
  const map = await _getMinPrices();
  return map.get(blockId) ?? null;
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

// Search cache keyed by JSON of filter+page
const _searchCache = new Map<string, CacheEntry<{ flats: FlatWithBlockType[]; total: number; page: number; totalPages: number }>>();

type FlatWithBlockType = Flat & { block: Block };

export async function searchFlats(filter: FlatFilter, page = 1, pageSize = 5) {
  const key = JSON.stringify({ filter, page, pageSize });
  const c = _searchCache.get(key);
  if (isFresh(c)) return c.data;

  const where: Record<string, unknown> = { status: "free" };

  if (filter.blockId) where.blockId = filter.blockId;
  if (filter.locationId) {
    // Use cached block IDs instead of slow Prisma relation filter
    const blocks = await getBlocksByLocation(filter.locationId);
    where.blockId = { in: blocks.map((b) => b.id) };
  }
  if (filter.rooms !== undefined) where.rooms = filter.rooms;
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

  const result = { flats, total, page, totalPages: Math.ceil(total / pageSize) };
  _searchCache.set(key, { data: result, at: Date.now() });

  // Limit search cache size
  if (_searchCache.size > 500) {
    const oldest = [..._searchCache.entries()].sort((a, b) => a[1].at - b[1].at);
    for (let i = 0; i < 250; i++) _searchCache.delete(oldest[i][0]);
  }

  return result;
}

// --- Single flat ---

const _flatCache = new Map<number, CacheEntry<FlatWithBlockType>>();

export async function getFlat(flatId: number) {
  const c = _flatCache.get(flatId);
  if (isFresh(c)) return c.data;
  const data = await prisma.flat.findUnique({
    where: { id: flatId },
    include: { block: true },
  });
  if (data) _flatCache.set(flatId, { data, at: Date.now() });

  // Limit flat cache size
  if (_flatCache.size > 1000) {
    const oldest = [..._flatCache.entries()].sort((a, b) => a[1].at - b[1].at);
    for (let i = 0; i < 500; i++) _flatCache.delete(oldest[i][0]);
  }

  return data;
}

// --- Price Snapshots ---

const _historyCache = new Map<string, CacheEntry<unknown[]>>();

export async function getPriceHistory(flatId: number, days = 30) {
  const key = `${flatId}:${days}`;
  const c = _historyCache.get(key);
  if (isFresh(c)) return c.data as Awaited<ReturnType<typeof prisma.priceSnapshot.findMany>>;

  const since = new Date();
  since.setDate(since.getDate() - days);

  const data = await prisma.priceSnapshot.findMany({
    where: { flatId, date: { gte: since } },
    orderBy: { date: "desc" },
  });

  _historyCache.set(key, { data, at: Date.now() });
  return data;
}

const _blockHistoryCache = new Map<string, CacheEntry<Array<{ date: string; avg_price: number; avg_meter_price: number }>>>();

export async function getBlockAvgPriceHistory(blockId: number, days = 30) {
  const key = `${blockId}:${days}`;
  const c = _blockHistoryCache.get(key);
  if (isFresh(c)) return c.data;

  const since = new Date();
  since.setDate(since.getDate() - days);

  const data = await prisma.$queryRaw<
    Array<{ date: string; avg_price: number; avg_meter_price: number }>
  >`
    SELECT
      DATE(ps.date) as date,
      AVG(ps."meterPrice")::int as avg_meter_price,
      AVG(ps.price)::int as avg_price
    FROM "PriceSnapshot" ps
    JOIN "Flat" f ON f.id = ps."flatId"
    WHERE f."blockId" = ${blockId}
      AND ps.date >= ${since}
    GROUP BY DATE(ps.date)
    ORDER BY date DESC
  `;

  _blockHistoryCache.set(key, { data, at: Date.now() });
  return data;
}

// --- Subscriptions (not cached — user-specific, low volume) ---

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

// --- Cache control ---

export function invalidateAllCaches() {
  _locCache.entry = null;
  _allBlocksCache.entry = null;
  _minPricesCache.entry = null;
  _searchCache.clear();
  _flatCache.clear();
  _historyCache.clear();
  _blockHistoryCache.clear();
  console.log("All caches invalidated");
}

export async function warmupCache() {
  console.log("Warming up cache...");
  const t = Date.now();
  await Promise.all([
    getLocations(),
    _getAllBlocks(),
    _getMinPrices(),
  ]);
  console.log(`Cache warmed in ${Date.now() - t}ms`);
}
