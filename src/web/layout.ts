export interface HeaderStats {
  locations: number;
  blocks: number;
  flats: number;
  updatedAt: string;
}

export function layout(title: string, body: string, head = "", stats?: HeaderStats): string {
  const statsBar = stats ? `
  <div style="background:var(--surface);border-bottom:1px solid var(--border);padding:6px 0;font-size:12px;color:var(--text-3)">
    <div class="container" style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;justify-content:space-between">
      <div style="display:flex;gap:16px;flex-wrap:wrap">
        <span>${stats.locations} городов</span>
        <span>${stats.blocks} ЖК</span>
        <span>${stats.flats.toLocaleString("ru-RU")} квартир</span>
      </div>
      <span>Обновлено: ${stats.updatedAt}</span>
    </div>
  </div>` : "";
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — PIKsale</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #0a0a0b;
      --surface: #141416;
      --surface-2: #1c1c1f;
      --surface-3: #242428;
      --border: #2a2a2e;
      --text: #e4e4e7;
      --text-2: #a1a1aa;
      --text-3: #71717a;
      --accent: #3b82f6;
      --accent-hover: #2563eb;
      --green: #22c55e;
      --red: #ef4444;
      --yellow: #eab308;
      --radius: 10px;
    }

    body {
      font-family: 'Inter', -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    a { color: var(--accent); text-decoration: none; }
    a:hover { color: var(--accent-hover); }

    .container { max-width: 1200px; margin: 0 auto; padding: 0 20px; }

    /* Header */
    header {
      border-bottom: 1px solid var(--border);
      padding: 16px 0;
      position: sticky;
      top: 0;
      background: rgba(10, 10, 11, 0.85);
      backdrop-filter: blur(12px);
      z-index: 100;
    }
    .header-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .logo {
      font-size: 20px;
      font-weight: 700;
      color: var(--text);
      letter-spacing: -0.5px;
    }
    .logo span { color: var(--accent); }
    nav { display: flex; gap: 24px; }
    nav a {
      color: var(--text-2);
      font-size: 14px;
      font-weight: 500;
      transition: color 0.15s;
    }
    nav a:hover, nav a.active { color: var(--text); }

    /* Cards */
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
      transition: border-color 0.15s;
    }
    .card:hover { border-color: var(--text-3); }
    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 16px;
    }

    /* Tables */
    table { width: 100%; border-collapse: collapse; }
    th, td {
      padding: 10px 14px;
      text-align: left;
      border-bottom: 1px solid var(--border);
      font-size: 14px;
    }
    th {
      color: var(--text-3);
      font-weight: 500;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      background: var(--surface);
    }
    tr:hover td { background: var(--surface-2); }
    .table-wrap {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
    }

    /* Badges */
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
    }
    .badge-green { background: rgba(34,197,94,0.15); color: var(--green); }
    .badge-red { background: rgba(239,68,68,0.15); color: var(--red); }
    .badge-neutral { background: var(--surface-3); color: var(--text-2); }

    /* Filters */
    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      padding: 16px 0;
    }
    .filter-group { display: flex; flex-direction: column; gap: 4px; }
    .filter-group label {
      font-size: 11px;
      color: var(--text-3);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    select, input[type="number"] {
      background: var(--surface-2);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 14px;
      font-family: inherit;
      outline: none;
      min-width: 120px;
    }
    select:focus, input:focus { border-color: var(--accent); }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      font-family: inherit;
      cursor: pointer;
      border: none;
      transition: all 0.15s;
    }
    .btn-primary { background: var(--accent); color: #fff; }
    .btn-primary:hover { background: var(--accent-hover); }
    .btn-ghost { background: transparent; color: var(--text-2); border: 1px solid var(--border); }
    .btn-ghost:hover { background: var(--surface-2); color: var(--text); }

    /* Price change indicators */
    .price-up { color: var(--red); }
    .price-down { color: var(--green); }
    .price-same { color: var(--text-3); }

    /* Stats row */
    .stats {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      margin: 16px 0;
    }
    .stat {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px 20px;
      flex: 1;
      min-width: 140px;
    }
    .stat-value { font-size: 24px; font-weight: 700; }
    .stat-label { font-size: 12px; color: var(--text-3); margin-top: 2px; }

    /* Page */
    .page-title {
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.5px;
      margin: 32px 0 8px;
    }
    .page-subtitle { color: var(--text-2); margin-bottom: 24px; }

    /* Breadcrumbs */
    .breadcrumbs {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--text-3);
      margin-top: 20px;
    }
    .breadcrumbs a { color: var(--text-3); }
    .breadcrumbs a:hover { color: var(--text); }
    .breadcrumbs .sep { color: var(--border); }

    /* Pagination */
    .pagination {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 24px 0;
    }
    .pagination a, .pagination span {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
    }
    .pagination a {
      color: var(--text-2);
      border: 1px solid var(--border);
    }
    .pagination a:hover { background: var(--surface-2); color: var(--text); }
    .pagination .current {
      background: var(--accent);
      color: #fff;
      border: none;
    }

    /* Dynamics chart placeholder */
    .dynamics-table { font-variant-numeric: tabular-nums; }
    .dynamics-table td:nth-child(2),
    .dynamics-table td:nth-child(3) { text-align: right; }
    .dynamics-table th:nth-child(2),
    .dynamics-table th:nth-child(3) { text-align: right; }

    /* Responsive */
    @media (max-width: 640px) {
      .card-grid { grid-template-columns: 1fr; }
      .filters { flex-direction: column; }
      .stats { flex-direction: column; }
      nav { gap: 16px; }
      .page-title { font-size: 22px; }
      th, td { padding: 8px 10px; font-size: 13px; }
    }

    /* Loading */
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 60px;
      color: var(--text-3);
    }

    /* Empty state */
    .empty {
      text-align: center;
      padding: 60px 20px;
      color: var(--text-3);
    }
    .empty-icon { font-size: 48px; margin-bottom: 12px; }
  </style>
  ${head}
</head>
<body>
  ${statsBar}
  <header>
    <div class="container header-inner">
      <a href="/" class="logo">PIK<span>sale</span></a>
      <nav>
        <a href="/">Главная</a>
        <a href="/blocks">ЖК</a>
        <a href="/dynamics">Динамика</a>
        <a href="https://t.me/piksale_bot" target="_blank" style="color:var(--accent)">TG-бот</a>
      </nav>
    </div>
  </header>
  <main class="container">
    ${body}
  </main>
</body>
</html>`;
}
