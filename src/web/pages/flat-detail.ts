import { layout } from "../layout.js";
import type { SeoMeta } from "../layout.js";
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
  const isGone = flat.status === "gone" || flat.status === "sold";

  // Effective price: benefitPrice if available, otherwise currentPrice
  const effectivePrice = flat.benefitPrice ?? flat.currentPrice;
  const effectiveMeter = flat.benefitMeterPrice ?? flat.meterPrice;
  const hasDiscount = flat.benefitPrice != null && flat.benefitPrice < flat.currentPrice;
  const discountPct = hasDiscount ? Math.round((1 - flat.benefitPrice! / flat.currentPrice) * 100) : 0;

  const historyRows = history
    .map((snap, i) => {
      const date = snap.date.toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        timeZone: "Europe/Moscow",
      });
      const snapEffective = snap.benefitPrice ?? snap.price;
      const snapMeter = snap.benefitMeterPrice ?? snap.meterPrice;
      const price = snapEffective.toLocaleString("ru-RU");
      const meter = snapMeter.toLocaleString("ru-RU");
      const snapHasDiscount = snap.benefitPrice != null && snap.benefitPrice < snap.price;

      let changeHtml = '<span class="price-same">——</span>';
      if (i < history.length - 1) {
        const prev = history[i + 1];
        const prevEffective = prev.benefitPrice ?? prev.price;
        if (snapEffective !== prevEffective) {
          const pct = (((snapEffective - prevEffective) / prevEffective) * 100).toFixed(1);
          const diff = snapEffective - prevEffective;
          const cls = diff > 0 ? "price-up" : "price-down";
          const sign = diff > 0 ? "+" : "";
          changeHtml = `<span class="${cls}">${sign}${pct}%</span>`;
        }
      }

      return `<tr>
        <td>${date}</td>
        <td style="text-align:right;font-weight:500">${price} ₽${snapHasDiscount ? ` <span style="text-decoration:line-through;color:var(--text-3);font-size:12px">${snap.price.toLocaleString("ru-RU")}</span>` : ""}</td>
        <td style="text-align:right;color:var(--text-2)">${meter} ₽/м²</td>
        <td style="text-align:right">${changeHtml}</td>
      </tr>`;
    })
    .join("");

  // Calculate overall trend (using effective prices)
  let trendHtml = "";
  if (history.length >= 2) {
    const newest = history[0];
    const oldest = history[history.length - 1];
    const newestEff = newest.benefitPrice ?? newest.price;
    const oldestEff = oldest.benefitPrice ?? oldest.price;
    const pct = (((newestEff - oldestEff) / oldestEff) * 100).toFixed(1);
    const diff = newestEff - oldestEff;
    const cls = diff > 0 ? "price-up" : diff < 0 ? "price-down" : "price-same";
    const sign = diff > 0 ? "+" : "";
    trendHtml = `<span class="${cls}" style="font-size:16px;font-weight:600">${sign}${pct}% за всё время</span>`;
  }

  const stats = await getHeaderStats();

  const seo: SeoMeta = {
    description: `${roomLabel} квартира ${flat.area}м² в ЖК ${flat.block.name}, ${flat.block.location.name}. ${flat.floor} этаж. Цена ${effectivePrice.toLocaleString("ru-RU")} ₽.`,
    keywords: `${flat.block.name}, ${roomLabel}, квартира, ПИК, ${flat.block.location.name}, планировка`,
    ogImage: flat.planRender ?? flat.block.imgUrl ?? undefined,
    canonical: `https://piksale.ru/flats/${flatId}`,
  };

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

    ${isGone ? `
    <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:var(--radius);padding:14px 18px;margin:20px 0;display:flex;align-items:center;gap:10px">
      <span style="font-size:20px">🚫</span>
      <div>
        <div style="font-weight:600;color:var(--red)">Нет в продаже</div>
        <div style="font-size:13px;color:var(--text-2)">Квартира больше не доступна — возможно, продана. Последняя известная цена: ${effectivePrice.toLocaleString("ru-RU")} ₽</div>
      </div>
    </div>` : ""}

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
        <div class="stat-value">${effectivePrice.toLocaleString("ru-RU")} ₽</div>
        ${hasDiscount ? `<div style="margin-top:4px"><span style="text-decoration:line-through;color:var(--text-3);font-size:13px">${flat.currentPrice.toLocaleString("ru-RU")} ₽</span> <span class="badge badge-green">-${discountPct}%</span></div>` : ""}
        <div class="stat-label">Цена</div>
      </div>
      <div class="stat">
        <div class="stat-value">${effectiveMeter.toLocaleString("ru-RU")} ₽</div>
        <div class="stat-label">Цена за м²</div>
      </div>
      ${flat.settlementDate ? `<div class="stat">
        <div class="stat-value">${new Date(flat.settlementDate).toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}</div>
        <div class="stat-label">Срок сдачи</div>
      </div>` : ""}
      ${flat.bulkName ? `<div class="stat">
        <div class="stat-value">${flat.bulkName}</div>
        <div class="stat-label">Корпус</div>
      </div>` : ""}
    </div>

    <div style="display:flex;align-items:center;gap:16px;margin:24px 0;flex-wrap:wrap">
      ${trendHtml}
      ${pikUrl ? `<a href="${pikUrl}" target="_blank" class="btn btn-ghost" style="margin-left:auto">🔗 Смотреть на pik.ru</a>` : ""}
    </div>

    ${flat.planRender || flat.planSvg ? `
    <h2 style="font-size:18px;font-weight:600;margin-bottom:12px">Планировка</h2>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px">
      ${flat.planRender ? `
      <div class="card" style="text-align:center;padding:12px;cursor:pointer" onclick="openPlan(this.querySelector('img').src)">
        <img src="${flat.planRender}" alt="3D планировка" style="width:160px;height:160px;object-fit:contain;border-radius:6px" loading="lazy">
        <div style="color:var(--text-3);font-size:11px;margin-top:6px">3D-рендер</div>
      </div>` : ""}
      ${flat.planSvg ? `
      <div class="card" style="text-align:center;padding:12px;cursor:pointer" onclick="openPlan(this.querySelector('img').src)">
        <img src="${flat.planSvg}" alt="Планировка" style="width:160px;height:160px;object-fit:contain;border-radius:6px;background:#fff" loading="lazy">
        <div style="color:var(--text-3);font-size:11px;margin-top:6px">Схема</div>
      </div>` : ""}
    </div>

    <!-- Lightbox -->
    <div id="planLightbox" onclick="this.style.display='none'" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:1000;cursor:pointer;display:none;align-items:center;justify-content:center">
      <img id="planLightboxImg" style="max-width:90vw;max-height:90vh;border-radius:12px;background:#fff">
    </div>
    <script>
      function openPlan(src) {
        const lb = document.getElementById('planLightbox');
        document.getElementById('planLightboxImg').src = src;
        lb.style.display = 'flex';
      }
    </script>` : ""}

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
    seo,
  );
}
