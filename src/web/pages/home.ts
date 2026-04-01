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

  // --- Price trend (overall avg ₽/m² by date) ---
  const trendData = await prisma.$queryRaw<
    Array<{ date: Date; avg_meter: bigint; total_flats: bigint }>
  >`
    SELECT date, AVG("avgMeterPrice")::bigint as avg_meter, SUM("totalFlats")::bigint as total_flats
    FROM "BlockDailyStats"
    WHERE "avgMeterPrice" > 0
    GROUP BY date
    ORDER BY date ASC
  `;

  let trendHtml = "";
  if (trendData.length >= 2) {
    const first = trendData[0];
    const last = trendData[trendData.length - 1];
    const firstPrice = Number(first.avg_meter);
    const lastPrice = Number(last.avg_meter);
    const pctChange = ((lastPrice - firstPrice) / firstPrice * 100).toFixed(1);
    const isUp = lastPrice > firstPrice;
    const trendCls = isUp ? "price-up" : "price-down";
    const trendSign = isUp ? "+" : "";
    const trendIcon = isUp ? "📈" : "📉";

    // Build ASCII-style chart using CSS bar chart
    const maxPrice = Math.max(...trendData.map((d) => Number(d.avg_meter)));
    const minPrice = Math.min(...trendData.map((d) => Number(d.avg_meter)));
    const range = maxPrice - minPrice || 1;

    const bars = trendData
      .map((d) => {
        const price = Number(d.avg_meter);
        const height = Math.max(8, Math.round(((price - minPrice) / range) * 80));
        const date = d.date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
        return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;min-width:30px">
          <div style="font-size:10px;color:var(--text-3)">${Math.round(price / 1000)}к</div>
          <div style="width:100%;max-width:40px;height:${height}px;background:${isUp ? "var(--red)" : "var(--green)"};border-radius:4px 4px 0 0;opacity:${0.4 + (price - minPrice) / range * 0.6}"></div>
          <div style="font-size:9px;color:var(--text-3)">${date}</div>
        </div>`;
      })
      .join("");

    trendHtml = `
    <div class="card" style="margin:32px 0">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-size:18px;font-weight:600">${trendIcon} Динамика цен ПИК</div>
          <div style="font-size:13px;color:var(--text-3)">Средняя цена за м² по всем ЖК</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:24px;font-weight:700">${lastPrice.toLocaleString("ru-RU")} ₽/м²</div>
          <span class="${trendCls}" style="font-size:14px;font-weight:600">${trendSign}${pctChange}%</span>
        </div>
      </div>
      <div style="display:flex;align-items:flex-end;gap:2px;height:110px;padding-top:10px">
        ${bars}
      </div>
    </div>`;
  } else if (trendData.length === 1) {
    const price = Number(trendData[0].avg_meter);
    trendHtml = `
    <div class="card" style="margin:32px 0">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-size:18px;font-weight:600">📊 Средняя цена ПИК</div>
          <div style="font-size:13px;color:var(--text-3)">Данные начали собираться — динамика появится через несколько дней</div>
        </div>
        <div style="font-size:24px;font-weight:700">${price.toLocaleString("ru-RU")} ₽/м²</div>
      </div>
    </div>`;
  }

  // --- Top price drops ---
  const drops = await prisma.$queryRaw<
    Array<{
      id: number;
      rooms: number;
      area: number;
      floor: number;
      current_price: number;
      first_price: number;
      pct_change: number;
      block_name: string;
      block_id: number;
    }>
  >`
    SELECT f.id, f.rooms, f.area, f.floor,
           f."currentPrice" as current_price,
           ps_first.price as first_price,
           ROUND((f."currentPrice" - ps_first.price)::numeric / ps_first.price * 100, 1) as pct_change,
           b.name as block_name, b.id as block_id
    FROM "Flat" f
    JOIN "Block" b ON b.id = f."blockId"
    JOIN "PriceSnapshot" ps_first ON ps_first."flatId" = f.id
      AND ps_first.id = (SELECT MIN(id) FROM "PriceSnapshot" WHERE "flatId" = f.id)
    WHERE f.status = 'free'
      AND f."currentPrice" < ps_first.price
    ORDER BY pct_change ASC
    LIMIT 5
  `;

  let dropsHtml = "";
  if (drops.length > 0) {
    const rows = drops
      .map((d) => {
        const roomLabel = d.rooms === 0 ? "Студия" : `${d.rooms}-комн`;
        return `<tr>
          <td><a href="/flats/${d.id}">${d.block_name}</a></td>
          <td>${roomLabel} · ${d.area}м²</td>
          <td>${d.floor} эт.</td>
          <td style="text-align:right;text-decoration:line-through;color:var(--text-3)">${(d.first_price / 1_000_000).toFixed(1)} млн</td>
          <td style="text-align:right;font-weight:600">${(d.current_price / 1_000_000).toFixed(1)} млн</td>
          <td style="text-align:right"><span class="price-down">${d.pct_change}%</span></td>
        </tr>`;
      })
      .join("");

    dropsHtml = `
    <h2 class="page-title" style="font-size:22px;margin-top:40px">🔥 Топ снижений цен</h2>
    <p class="page-subtitle">Квартиры с наибольшим падением цены</p>
    <div class="table-wrap" style="margin-bottom:32px">
      <table>
        <thead>
          <tr>
            <th>ЖК</th>
            <th>Квартира</th>
            <th>Этаж</th>
            <th style="text-align:right">Было</th>
            <th style="text-align:right">Стало</th>
            <th style="text-align:right">Изм.</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  } else {
    dropsHtml = `
    <h2 class="page-title" style="font-size:22px;margin-top:40px">🔥 Топ снижений цен</h2>
    <div class="card" style="text-align:center;padding:32px;color:var(--text-3);margin-bottom:32px">
      <div style="font-size:32px;margin-bottom:8px">📊</div>
      Снижений пока не зафиксировано. Данные обновляются ежедневно — следите за динамикой.
    </div>`;
  }

  // --- Sold yesterday ---
  const now = new Date();
  const mskOffset = 3 * 60 * 60 * 1000;
  const mskNow = new Date(now.getTime() + mskOffset);
  const mskTodayStart = new Date(Date.UTC(mskNow.getUTCFullYear(), mskNow.getUTCMonth(), mskNow.getUTCDate()) - mskOffset);
  const mskYesterdayStart = new Date(mskTodayStart.getTime() - 86400000);

  const soldYesterday = await prisma.flat.findMany({
    where: {
      status: "gone",
      updatedAt: { gte: mskYesterdayStart, lt: mskTodayStart },
    },
    include: { block: { select: { name: true, id: true } } },
    orderBy: { currentPrice: "desc" },
  });

  let soldHtml = "";
  if (soldYesterday.length > 0) {
    const soldRows = soldYesterday
      .map((f, i) => {
        const roomLabel = f.rooms === 0 ? "Студия" : `${f.rooms}-комн`;
        const hidden = i >= 10 ? ' class="sold-hidden" style="display:none"' : "";
        return `<tr${hidden}>
          <td><a href="/blocks/${f.block.id}">${f.block.name}</a></td>
          <td>${roomLabel} · ${f.area}м²</td>
          <td>${f.floor} эт.</td>
          <td style="text-align:right;font-weight:600">${(f.currentPrice / 1_000_000).toFixed(1)} млн ₽</td>
          <td style="text-align:right;color:var(--text-3)">${f.meterPrice.toLocaleString("ru-RU")} ₽/м²</td>
        </tr>`;
      })
      .join("");

    const showMoreBtn = soldYesterday.length > 10
      ? `<div style="text-align:center;padding:12px">
          <button class="btn btn-ghost" id="sold-more" onclick="document.querySelectorAll('.sold-hidden').forEach(r=>r.style.display='');this.remove()">
            Показать все ${soldYesterday.length}
          </button>
        </div>`
      : "";

    soldHtml = `
    <h2 class="page-title" style="font-size:22px;margin-top:40px">🏷️ Продано вчера <span style="font-size:16px;color:var(--text-3);font-weight:400">${soldYesterday.length} кв.</span></h2>
    <p class="page-subtitle">Квартиры, проданные за вчерашний день</p>
    <div class="table-wrap" style="margin-bottom:32px">
      <table>
        <thead>
          <tr>
            <th>ЖК</th>
            <th>Квартира</th>
            <th>Этаж</th>
            <th style="text-align:right">Цена</th>
            <th style="text-align:right">За м²</th>
          </tr>
        </thead>
        <tbody>${soldRows}</tbody>
      </table>
      ${showMoreBtn}
    </div>`;
  }

  // --- Top blocks by sales last week ---
  const mskWeekAgo = new Date(mskTodayStart.getTime() - 7 * 86400000);
  const topBlocks = await prisma.$queryRaw<
    Array<{ block_id: number; block_name: string; sold_count: bigint; avg_price: bigint; location_name: string }>
  >`
    SELECT f."blockId" as block_id, b.name as block_name, l.name as location_name,
           COUNT(*)::bigint as sold_count,
           AVG(f."currentPrice")::bigint as avg_price
    FROM "Flat" f
    JOIN "Block" b ON b.id = f."blockId"
    JOIN "Location" l ON l.id = b."locationId"
    WHERE f.status = 'gone'
      AND f."updatedAt" >= ${mskWeekAgo}
      AND f."updatedAt" < ${mskTodayStart}
    GROUP BY f."blockId", b.name, l.name
    ORDER BY sold_count DESC
    LIMIT 10
  `;

  let topBlocksHtml = "";
  if (topBlocks.length > 0) {
    const topRows = topBlocks
      .map((b, i) => {
        return `<tr>
          <td style="font-weight:600;color:var(--text-3)">${i + 1}</td>
          <td><a href="/blocks/${b.block_id}">${b.block_name}</a><span style="color:var(--text-3);font-size:12px;margin-left:6px">${b.location_name}</span></td>
          <td style="text-align:right;font-weight:600">${Number(b.sold_count)}</td>
          <td style="text-align:right;color:var(--text-2)">${(Number(b.avg_price) / 1_000_000).toFixed(1)} млн ₽</td>
        </tr>`;
      })
      .join("");

    topBlocksHtml = `
    <h2 class="page-title" style="font-size:22px;margin-top:40px">🏆 Топ ЖК по продажам за неделю</h2>
    <p class="page-subtitle">В каких ЖК продано больше всего квартир</p>
    <div class="table-wrap" style="margin-bottom:32px">
      <table>
        <thead>
          <tr>
            <th style="width:40px">#</th>
            <th>ЖК</th>
            <th style="text-align:right">Продано</th>
            <th style="text-align:right">Ср. цена</th>
          </tr>
        </thead>
        <tbody>${topRows}</tbody>
      </table>
    </div>`;
  }

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

    ${trendHtml}

    <h2 class="page-title" style="font-size:22px;margin-top:0">Выберите город</h2>
    <div class="card-grid" style="margin-top:16px">
      ${locationCards || '<div class="empty"><div class="empty-icon">📭</div>Данные ещё не загружены</div>'}
    </div>

    ${dropsHtml}

    ${topBlocksHtml}

    ${soldHtml}
  `,
    "",
    stats,
    seo,
  );
}
