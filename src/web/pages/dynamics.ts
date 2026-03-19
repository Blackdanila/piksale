import { layout } from "../layout.js";
import { prisma } from "../../db/prisma.js";
import type { BlockDailyStats } from "@prisma/client";

export async function dynamicsPage(
  blockId?: number,
  days = 30,
): Promise<string> {
  if (!blockId) {
    return dynamicsPickerPage();
  }

  const block = await prisma.block.findUnique({
    where: { id: blockId },
    include: { location: true },
  });

  if (!block) {
    return layout("Не найдено", `<div class="empty"><div class="empty-icon">🔍</div>ЖК не найден</div>`);
  }

  const since = new Date();
  since.setDate(since.getDate() - days);

  const data = await prisma.blockDailyStats.findMany({
    where: { blockId, date: { gte: since } },
    orderBy: { date: "desc" },
  });

  // Summary stats from latest day
  const latest = data[0];
  const oldest = data[data.length - 1];

  let summaryHtml = "";
  if (latest && oldest && data.length >= 2) {
    const priceDelta = latest.medianMeterPrice - oldest.medianMeterPrice;
    const pricePct = ((priceDelta / oldest.medianMeterPrice) * 100).toFixed(1);
    const supplyDelta = latest.totalFlats - oldest.totalFlats;
    const cls = priceDelta > 0 ? "price-up" : priceDelta < 0 ? "price-down" : "price-same";
    const sign = priceDelta > 0 ? "+" : "";

    summaryHtml = `
    <div class="stats">
      <div class="stat">
        <div class="stat-value">${latest.medianMeterPrice.toLocaleString("ru-RU")}</div>
        <div class="stat-label">Медиана ₽/м² сегодня</div>
      </div>
      <div class="stat">
        <div class="stat-value ${cls}">${sign}${pricePct}%</div>
        <div class="stat-label">Изменение за период</div>
      </div>
      <div class="stat">
        <div class="stat-value">${latest.totalFlats}</div>
        <div class="stat-label">Квартир в продаже</div>
      </div>
      <div class="stat">
        <div class="stat-value" style="color:${supplyDelta < 0 ? "var(--green)" : supplyDelta > 0 ? "var(--red)" : "var(--text-2)"}">${supplyDelta > 0 ? "+" : ""}${supplyDelta}</div>
        <div class="stat-label">Изм. предложения</div>
      </div>
      <div class="stat">
        <div class="stat-value">${latest.soldPercent.toFixed(1)}%</div>
        <div class="stat-label">Продано (${latest.soldCount} из ${latest.totalFlatsAll})</div>
      </div>
    </div>`;
  }

  // Main price table
  const priceRows = data
    .map((row, i) => {
      const date = row.date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });

      let meterChangeHtml = '<span class="price-same">——</span>';
      if (i < data.length - 1) {
        const prev = data[i + 1];
        if (row.medianMeterPrice !== prev.medianMeterPrice) {
          const pct = (((row.medianMeterPrice - prev.medianMeterPrice) / prev.medianMeterPrice) * 100).toFixed(1);
          const cls = row.medianMeterPrice > prev.medianMeterPrice ? "price-up" : "price-down";
          const s = row.medianMeterPrice > prev.medianMeterPrice ? "+" : "";
          meterChangeHtml = `<span class="${cls}">${s}${pct}%</span>`;
        }
      }

      return `<tr>
        <td>${date}</td>
        <td style="text-align:right;font-weight:500">${row.medianPrice.toLocaleString("ru-RU")}</td>
        <td style="text-align:right">${row.medianMeterPrice.toLocaleString("ru-RU")}</td>
        <td style="text-align:right;color:var(--text-2)">${row.minPrice.toLocaleString("ru-RU")}</td>
        <td style="text-align:right;color:var(--text-2)">${row.maxPrice.toLocaleString("ru-RU")}</td>
        <td style="text-align:right">${meterChangeHtml}</td>
        <td style="text-align:right;color:var(--text-3)">${row.totalFlats}</td>
      </tr>`;
    })
    .join("");

  // Rooms breakdown table (latest day only)
  let roomsHtml = "";
  if (latest) {
    const roomRows = [
      { label: "Студии", count: latest.countStudio, avg: latest.avgPriceStudio },
      { label: "1-комн", count: latest.countR1, avg: latest.avgPriceR1 },
      { label: "2-комн", count: latest.countR2, avg: latest.avgPriceR2 },
      { label: "3-комн", count: latest.countR3, avg: latest.avgPriceR3 },
      { label: "4+ комн", count: latest.countR4plus, avg: latest.avgPriceR4plus },
    ]
      .filter((r) => r.count > 0)
      .map(
        (r) => `<tr>
        <td>${r.label}</td>
        <td style="text-align:right">${r.count}</td>
        <td style="text-align:right;font-weight:500">${r.avg ? (r.avg / 1_000_000).toFixed(1) + " млн" : "—"}</td>
      </tr>`,
      )
      .join("");

    roomsHtml = `
    <h2 style="font-size:16px;font-weight:600;margin:32px 0 12px">По комнатности</h2>
    <div class="table-wrap" style="max-width:400px">
      <table>
        <thead><tr><th>Тип</th><th style="text-align:right">Кол-во</th><th style="text-align:right">Ср. цена</th></tr></thead>
        <tbody>${roomRows}</tbody>
      </table>
    </div>`;
  }

  // Floor premium table (latest day only)
  let floorHtml = "";
  if (latest && (latest.avgMeterPriceLow || latest.avgMeterPriceMid || latest.avgMeterPriceHigh)) {
    const floorRows = [
      { label: "1–5 этаж", avg: latest.avgMeterPriceLow },
      { label: "6–15 этаж", avg: latest.avgMeterPriceMid },
      { label: "16+ этаж", avg: latest.avgMeterPriceHigh },
    ]
      .filter((r) => r.avg)
      .map((r) => {
        const base = latest.avgMeterPriceLow ?? latest.avgMeterPriceMid ?? 0;
        const premium = base && r.avg ? (((r.avg - base) / base) * 100).toFixed(1) : null;
        const premiumHtml = premium && parseFloat(premium) !== 0
          ? `<span class="${parseFloat(premium) > 0 ? "price-up" : "price-down"}">${parseFloat(premium) > 0 ? "+" : ""}${premium}%</span>`
          : '<span class="price-same">база</span>';
        return `<tr>
          <td>${r.label}</td>
          <td style="text-align:right;font-weight:500">${r.avg!.toLocaleString("ru-RU")} ₽/м²</td>
          <td style="text-align:right">${premiumHtml}</td>
        </tr>`;
      })
      .join("");

    floorHtml = `
    <h2 style="font-size:16px;font-weight:600;margin:32px 0 12px">Премия за этаж</h2>
    <div class="table-wrap" style="max-width:500px">
      <table>
        <thead><tr><th>Этажи</th><th style="text-align:right">Ср. ₽/м²</th><th style="text-align:right">Премия</th></tr></thead>
        <tbody>${floorRows}</tbody>
      </table>
    </div>`;
  }

  const periodBtns = [30, 90, 365]
    .map((d) => {
      const label = d === 365 ? "Год" : `${d} дн`;
      const cls = d === days ? "btn-primary" : "btn-ghost";
      return `<a href="/dynamics?block=${blockId}&days=${d}" class="btn ${cls}" style="font-size:13px;padding:6px 12px">${label}</a>`;
    })
    .join("");

  return layout(
    `Динамика · ${block.name}`,
    `
    <div class="breadcrumbs">
      <a href="/">Главная</a>
      <span class="sep">/</span>
      <a href="/blocks/${block.id}">${block.name}</a>
      <span class="sep">/</span>
      <span>Динамика</span>
    </div>

    <h1 class="page-title">📊 ${block.name}</h1>
    <p class="page-subtitle">${block.location.name} · аналитика цен</p>

    <div style="display:flex;gap:6px;margin:16px 0">
      ${periodBtns}
    </div>

    ${summaryHtml}

    ${
      data.length > 0
        ? `
    <h2 style="font-size:16px;font-weight:600;margin:24px 0 12px">История цен</h2>
    <div class="table-wrap">
      <table class="dynamics-table">
        <thead>
          <tr>
            <th>Дата</th>
            <th style="text-align:right">Медиана</th>
            <th style="text-align:right">₽/м² мед.</th>
            <th style="text-align:right">Мин.</th>
            <th style="text-align:right">Макс.</th>
            <th style="text-align:right">Изм.</th>
            <th style="text-align:right">Кв-р</th>
          </tr>
        </thead>
        <tbody>${priceRows}</tbody>
      </table>
    </div>`
        : '<div class="empty"><div class="empty-icon">📭</div>Нет данных за выбранный период</div>'
    }

    ${roomsHtml}
    ${floorHtml}
  `,
  );
}

async function dynamicsPickerPage(): Promise<string> {
  const locations = await prisma.location.findMany({
    orderBy: { name: "asc" },
    include: {
      blocks: {
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      },
    },
  });

  const sections = locations
    .filter((loc) => loc.blocks.length > 0)
    .map((loc) => {
      const blockLinks = loc.blocks
        .map(
          (b) =>
            `<a href="/dynamics?block=${b.id}" class="btn btn-ghost" style="font-size:13px;padding:6px 12px">${b.name}</a>`,
        )
        .join("");

      return `
      <div style="margin-bottom:24px">
        <h3 style="font-size:16px;font-weight:600;margin-bottom:8px">${loc.name}</h3>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${blockLinks}</div>
      </div>`;
    })
    .join("");

  return layout(
    "Динамика цен",
    `
    <h1 class="page-title">📊 Динамика цен</h1>
    <p class="page-subtitle">Выберите ЖК для просмотра</p>
    ${sections || '<div class="empty"><div class="empty-icon">📭</div>Данные ещё не загружены</div>'}
  `,
  );
}
