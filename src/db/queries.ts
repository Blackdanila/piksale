import { prisma } from "./prisma.js";

// --- Locations ---

export async function getLocations() {
  return prisma.location.findMany({ orderBy: { name: "asc" } });
}

// --- Blocks ---

export async function getBlocksByLocation(locationId: number) {
  return prisma.block.findMany({
    where: { locationId },
    orderBy: { name: "asc" },
  });
}

export async function getBlock(blockId: number) {
  return prisma.block.findUnique({ where: { id: blockId } });
}

export async function countFlatsByBlock(blockId: number) {
  return prisma.flat.count({ where: { blockId, status: "free" } });
}

export async function getMinPriceByBlock(blockId: number) {
  const result = await prisma.flat.aggregate({
    where: { blockId, status: "free" },
    _min: { currentPrice: true },
  });
  return result._min.currentPrice;
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

export async function getFlat(flatId: number) {
  return prisma.flat.findUnique({
    where: { id: flatId },
    include: { block: true },
  });
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
