import { layout } from "../layout.js";
import { prisma } from "../../db/prisma.js";
import { locationIndicatorCompact, getLocationInfo } from "../components/location-indicator.js";
import { getHeaderStats } from "../stats.js";

const PAGE_SIZE = 24;

export async function blocksPage(
  locationId?: number,
  page = 1,
): Promise<string> {
  const where: Record<string, unknown> = {
    flats: { some: { status: "free" } },
  };
  if (locationId) where.locationId = locationId;

  const [blocks, total, locations, location] = await Promise.all([
    prisma.block.findMany({
      where,
      include: {
        location: true,
        _count: { select: { flats: { where: { status: "free" } } } },
      },
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.block.count({ where }),
    prisma.location.findMany({ orderBy: { name: "asc" } }),
    locationId
      ? prisma.location.findUnique({ where: { id: locationId } })
      : null,
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const title = location ? `ЖК в ${location.name}` : "Все ЖК";

  // Get min prices for each block
  const blockMinPrices = await Promise.all(
    blocks.map(async (b) => {
      const agg = await prisma.flat.aggregate({
        where: { blockId: b.id, status: "free" },
        _min: { currentPrice: true },
      });
      return { blockId: b.id, minPrice: agg._min.currentPrice };
    }),
  );
  const priceMap = new Map(blockMinPrices.map((p) => [p.blockId, p.minPrice]));

  const locationOptions = locations
    .map(
      (loc) =>
        `<option value="${loc.id}" ${loc.id === locationId ? "selected" : ""}>${loc.name}</option>`,
    )
    .join("");

  const blockCards = blocks
    .map((block) => {
      const minPrice = priceMap.get(block.id);
      const priceStr = minPrice
        ? `от ${(minPrice / 1_000_000).toFixed(1)} млн ₽`
        : "нет данных";
      const freeCount = block._count.flats;

      const locBadge = block.lat && block.lng
        ? (() => {
            const info = getLocationInfo(block.lat, block.lng);
            const cls = info.isInsideMkad ? "badge-green" : "badge-neutral";
            return `<span class="badge ${cls}" style="font-size:11px">${info.isInsideMkad ? "МКАД" : info.direction}</span>`;
          })()
        : "";

      return `
      <a href="/blocks/${block.id}" class="card" style="text-decoration:none;color:inherit;padding:0;overflow:hidden">
        ${block.imgUrl ? `<img src="${block.imgUrl}" alt="${block.name}" style="width:100%;height:140px;object-fit:cover;display:block" loading="lazy">` : `<div style="width:100%;height:140px;background:var(--surface-2);display:flex;align-items:center;justify-content:center;color:var(--text-3);font-size:32px">🏗</div>`}
        <div style="padding:14px 16px">
          <div style="display:flex;align-items:start;justify-content:space-between;gap:8px">
            <div>
              <div style="font-size:16px;font-weight:600">${block.name}</div>
              <div style="color:var(--text-3);font-size:13px;margin-top:2px">${block.location.name}</div>
            </div>
            ${locBadge}
          </div>
          ${block.address ? `<div style="color:var(--text-3);font-size:12px;margin-top:4px">${block.address}</div>` : ""}
          <div style="display:flex;justify-content:space-between;margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
            <span style="font-weight:600;font-size:14px">${priceStr}</span>
            <span style="color:var(--text-3);font-size:13px">${freeCount} кв.</span>
          </div>
        </div>
      </a>`;
    })
    .join("");

  const paginationHtml = buildPagination(page, totalPages, locationId);

  const stats = await getHeaderStats();
  return layout(
    title,
    `
    <div class="breadcrumbs">
      <a href="/">Главная</a>
      <span class="sep">/</span>
      ${location ? `<span>${location.name}</span>` : "<span>Все ЖК</span>"}
    </div>

    <h1 class="page-title">${title}</h1>
    <p class="page-subtitle">${total} жилых комплексов</p>

    <div class="filters">
      <div class="filter-group">
        <label>Город</label>
        <select onchange="filterByLocation(this.value)">
          <option value="">Все города</option>
          ${locationOptions}
        </select>
      </div>
    </div>

    <div class="card-grid">
      ${blockCards || '<div class="empty"><div class="empty-icon">🏗</div>Нет ЖК</div>'}
    </div>

    ${paginationHtml}

    <script>
      function filterByLocation(id) {
        window.location.href = id ? '/blocks?location=' + id : '/blocks';
      }
    </script>
  `,
    "",
    stats,
  );
}

function buildPagination(
  page: number,
  totalPages: number,
  locationId?: number,
): string {
  if (totalPages <= 1) return "";

  const base = locationId ? `/blocks?location=${locationId}&` : "/blocks?";
  const items: string[] = [];

  if (page > 1) {
    items.push(`<a href="${base}page=${page - 1}">←</a>`);
  }

  for (let i = 1; i <= totalPages; i++) {
    if (
      i === 1 ||
      i === totalPages ||
      (i >= page - 2 && i <= page + 2)
    ) {
      if (i === page) {
        items.push(`<span class="current">${i}</span>`);
      } else {
        items.push(`<a href="${base}page=${i}">${i}</a>`);
      }
    } else if (
      (i === page - 3 && i > 1) ||
      (i === page + 3 && i < totalPages)
    ) {
      items.push(`<span style="color:var(--text-3)">…</span>`);
    }
  }

  if (page < totalPages) {
    items.push(`<a href="${base}page=${page + 1}">→</a>`);
  }

  return `<div class="pagination">${items.join("")}</div>`;
}
