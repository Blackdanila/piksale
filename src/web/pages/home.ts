import { layout } from "../layout.js";
import type { SeoMeta } from "../layout.js";
import { prisma } from "../../db/prisma.js";
import { getHeaderStats } from "../stats.js";

export async function homePage(): Promise<string> {
  const flatCount = await prisma.flat.count({ where: { status: "free" } });

  // Only locations/blocks that have free flats
  const blocksWithFlats = await prisma.block.findMany({
    where: { flats: { some: { status: "free" } } },
    select: { id: true, locationId: true },
  });

  const blockCount = blocksWithFlats.length;
  const locationIdsWithFlats = [...new Set(blocksWithFlats.map((b) => b.locationId))];

  const locations = await prisma.location.findMany({
    where: { id: { in: locationIdsWithFlats } },
    orderBy: { name: "asc" },
  });

  const locationCount = locations.length;

  // Count blocks and min price per location
  const blockCountByLoc = new Map<number, number>();
  for (const b of blocksWithFlats) {
    blockCountByLoc.set(b.locationId, (blockCountByLoc.get(b.locationId) ?? 0) + 1);
  }

  const minPriceByLoc = new Map<number, number>();
  for (const loc of locations) {
    const agg = await prisma.flat.aggregate({
      where: { status: "free", block: { locationId: loc.id } },
      _min: { currentPrice: true },
    });
    if (agg._min.currentPrice) minPriceByLoc.set(loc.id, agg._min.currentPrice);
  }

  const locationCards = locations
    .map((loc) => {
      const minPrice = minPriceByLoc.get(loc.id);
      const priceStr = minPrice ? `от ${(minPrice / 1_000_000).toFixed(1)} млн ₽` : "";
      return `
      <a href="/blocks?location=${loc.id}" class="card" style="text-decoration:none;color:inherit">
        <div style="font-size:18px;font-weight:600">${loc.name}</div>
        <div style="color:var(--text-3);font-size:14px;margin-top:4px">${blockCountByLoc.get(loc.id) ?? 0} ЖК</div>
        ${priceStr ? `<div style="font-weight:600;font-size:14px;margin-top:8px;color:var(--text)">${priceStr}</div>` : ""}
      </a>`;
    })
    .join("");

  const stats = await getHeaderStats();

  const seo: SeoMeta = {
    description: "Мониторинг и аналитика цен на квартиры от застройщика ПИК. Динамика цен, сравнение ЖК, история изменений.",
    keywords: "ПИК, квартиры, цены, новостройки, мониторинг цен, динамика цен, застройщик",
    canonical: "https://piksale.ru/",
  };

  return layout(
    "Мониторинг цен ПИК",
    `
    <div style="text-align:center;padding:60px 0 40px">
      <h1 style="font-size:40px;font-weight:700;letter-spacing:-1px;margin-bottom:12px">
        Мониторинг цен <span style="color:var(--accent)">ПИК</span>
      </h1>
      <p style="color:var(--text-2);font-size:18px;max-width:500px;margin:0 auto">
        Отслеживайте динамику цен на квартиры застройщика ПИК в реальном времени
      </p>
    </div>

    <h2 class="page-title" style="font-size:22px;margin-top:0">Выберите город</h2>
    <div class="card-grid" style="margin-top:16px;margin-bottom:60px">
      ${locationCards || '<div class="empty"><div class="empty-icon">📭</div>Данные ещё не загружены</div>'}
    </div>
  `,
    "",
    stats,
    seo,
  );
}
