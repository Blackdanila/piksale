import { Keyboard, InlineKeyboard } from "grammy";

export const mainMenu = new Keyboard()
  .text("🏠 Мои ЖК")
  .text("🔍 Поиск")
  .row()
  .text("📊 Динамика")
  .text("⚙ Настройки")
  .resized()
  .persistent();

export function locationKeyboard(
  locations: Array<{ id: number; name: string }>,
  action: string,
) {
  const kb = new InlineKeyboard();
  for (let i = 0; i < locations.length; i++) {
    kb.text(locations[i].name, `${action}:loc:${locations[i].id}`);
    if ((i + 1) % 3 === 0) kb.row();
  }
  return kb;
}

export function blockListKeyboard(
  blocks: Array<{ id: number; name: string }>,
  action: string,
  page: number,
  totalPages: number,
) {
  const kb = new InlineKeyboard();

  blocks.forEach((block, i) => {
    kb.text(`${i + 1}`, `${action}:block:${block.id}`);
  });
  kb.row();

  if (totalPages > 1) {
    if (page > 1) kb.text("◀ Пред", `${action}:page:${page - 1}`);
    kb.text(`${page}/${totalPages}`, `noop`);
    if (page < totalPages) kb.text("След ▶", `${action}:page:${page + 1}`);
    kb.row();
  }

  kb.text("← Назад", `${action}:back`);
  return kb;
}

export function flatCardKeyboard(flatId: number, flatUrl?: string | null) {
  const kb = new InlineKeyboard()
    .text("📊 Цены", `flat:history:${flatId}`)
    .text("📐 План", `flat:plan:${flatId}`);

  if (flatUrl) {
    kb.url("🔗 pik.ru", `https://www.pik.ru${flatUrl}`);
  }

  return kb;
}

export function paginationKeyboard(
  action: string,
  page: number,
  totalPages: number,
  extra?: Array<{ text: string; data: string }>,
) {
  const kb = new InlineKeyboard();

  if (page > 1) kb.text("◀", `${action}:page:${page - 1}`);
  kb.text(`${page}/${totalPages}`, `noop`);
  if (page < totalPages) kb.text("▶", `${action}:page:${page + 1}`);

  if (extra) {
    kb.row();
    extra.forEach((btn) => kb.text(btn.text, btn.data));
  }

  return kb;
}

export function subscribeKeyboard(blockId: number, subscribed: boolean) {
  const kb = new InlineKeyboard();
  if (subscribed) {
    kb.text("🔕 Отписаться", `unsub:${blockId}`);
  } else {
    kb.text("🔔 Подписаться", `sub:${blockId}`);
  }
  return kb;
}

export function dynamicsPeriodKeyboard(blockId: number) {
  return new InlineKeyboard()
    .text("30 дн", `dyn:${blockId}:30`)
    .text("90 дн", `dyn:${blockId}:90`)
    .text("Всё время", `dyn:${blockId}:365`);
}
