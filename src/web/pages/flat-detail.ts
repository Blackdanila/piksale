import { layout } from "../layout.js";
import { prisma } from "../../db/prisma.js";
import { getHeaderStats } from "../stats.js";

export async function flatDetailPage(flatId: number): Promise<string> {
  const flat = await prisma.flat.findUnique({
    where: { id: flatId },
    include: { block: { include: { location: true } } },
  });

  if (!flat) {
    const stats = await getHeaderStats();
    return layout("Не найдено", `<div class="empty"><div class="empty-icon">🔍</div>Квартира не найдена</div>`, "", stats);
  }

  const history = await prisma.priceSnapshot.findMany({
    where: { flatId },
    orderBy: { date: "desc" },
    take: 60,
  });

  const roomLabel = flat.rooms === 0 ? "Студия" : `${flat.rooms}-комн`;
  const pikUrl = flat.url?.startsWith("http") ? flat.url : flat.url ? `https://www.pik.ru${flat.url}` : null;

  const historyRows = history
    .map((snap, i) => {
      const date = snap.date.toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      });
      const price = snap.price.toLocaleString("ru-RU");
      const meter = snap.meterPrice.toLocaleString("ru-RU");

      let changeHtml = '<span class="price-same">——</span>';
      if (i < history.length - 1) {
        const prev = history[i + 1];
        if (snap.price !== prev.price) {
          const pct = (((snap.price - prev.price) / prev.price) * 100).toFixed(1);
          const diff = snap.price - prev.price;
          const cls = diff > 0 ? "price-up" : "price-down";
          const sign = diff > 0 ? "+" : "";
          changeHtml = `<span class="${cls}">${sign}${pct}%</span>`;
        }
      }

      return `<tr>
        <td>${date}</td>
        <td style="text-align:right;font-weight:500">${price} ₽</td>
        <td style="text-align:right;color:var(--text-2)">${meter} ₽/м²</td>
        <td style="text-align:right">${changeHtml}</td>
      </tr>`;
    })
    .join("");

  // Calculate overall trend
  let trendHtml = "";
  if (history.length >= 2) {
    const newest = history[0];
    const oldest = history[history.length - 1];
    const pct = (((newest.price - oldest.price) / oldest.price) * 100).toFixed(1);
    const diff = newest.price - oldest.price;
    const cls = diff > 0 ? "price-up" : diff < 0 ? "price-down" : "price-same";
    const sign = diff > 0 ? "+" : "";
    trendHtml = `<span class="${cls}" style="font-size:16px;font-weight:600">${sign}${pct}% за всё время</span>`;
  }

  const stats = await getHeaderStats();
  return layout(
    `${roomLabel} · ${flat.block.name}`,
    `
    <div class="breadcrumbs">
      <a href="/">Главная</a>
      <span class="sep">/</span>
      <a href="/blocks?location=${flat.block.locationId}">${flat.block.location.name}</a>
      <span class="sep">/</span>
      <a href="/blocks/${flat.blockId}">${flat.block.name}</a>
      <span class="sep">/</span>
      <span>Кв. ${flat.number ?? flat.id}</span>
    </div>

    <h1 class="page-title">${flat.block.name}</h1>
    <p class="page-subtitle">${flat.block.location.name}${flat.block.address ? ` · ${flat.block.address}` : ""}</p>

    <div class="stats">
      <div class="stat">
        <div class="stat-value">${roomLabel}</div>
        <div class="stat-label">Тип</div>
      </div>
      <div class="stat">
        <div class="stat-value">${flat.area} м²</div>
        <div class="stat-label">Площадь</div>
      </div>
      <div class="stat">
        <div class="stat-value">${flat.floor}</div>
        <div class="stat-label">Этаж</div>
      </div>
      <div class="stat">
        <div class="stat-value">${flat.currentPrice.toLocaleString("ru-RU")} ₽</div>
        <div class="stat-label">Текущая цена</div>
      </div>
      <div class="stat">
        <div class="stat-value">${flat.meterPrice.toLocaleString("ru-RU")} ₽</div>
        <div class="stat-label">Цена за м²</div>
      </div>
    </div>

    <div style="display:flex;align-items:center;gap:16px;margin:24px 0;flex-wrap:wrap">
      ${trendHtml}
      ${pikUrl ? `<a href="${pikUrl}" target="_blank" class="btn btn-ghost" style="margin-left:auto">🔗 Смотреть на pik.ru</a>` : ""}
    </div>

    ${flat.planRender || flat.planSvg ? `
    <h2 style="font-size:18px;font-weight:600;margin-bottom:12px">Планировка</h2>
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:24px">
      ${flat.planRender ? `
      <div class="card" style="flex:1;min-width:280px;text-align:center;padding:16px">
        <img src="${flat.planRender}" alt="3D планировка" style="max-width:100%;max-height:400px;border-radius:8px" loading="lazy">
        <div style="color:var(--text-3);font-size:12px;margin-top:8px">3D-рендер</div>
      </div>` : ""}
      ${flat.planSvg ? `
      <div class="card" style="flex:1;min-width:280px;text-align:center;padding:16px">
        <img src="${flat.planSvg}" alt="Планировка" style="max-width:100%;max-height:400px;border-radius:8px;background:#fff" loading="lazy">
        <div style="color:var(--text-3);font-size:12px;margin-top:8px">Схема</div>
      </div>` : ""}
    </div>` : ""}

    ${
      history.length > 0
        ? `
    <h2 style="font-size:18px;font-weight:600;margin-bottom:12px">История цен</h2>
    <div class="table-wrap">
      <table class="dynamics-table">
        <thead>
          <tr>
            <th>Дата</th>
            <th style="text-align:right">Цена</th>
            <th style="text-align:right">₽/м²</th>
            <th style="text-align:right">Изм.</th>
          </tr>
        </thead>
        <tbody>${historyRows}</tbody>
      </table>
    </div>`
        : '<div class="empty" style="margin-top:24px"><div class="empty-icon">📊</div>История цен пока недоступна</div>'
    }
  `,
    "",
    stats,
  );
}
