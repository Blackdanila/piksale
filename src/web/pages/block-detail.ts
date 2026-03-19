import { layout } from "../layout.js";
import { prisma } from "../../db/prisma.js";
import { locationIndicator } from "../components/location-indicator.js";
import { getHeaderStats } from "../stats.js";

const PAGE_SIZE = 50;

export async function blockDetailPage(
  blockId: number,
  rooms?: number,
  sortBy = "price_asc",
  page = 1,
): Promise<string> {
  const block = await prisma.block.findUnique({
    where: { id: blockId },
    include: { location: true },
  });

  if (!block) {
    const stats = await getHeaderStats();
    return layout("Не найдено", `<div class="empty"><div class="empty-icon">🔍</div>ЖК не найден</div>`, "", stats);
  }

  const where: Record<string, unknown> = { blockId, status: "free" };
  if (rooms !== undefined) where.rooms = rooms;

  const orderBy: Record<string, string> = {};
  if (sortBy === "price_asc") orderBy.currentPrice = "asc";
  else if (sortBy === "price_desc") orderBy.currentPrice = "desc";
  else if (sortBy === "area_asc") orderBy.area = "asc";
  else if (sortBy === "area_desc") orderBy.area = "desc";
  else if (sortBy === "floor_asc") orderBy.floor = "asc";
  else orderBy.currentPrice = "asc";

  const [flats, total, priceStats, roomCounts, totalAllFlats, soldFlats] = await Promise.all([
    prisma.flat.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.flat.count({ where }),
    prisma.flat.aggregate({
      where: { blockId, status: "free" },
      _min: { currentPrice: true },
      _max: { currentPrice: true },
      _avg: { meterPrice: true },
      _count: true,
    }),
    prisma.flat.groupBy({
      by: ["rooms"],
      where: { blockId, status: "free" },
      _count: true,
      orderBy: { rooms: "asc" },
    }),
    prisma.flat.count({ where: { blockId } }),
    prisma.flat.count({ where: { blockId, status: "sold" } }),
  ]);

  const soldPercent = totalAllFlats > 0 ? ((soldFlats / totalAllFlats) * 100).toFixed(1) : "0";

  const minPrice = priceStats._min.currentPrice;
  const maxPrice = priceStats._max.currentPrice;
  const avgMeter = priceStats._avg.meterPrice;

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const buildUrl = (params: Record<string, string | number | undefined>) => {
    const base = `/blocks/${blockId}`;
    const searchParams = new URLSearchParams();
    if (params.rooms !== undefined) searchParams.set("rooms", String(params.rooms));
    if (params.sort) searchParams.set("sort", String(params.sort));
    if (params.page && params.page !== 1) searchParams.set("page", String(params.page));
    const qs = searchParams.toString();
    return qs ? `${base}?${qs}` : base;
  };

  const roomTabs = [
    { label: "Все", value: undefined },
    ...roomCounts.map((r) => ({
      label: r.rooms === 0 ? "Студии" : `${r.rooms}-комн`,
      value: r.rooms,
      count: r._count,
    })),
  ];

  const roomTabsHtml = roomTabs
    .map((tab) => {
      const isActive = tab.value === rooms;
      const count = "count" in tab ? ` (${tab.count})` : "";
      const href = buildUrl({ rooms: tab.value, sort: sortBy });
      return `<a href="${href}" class="btn ${isActive ? "btn-primary" : "btn-ghost"}" style="font-size:13px;padding:6px 12px">${tab.label}${count}</a>`;
    })
    .join("");

  const sortOptions = [
    { value: "price_asc", label: "Цена ↑" },
    { value: "price_desc", label: "Цена ↓" },
    { value: "area_asc", label: "Площадь ↑" },
    { value: "area_desc", label: "Площадь ↓" },
    { value: "floor_asc", label: "Этаж ↑" },
  ]
    .map(
      (o) =>
        `<option value="${o.value}" ${o.value === sortBy ? "selected" : ""}>${o.label}</option>`,
    )
    .join("");

  const tableRows = flats
    .map((flat) => {
      const roomLabel = flat.rooms === 0 ? "Студия" : `${flat.rooms}-комн`;
      const price = flat.currentPrice.toLocaleString("ru-RU");
      const meterPrice = flat.meterPrice.toLocaleString("ru-RU");
      const pikUrl = flat.url?.startsWith("http") ? flat.url : flat.url ? `https://www.pik.ru${flat.url}` : null;
      const linkCell = pikUrl
        ? `<a href="${pikUrl}" target="_blank" rel="noopener" style="font-size:12px">pik.ru →</a>`
        : "";

      return `<tr>
        <td><a href="/flats/${flat.id}">${roomLabel}</a></td>
        <td>${flat.area} м²</td>
        <td>${flat.floor}</td>
        <td${flat.bulkName ? "" : ' style="color:var(--text-3)"'}>${flat.bulkName ?? "—"}</td>
        <td${flat.number ? "" : ' style="color:var(--text-3)"'}>${flat.number ?? "—"}</td>
        <td style="font-weight:600">${price} ₽</td>
        <td style="color:var(--text-2)">${meterPrice} ₽/м²</td>
        <td>${linkCell}</td>
      </tr>`;
    })
    .join("");

  const paginationHtml = buildDetailPagination(page, totalPages, blockId, rooms, sortBy);

  const stats = await getHeaderStats();
  return layout(
    block.name,
    `
    <div class="breadcrumbs">
      <a href="/">Главная</a>
      <span class="sep">/</span>
      <a href="/blocks?location=${block.locationId}">${block.location.name}</a>
      <span class="sep">/</span>
      <span>${block.name}</span>
    </div>

    <h1 class="page-title">${block.name}</h1>
    <p class="page-subtitle">
      ${block.location.name}${block.address ? ` · ${block.address}` : ""}
      · <a href="/dynamics?block=${blockId}">📊 Динамика цен</a>
    </p>

    ${locationIndicator(block.lat, block.lng)}

    <div class="stats" style="margin-top:20px">
      <div class="stat">
        <div class="stat-value">${priceStats._count}</div>
        <div class="stat-label">Квартир</div>
      </div>
      <div class="stat">
        <div class="stat-value">${minPrice ? (minPrice / 1_000_000).toFixed(1) + " млн" : "—"}</div>
        <div class="stat-label">Мин. цена</div>
      </div>
      <div class="stat">
        <div class="stat-value">${maxPrice ? (maxPrice / 1_000_000).toFixed(1) + " млн" : "—"}</div>
        <div class="stat-label">Макс. цена</div>
      </div>
      <div class="stat">
        <div class="stat-value">${avgMeter ? Math.round(avgMeter).toLocaleString("ru-RU") : "—"}</div>
        <div class="stat-label">Ср. цена за м²</div>
      </div>
      <div class="stat">
        <div class="stat-value">${soldPercent}%</div>
        <div class="stat-label">Продано (${soldFlats} из ${totalAllFlats})</div>
      </div>
    </div>

    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:20px 0">
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${roomTabsHtml}
      </div>
      <div style="margin-left:auto">
        <select onchange="changeSort(this.value)" style="min-width:100px">
          ${sortOptions}
        </select>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Тип</th>
            <th>Площадь</th>
            <th>Этаж</th>
            <th>Корпус</th>
            <th>Кв.</th>
            <th>Цена</th>
            <th>₽/м²</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${tableRows || '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-3)">Нет квартир</td></tr>'}
        </tbody>
      </table>
    </div>

    ${paginationHtml}

    <script>
      function changeSort(value) {
        const url = new URL(window.location);
        url.searchParams.set('sort', value);
        url.searchParams.delete('page');
        window.location.href = url.toString();
      }
    </script>
  `,
    "",
    stats,
  );
}

function buildDetailPagination(
  page: number,
  totalPages: number,
  blockId: number,
  rooms?: number,
  sortBy?: string,
): string {
  if (totalPages <= 1) return "";

  const buildUrl = (p: number) => {
    const params = new URLSearchParams();
    if (rooms !== undefined) params.set("rooms", String(rooms));
    if (sortBy) params.set("sort", sortBy);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/blocks/${blockId}${qs ? "?" + qs : ""}`;
  };

  const items: string[] = [];
  if (page > 1) items.push(`<a href="${buildUrl(page - 1)}">←</a>`);

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
      if (i === page) items.push(`<span class="current">${i}</span>`);
      else items.push(`<a href="${buildUrl(i)}">${i}</a>`);
    } else if ((i === page - 3 && i > 1) || (i === page + 3 && i < totalPages)) {
      items.push(`<span style="color:var(--text-3)">…</span>`);
    }
  }

  if (page < totalPages) items.push(`<a href="${buildUrl(page + 1)}">→</a>`);
  return `<div class="pagination">${items.join("")}</div>`;
}
