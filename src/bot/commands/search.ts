import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { searchFlats, type FlatFilter } from "../../db/queries.js";
import { formatFlatListItem } from "../../formatters/flat-card.js";

// Hardcoded locations — they almost never change
const LOCATIONS = [
  { id: 2, name: "Москва и МО" },
  { id: 81, name: "СПб и ЛО" },
  { id: 83, name: "Екатеринбург" },
  { id: 84, name: "Тюмень" },
  { id: 52, name: "Владивосток" },
  { id: 49, name: "Хабаровск" },
  { id: 24, name: "Н. Новгород" },
  { id: 25, name: "Новороссийск" },
  { id: 27, name: "Ярославль" },
  { id: 22, name: "Обнинск" },
  { id: 91, name: "Южно-Сахалинск" },
  { id: 92, name: "Казань" },
  { id: 93, name: "Благовещенск" },
  { id: 94, name: "Улан-Удэ" },
];

// In-memory filter state per chat
const filterState = new Map<
  number,
  { filter: FlatFilter; step: string }
>();

export async function handleSearch(ctx: Context) {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  filterState.set(chatId, { filter: {}, step: "location" });

  const kb = new InlineKeyboard();
  for (let i = 0; i < LOCATIONS.length; i++) {
    kb.text(LOCATIONS[i].name, `search:loc:${LOCATIONS[i].id}`);
    if ((i + 1) % 3 === 0) kb.row();
  }

  const msg = "🔍 Выберите город для поиска:";
  if (ctx.callbackQuery) {
    await ctx.editMessageText(msg, { reply_markup: kb });
  } else {
    await ctx.reply(msg, { reply_markup: kb });
  }
}

export async function handleSearchLocationSelect(
  ctx: Context,
  locationId: number,
) {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const state = filterState.get(chatId) ?? { filter: {}, step: "rooms" };
  state.filter.locationId = locationId;
  state.step = "rooms";
  filterState.set(chatId, state);

  const kb = new InlineKeyboard()
    .text("Студия", "search:rooms:0")
    .text("1", "search:rooms:1")
    .text("2", "search:rooms:2")
    .row()
    .text("3", "search:rooms:3")
    .text("4+", "search:rooms:4")
    .text("Все", "search:rooms:any")
    .row()
    .text("← Назад", "search:back");

  await ctx.editMessageText("🛏 Количество комнат:", { reply_markup: kb });
}

export async function handleSearchRoomsSelect(
  ctx: Context,
  rooms: string,
) {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const state = filterState.get(chatId);
  if (!state) return;

  if (rooms !== "any") {
    state.filter.rooms = parseInt(rooms, 10);
  }
  state.step = "price";
  filterState.set(chatId, state);

  const kb = new InlineKeyboard()
    .text("до 10 млн", "search:price:0-10000000")
    .text("10-15 млн", "search:price:10000000-15000000")
    .row()
    .text("15-20 млн", "search:price:15000000-20000000")
    .text("20-30 млн", "search:price:20000000-30000000")
    .row()
    .text("30+ млн", "search:price:30000000-0")
    .text("Любая", "search:price:any")
    .row()
    .text("← Назад", "search:back:rooms");

  await ctx.editMessageText("💰 Бюджет:", { reply_markup: kb });
}

export async function handleSearchPriceSelect(
  ctx: Context,
  price: string,
) {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const state = filterState.get(chatId);
  if (!state) return;

  if (price !== "any") {
    const [min, max] = price.split("-").map(Number);
    if (min) state.filter.priceMin = min;
    if (max) state.filter.priceMax = max;
  }

  // Single DB query here
  await executeSearch(ctx, state.filter, 1);
}

export async function executeSearch(
  ctx: Context,
  filter: FlatFilter,
  page: number,
) {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const result = await searchFlats(filter, page, 5);

  if (result.total === 0) {
    const kb = new InlineKeyboard().text("🔄 Изменить фильтры", "search:restart");
    const text = "🔍 Ничего не найдено по заданным фильтрам.";
    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { reply_markup: kb });
    } else {
      await ctx.reply(text, { reply_markup: kb });
    }
    return;
  }

  const roomsLabel = filter.rooms !== undefined ? `${filter.rooms}-комн` : "все";
  const header = `🔍 Найдено ${result.total} кв. · ${roomsLabel}`;

  const flatLines = result.flats.map((flat, i) =>
    formatFlatListItem(flat, (page - 1) * 5 + i + 1),
  );

  const text = `${header}\n\n${flatLines.join("\n")}`;

  // Build inline keyboard for each flat
  const kb = new InlineKeyboard();
  result.flats.forEach((flat, i) => {
    kb.text(`${(page - 1) * 5 + i + 1}`, `flat:view:${flat.id}`);
  });
  kb.row();

  if (page > 1) kb.text("◀", `search:result:${page - 1}`);
  kb.text(`${page}/${result.totalPages}`, "noop");
  if (page < result.totalPages) kb.text("▶", `search:result:${page + 1}`);
  kb.row();
  kb.text("🔄 Фильтры", "search:restart");

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { reply_markup: kb });
  } else {
    await ctx.reply(text, { reply_markup: kb });
  }

  // Save filter state for pagination
  const state = filterState.get(chatId);
  if (state) {
    state.filter = filter;
    filterState.set(chatId, state);
  }
}

export async function handleSearchResultPage(ctx: Context, page: number) {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const state = filterState.get(chatId);
  if (!state) {
    await ctx.reply("Начните новый поиск");
    return;
  }

  await executeSearch(ctx, state.filter, page);
}

export { filterState };
