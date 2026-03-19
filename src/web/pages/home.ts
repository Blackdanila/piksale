import { layout } from "../layout.js";
import { prisma } from "../../db/prisma.js";

export async function homePage(): Promise<string> {
  const [locationCount, blockCount, flatCount] = await Promise.all([
    prisma.location.count(),
    prisma.block.count(),
    prisma.flat.count({ where: { status: "free" } }),
  ]);

  const locations = await prisma.location.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { blocks: true } } },
  });

  const locationCards = locations
    .map(
      (loc) => `
      <a href="/blocks?location=${loc.id}" class="card" style="text-decoration:none;color:inherit">
        <div style="font-size:18px;font-weight:600">${loc.name}</div>
        <div style="color:var(--text-3);font-size:14px;margin-top:4px">${loc._count.blocks} ЖК</div>
      </a>`,
    )
    .join("");

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

    <div class="stats">
      <div class="stat">
        <div class="stat-value">${locationCount}</div>
        <div class="stat-label">Городов</div>
      </div>
      <div class="stat">
        <div class="stat-value">${blockCount.toLocaleString("ru-RU")}</div>
        <div class="stat-label">Жилых комплексов</div>
      </div>
      <div class="stat">
        <div class="stat-value">${flatCount.toLocaleString("ru-RU")}</div>
        <div class="stat-label">Квартир в продаже</div>
      </div>
    </div>

    <h2 class="page-title" style="font-size:22px;margin-top:40px">Выберите город</h2>
    <div class="card-grid" style="margin-top:16px;margin-bottom:60px">
      ${locationCards || '<div class="empty"><div class="empty-icon">📭</div>Данные ещё не загружены</div>'}
    </div>
  `,
  );
}
