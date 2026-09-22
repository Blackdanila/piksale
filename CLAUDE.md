# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

PIKsale (https://piksale.ru) — daily price monitoring for apartments sold by the developer ПИК. One Node.js process runs three things: a Hono SSR website, a grammY Telegram bot (`@piksalebot`), and a node-cron scraper that pulls `api.pik.ru` once a day. PostgreSQL via Prisma. All user-facing text (web + bot) is Russian; code and commits are English.

## Commands

```bash
npm run dev                 # run src/index.ts with tsx (web + bot + scheduler)
npm run build               # tsc → dist/
npx tsc --noEmit            # type-check only (no test suite or linter exists)
npm run collect             # run the full scrape standalone (tsx src/scraper/collector.ts)
npx prisma generate         # regenerate client after editing prisma/schema.prisma
npx prisma db push          # apply schema to the DB
```

Docker (how production runs):

```bash
docker compose up -d --build                             # app on 127.0.0.1:3100 → container :3000
docker exec piksale-app node dist/scraper/collector.js   # force a collection
docker logs piksale-app --tail 50
```

Production lives at `/opt/piksale` on the server; deploy is `git pull && docker compose up -d --build` there. `.env` needs `BOT_TOKEN`. Setting `WEBHOOK_URL` switches the bot from long polling to webhook (`POST /bot/webhook`), but **production runs on long polling** — see "Telegram connectivity" below before turning the webhook back on. Changing `.env` requires recreating the container, not restarting it.

## Schema changes: there are no migrations

`prisma/migrations/` does not exist. The container's CMD runs `prisma db push --skip-generate --accept-data-loss` on every start, so the workflow is: edit `schema.prisma` → `npx prisma generate` → `npx prisma db push`. Don't introduce `prisma migrate` without also changing the Dockerfile CMD. Be careful with destructive schema edits — `--accept-data-loss` will apply them silently on deploy.

## Module conventions

`package.json` is `"type": "commonjs"` but tsconfig uses `module: NodeNext`, so **local imports must carry a `.js` extension** (`import { prisma } from "../db/prisma.js"`), even though the source is `.ts`. `tsx` handles this in dev; `tsc` output runs as-is in Docker.

## Architecture

### Startup (`src/index.ts`)

Order matters: the file first patches `dns.resolve4` to honor `/etc/hosts` (Node's `fetch`/undici bypasses it, which broke the `extra_hosts` pin of `api.telegram.org` in `docker-compose.yml`), then creates the bot with a **hardcoded `botInfo`** (avoids a `getMe` call at boot), mounts the webhook route, starts the cron scheduler, warms the cache, and finally listens. Don't remove the DNS patch or the `extra_hosts` entry — see below.

### Telegram connectivity — read before touching the bot's transport

Measured 2026-09-22, while diagnosing a bot that had been silent since 2026-09-01.

**Inbound (Telegram → server) does not work.** `getWebhookInfo` reported `"Connection timed out"` and nginx logged zero requests from Telegram across 14 days of history, with 80/443 open and no AAAA record. In webhook mode the bot depends entirely on this direction, so it goes silent while the site, the DB and the scheduler all keep working — the container stays up and `POST /bot/webhook` still answers 200 to anyone else. That is why `WEBHOOK_URL` is commented out in the server's `.env` (backup: `.env.bak.*` beside it) and the bot runs on long polling, which needs only the outbound path.

**Outbound works, but only via the pinned IP.** From inside the container `149.154.167.220` answered 3/3 at ~91ms, while `149.154.167.197`, `149.154.166.110`, `149.154.175.50`, `149.154.171.5` and `91.108.4.5` were 0/3. This is what the `extra_hosts` pin and the `dns.resolve4` patch exist for — removing either kills the bot.

**Even the working path is intermittent.** Individual requests hang for minutes and then fail with `ETIMEDOUT`. Any one-shot Telegram API call at startup therefore needs a deadline and a retry: a single timeout used to silently lose the result, which is how the native command menu ended up empty. See `withDeadline` and `setupBotMenu` in `src/bot/index.ts`, and the bounded `deleteWebhook` in `src/index.ts`.

**Diagnosing this:** `wget` and `nc` inside the container are busybox builds that lack proper TLS/SNI and report false timeouts — they sent this investigation down a wrong path twice. Measure only with a Node script using `https.request` plus `servername`. Host and container also differ: the host reaches addresses the container cannot.

### Data pipeline (`src/scraper/`, `src/scheduler.ts`)

Cron fires at `0 5 * * *` UTC (= 08:00 MSK). `collectAll()` runs sequentially:

1. `syncLocations` → `syncBlocks` (block images come from `/v2/filter`, falling back to scraping the pik.ru HTML page; an existing `imgUrl` is never overwritten with null).
2. `syncFlatsForBlock` per block: upsert every flat; write a `PriceSnapshot` only when `currentPrice` or `benefitPrice` changed (or the flat is new); flats present in the DB as `free`/`reserve` but missing from the API get `status = "gone"`.
3. `computeAllDailyStats` → one `BlockDailyStats` row per block per day (upsert on `[blockId, date]`).
4. `invalidateAllCaches()` + `warmupCache()`.
5. Back in the scheduler: price changes are grouped by block and pushed to `Subscription` chats (top 5 by % change per subscriber, optional `rooms` filter).

Domain rules embedded in this pipeline:
- **Effective price = `benefitPrice ?? currentPrice`.** Notifications and min-price queries use it; `currentPrice` is the undiscounted base.
- **Flat `status` values:** `free`, `reserve` (API sometimes sends `reserved`), `sold`, and our own `gone`. "Sold" counts everywhere mean `sold OR gone`. Price statistics use `free` flats only.
- **`rooms`:** `0` = studio; aggregates bucket `>= 4` as `4+`.
- **PIK location IDs are remapped** in `scraper/client.ts` (`3 → 2` Moscow region into Moscow, `86 → 81` Leningrad region into SPb). The bot's search wizard hardcodes the location list in `bot/commands/search.ts`; if locations change, update both.

### Two DB access paths — pick deliberately

- `src/db/queries.ts` — the cached layer (24h in-memory TTL, only invalidated by the collector). Used by the **bot** and **scheduler**. Any new cache added here must also be cleared in `invalidateAllCaches()` and ideally primed in `warmupCache()`.
- Direct `prisma` calls — used by **web pages** (`src/web/pages/*`) and the JSON API (`src/web/api/routes.ts`). These are uncached except `getHeaderStats()` (1-minute TTL). Heavy homepage queries use `$queryRaw`.

`db/queries.ts` deliberately avoids Prisma relation filters (`block: { locationId }`) in hot paths — they were slow; it filters by cached block-ID lists instead.

### Web (`src/web/`)

Pure server-rendered template strings, no client framework, no HTML-escaping helper. `layout(title, body, head, stats, seo)` in `layout.ts` wraps every page and carries all CSS inline (dark theme via CSS variables). Routes are wired in `server.ts`; each page module exports an `async fn(...) => string`. The JSON API under `/api/v1` mirrors the pages (locations, blocks, flats, flat history, block dynamics).

### Bot (`src/bot/`)

- All inline-button callbacks go through `callbacks.ts`, which routes on string prefixes: `proj:`, `search:`, `sub:`/`unsub:`, `dyn:`/`dynloc:`, `flat:view|history|plan:`. When adding a button, add its prefix there — three buttons once shipped with no handler at all, so after touching keyboards, check every generated `callback_data` against the router. The callback is answered immediately at the top of `handleCallback` (Telegram's timeout), so handlers should not rely on `answerCallbackQuery` for anything except toast text.
- The search wizard keeps per-chat state in an in-memory `Map` (`filterState`) — it is lost on restart, and handlers must tolerate a missing state.
- `editMessageText` calls are wrapped in `.catch(() => {})` because Telegram rejects "message is not modified"; keep that pattern.
- Message text formatting lives in `src/formatters/` (flat cards, price tables); keep the bot commands thin.
- Two menus must stay in sync in `keyboards.ts`: the `mainMenu` reply keyboard and `botCommands`, which `setupBotMenu` publishes to Telegram's native "Menu" button. A persistent reply keyboard lingers on the client until the user reopens `/start`, so keep `bot.hears` accepting the old labels when you rename a button.
- Screens reached from both a command and a "← Назад" button branch on `ctx.callbackQuery`: edit the message in that case, reply otherwise. Don't post a fresh message over an inline flow.
- Use `parse_mode: "HTML"`, not Markdown. Telegram's Markdown v1 takes `*one star*` for bold, so `**text**` renders the stars literally.

### Time zones

Cron is UTC; anything shown to users is formatted with `timeZone: "Europe/Moscow"`. `BlockDailyStats.date` is a `@db.Date` built from the server's local date at collection time.
