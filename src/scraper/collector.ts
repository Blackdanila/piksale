import { prisma } from "../db/prisma.js";
import { fetchLocations, fetchBlocks, fetchBlockImages, fetchBlockImageFromPage, fetchBulks, fetchFlats } from "./client.js";
import { computeAllDailyStats } from "./aggregator.js";
import type { PikFlat } from "./types.js";

interface PriceChange {
  flatId: number;
  blockId: number;
  oldPrice: number;
  newPrice: number;
  rooms: number | null;
}

function toSlug(name: string, id: number): string {
  return name
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, "-")
    .replace(/^-|-$/g, "") || `loc-${id}`;
}

export async function syncLocations() {
  console.log("Syncing locations...");
  const locations = await fetchLocations();

  for (const loc of locations) {
    const slug = loc.slug || toSlug(loc.name, loc.id);
    await prisma.location.upsert({
      where: { id: loc.id },
      update: { name: loc.name, slug },
      create: { id: loc.id, name: loc.name, slug },
    });
  }

  console.log(`Synced ${locations.length} locations`);
}

export async function syncBlocks() {
  console.log("Syncing blocks...");
  const [blocks, imageMap] = await Promise.all([
    fetchBlocks(),
    fetchBlockImages(),
  ]);

  console.log(`Fetched ${blocks.length} blocks, ${imageMap.size} images`);

  let count = 0;
  for (const block of blocks) {
    const location = await prisma.location.findUnique({
      where: { id: block.location_id },
    });
    if (!location) continue;

    const lat = block.latitude ?? block.lat ?? null;
    const lng = block.longitude ?? block.lng ?? null;
    const blockSlug = block.slug || toSlug(block.name, block.id);
    let imgUrl = imageMap.get(block.id) ?? block.image ?? null;

    // Fallback: scrape image from pik.ru page
    if (!imgUrl && block.url) {
      imgUrl = await fetchBlockImageFromPage(block.url);
    }

    await prisma.block.upsert({
      where: { id: block.id },
      update: {
        name: block.name,
        slug: blockSlug,
        address: block.address ?? null,
        imgUrl,
        lat,
        lng,
      },
      create: {
        id: block.id,
        name: block.name,
        slug: blockSlug,
        locationId: block.location_id,
        address: block.address ?? null,
        imgUrl,
        lat,
        lng,
      },
    });
    count++;
  }

  console.log(`Synced ${count} blocks`);
}

export async function syncFlatsForBlock(blockId: number): Promise<PriceChange[]> {
  const changes: PriceChange[] = [];

  // First get all bulks (buildings) for this block
  let bulks: Array<{ id: number; name?: string }>;
  try {
    bulks = await fetchBulks(blockId);
  } catch (err) {
    console.error(`Failed to fetch bulks for block ${blockId}:`, err);
    return changes;
  }

  if (!Array.isArray(bulks) || bulks.length === 0) return changes;

  // Fetch flats for each bulk
  const rawFlats: PikFlat[] = [];
  for (const bulk of bulks) {
    try {
      const flats = await fetchFlats(blockId, bulk.id);
      for (const f of flats) {
        f.bulk_id = bulk.id;
        f.bulk_name = f.bulk_name ?? bulk.name ?? String(bulk.id);
      }
      rawFlats.push(...flats);
    } catch (err) {
      console.error(`Failed to fetch flats for block ${blockId} bulk ${bulk.id}:`, err);
    }
    // Small delay between bulk requests
    await new Promise((r) => setTimeout(r, 50));
  }

  if (rawFlats.length === 0) return changes;

  for (const raw of rawFlats) {
    if (!raw.id || !raw.price) continue;

    const existing = await prisma.flat.findUnique({
      where: { id: raw.id },
    });

    const flatData = {
      blockId: raw.block_id ?? blockId,
      bulkId: raw.bulk_id ?? null,
      bulkName: raw.bulk_name ?? null,
      number: raw.number ?? null,
      rooms: typeof raw.rooms === "number" ? raw.rooms : (raw.rooms === "studio" ? 0 : parseInt(String(raw.rooms), 10) || 0),
      area: typeof raw.area === "number" ? raw.area : parseFloat(String(raw.area)) || 0,
      floor: typeof raw.floor === "number" ? raw.floor : parseInt(String(raw.floor), 10) || 0,
      status: raw.status ?? "free",
      currentPrice: raw.price,
      meterPrice: raw.meterPrice ?? raw.meter_price ?? 0,
      url: raw.url ?? null,
      planSvg: raw.layout?.flat_plan_svg ?? null,
      planRender: raw.layout?.flat_plan_render ?? null,
    };

    await prisma.flat.upsert({
      where: { id: raw.id },
      update: flatData,
      create: { id: raw.id, ...flatData },
    });

    // Record price snapshot if price changed or first time
    const shouldSnapshot =
      !existing || existing.currentPrice !== raw.price;

    if (shouldSnapshot) {
      await prisma.priceSnapshot.create({
        data: {
          flatId: raw.id,
          price: raw.price,
          meterPrice: raw.meterPrice ?? raw.meter_price ?? 0,
        },
      });

      if (existing && existing.currentPrice !== raw.price) {
        changes.push({
          flatId: raw.id,
          blockId,
          oldPrice: existing.currentPrice,
          newPrice: raw.price,
          rooms: raw.rooms ?? null,
        });
      }
    }
  }

  // Mark flats that disappeared from API as "gone" (likely sold)
  const apiIds = new Set(rawFlats.filter((f) => f.id).map((f) => f.id));
  const dbFlats = await prisma.flat.findMany({
    where: { blockId, status: { in: ["free", "reserve"] } },
    select: { id: true },
  });
  const goneIds = dbFlats.filter((f) => !apiIds.has(f.id)).map((f) => f.id);
  if (goneIds.length > 0) {
    await prisma.flat.updateMany({
      where: { id: { in: goneIds } },
      data: { status: "gone" },
    });
    console.log(`Marked ${goneIds.length} flats as gone in block ${blockId}`);
  }

  return changes;
}

export async function collectAll(): Promise<PriceChange[]> {
  console.log("Starting full data collection...");
  const startTime = Date.now();

  await syncLocations();
  await syncBlocks();

  const blocks = await prisma.block.findMany({ select: { id: true, name: true } });
  console.log(`Collecting flats for ${blocks.length} blocks...`);

  const allChanges: PriceChange[] = [];
  let processed = 0;

  for (const block of blocks) {
    const changes = await syncFlatsForBlock(block.id);
    allChanges.push(...changes);
    processed++;

    if (processed % 50 === 0) {
      console.log(`Progress: ${processed}/${blocks.length} blocks`);
    }

    // Rate limiting: small delay between requests
    await new Promise((r) => setTimeout(r, 100));
  }

  // Compute daily aggregates after all flats are synced
  await computeAllDailyStats();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `Collection complete in ${elapsed}s. ${processed} blocks, ${allChanges.length} price changes`,
  );

  return allChanges;
}

// Allow running standalone
if (process.argv[1]?.endsWith("collector.ts") || process.argv[1]?.endsWith("collector.js")) {
  collectAll()
    .then((changes) => {
      console.log(`Done. ${changes.length} price changes detected.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Collection failed:", err);
      process.exit(1);
    });
}
