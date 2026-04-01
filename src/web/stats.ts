import { prisma } from "../db/prisma.js";
import type { HeaderStats } from "./layout.js";

let cachedStats: HeaderStats | null = null;
let cachedAt = 0;
const CACHE_TTL = 60_000; // 1 minute

export async function getHeaderStats(): Promise<HeaderStats> {
  const now = Date.now();
  if (cachedStats && now - cachedAt < CACHE_TTL) return cachedStats;

  const [locations, blocks, flats] = await Promise.all([
    prisma.location.count(),
    prisma.block.count(),
    prisma.flat.count({ where: { status: "free" } }),
  ]);

  // Get latest update time from any flat
  const latest = await prisma.flat.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });

  const updatedAt = latest
    ? latest.updatedAt.toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Moscow",
      })
    : "—";

  cachedStats = { locations, blocks, flats, updatedAt };
  cachedAt = now;
  return cachedStats;
}
