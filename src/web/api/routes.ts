import { Hono } from "hono";
import { prisma } from "../../db/prisma.js";

export const apiRoutes = new Hono();

// GET /api/v1/locations
apiRoutes.get("/locations", async (c) => {
  const locations = await prisma.location.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { blocks: true } } },
  });
  return c.json(locations);
});

// GET /api/v1/blocks?location_id=&page=&limit=
apiRoutes.get("/blocks", async (c) => {
  const locationId = c.req.query("location_id");
  const page = parseInt(c.req.query("page") ?? "1", 10);
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 100);

  const where: Record<string, unknown> = {};
  if (locationId) where.locationId = parseInt(locationId, 10);

  const [blocks, total] = await Promise.all([
    prisma.block.findMany({
      where,
      include: {
        location: true,
        _count: { select: { flats: true } },
      },
      orderBy: { name: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.block.count({ where }),
  ]);

  return c.json({ data: blocks, total, page, totalPages: Math.ceil(total / limit) });
});

// GET /api/v1/blocks/:id
apiRoutes.get("/blocks/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const block = await prisma.block.findUnique({
    where: { id },
    include: { location: true, _count: { select: { flats: true } } },
  });
  if (!block) return c.json({ error: "Not found" }, 404);
  return c.json(block);
});

// GET /api/v1/flats?block_id=&rooms=&price_min=&price_max=&area_min=&area_max=&page=&limit=
apiRoutes.get("/flats", async (c) => {
  const page = parseInt(c.req.query("page") ?? "1", 10);
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 100);

  const where: Record<string, unknown> = { status: "free" };

  const blockId = c.req.query("block_id");
  if (blockId) where.blockId = parseInt(blockId, 10);

  const rooms = c.req.query("rooms");
  if (rooms) where.rooms = parseInt(rooms, 10);

  const priceMin = c.req.query("price_min");
  const priceMax = c.req.query("price_max");
  if (priceMin || priceMax) {
    where.currentPrice = {
      ...(priceMin ? { gte: parseInt(priceMin, 10) } : {}),
      ...(priceMax ? { lte: parseInt(priceMax, 10) } : {}),
    };
  }

  const areaMin = c.req.query("area_min");
  const areaMax = c.req.query("area_max");
  if (areaMin || areaMax) {
    where.area = {
      ...(areaMin ? { gte: parseFloat(areaMin) } : {}),
      ...(areaMax ? { lte: parseFloat(areaMax) } : {}),
    };
  }

  const sortBy = c.req.query("sort") ?? "price_asc";
  const orderBy: Record<string, string> = {};
  if (sortBy === "price_asc") orderBy.currentPrice = "asc";
  else if (sortBy === "price_desc") orderBy.currentPrice = "desc";
  else if (sortBy === "area_asc") orderBy.area = "asc";
  else if (sortBy === "area_desc") orderBy.area = "desc";
  else orderBy.currentPrice = "asc";

  const [flats, total] = await Promise.all([
    prisma.flat.findMany({
      where,
      include: { block: true },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.flat.count({ where }),
  ]);

  return c.json({ data: flats, total, page, totalPages: Math.ceil(total / limit) });
});

// GET /api/v1/flats/:id
apiRoutes.get("/flats/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const flat = await prisma.flat.findUnique({
    where: { id },
    include: { block: { include: { location: true } } },
  });
  if (!flat) return c.json({ error: "Not found" }, 404);
  return c.json(flat);
});

// GET /api/v1/flats/:id/history?days=30
apiRoutes.get("/flats/:id/history", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const days = parseInt(c.req.query("days") ?? "30", 10);
  const since = new Date();
  since.setDate(since.getDate() - days);

  const history = await prisma.priceSnapshot.findMany({
    where: { flatId: id, date: { gte: since } },
    orderBy: { date: "desc" },
  });

  return c.json(history);
});

// GET /api/v1/blocks/:id/dynamics?days=30
apiRoutes.get("/blocks/:id/dynamics", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const days = parseInt(c.req.query("days") ?? "30", 10);
  const since = new Date();
  since.setDate(since.getDate() - days);

  const data = await prisma.blockDailyStats.findMany({
    where: { blockId: id, date: { gte: since } },
    orderBy: { date: "desc" },
  });

  return c.json(data);
});
