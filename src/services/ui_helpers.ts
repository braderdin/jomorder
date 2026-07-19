// Start: Phase 55 - UI Helpers (RM format, emoji, BM/EN dict)
// Fasal 5 (BM formal) + Fasal 6 (mobile UX) + Fasal 7 S4 (soft-fail).
import { escapeMarkdownV2 } from '../telegram';

/** Format number ke "RM12.90". */
export function fmtRm(amount: number): string {
  const v = typeof amount === 'number' ? amount : Number(amount) || 0;
  return `RM${v.toFixed(2)}`;
}

/** Escape + wrap teks selamat untuk MarkdownV2. */
export function md(text: string): string {
  return escapeMarkdownV2(text);
}

/** BM/EN dictionary toggle (default BM). */
export type Lang = 'BM' | 'EN';
const DICT: Record<string, Record<Lang, string>> = {
  back: { BM: '⬅️ Kembali', EN: '⬅️ Back' },
  main_menu: { BM: '📱 Menu Utama', EN: '📱 Main Menu' },
  browse: { BM: '🛒 Lihat Kedai', EN: '🛒 Browse Shops' },
  cart: { BM: '🛒 Troli', EN: '🛒 Cart' },
  checkout: { BM: '💳 Bayar', EN: '💳 Pay' },
  rating: { BM: '⭐ Nilai', EN: '⭐ Rate' },
  settings: { BM: '⚙️ Tetapan', EN: '⚙️ Settings' },
  orders: { BM: '📋 Pesanan', EN: '📋 Orders' },
  coupons: { BM: '🏷️ Kupon', EN: '🏷️ Coupons' },
  menu: { BM: '🍽️ Menu', EN: '🍽️ Menu' },
};

/** Translate key ikut lang. */
export function t(key: string, lang: Lang = 'BM'): string {
  return DICT[key]?.[lang] ?? key;
}

/** Bina baris item menu untuk paparan. */
export function menuLine(name: string, price: number): string {
  return `${md(name)} - ${md(fmtRm(price))}`;
}

/** Star rating inline keyboard (1-5). */
export function starRatingKeyboard(orderId: number) {
  const row = [1, 2, 3, 4, 5].map((n) => ({
    text: '⭐'.repeat(n),
    callback_data: `rate:${orderId}:${n}`,
  }));
  return { inline_keyboard: [row] };
}

// Start: Phase 58 - Rich Menu Item Card Helper
/** Bina card item menu dengan emoji + harga RM + butang Add. */
export interface MenuItemView {
  id: string;
  nama: string;
  harga: number;
  gambarUrl?: string | null;
 kedaiId: string;
}

/** Caption MarkdownV2 untuk item menu (dengan harga RM). */
export function buildMenuItemCaption(item: MenuItemView): string {
  return (
    md(`🍴 ${item.nama}`) + '\n' +
    md(`Harga: ${fmtRm(item.harga)}`) + '\n' +
    md('Tekan ➕ untuk masukkan ke troli.')
  );
}

/** Inline keyboard dengan butang Add untuk item menu. */
export function menuItemAddKeyboard(item: MenuItemView) {
  return {
    inline_keyboard: [
      [{ text: '➕ Tambah', callback_data: `add_to_cart:${item.id}:${item.kedaiId}` }],
      [{ text: '⬅️ Kembali', callback_data: 'open_shops' }],
    ],
  };
}

/** Progress bar emoji untuk status pesanan. */
export function progressBar(stage: 'DITERIMA' | 'MEMASAK' | 'DIHANTAR' | 'SIAP'): string {
  const steps: Array<[string, string]> = [
    ['DITERIMA', '🟡'],
    ['MEMASAK', '🟢'],
    ['DIHANTAR', '🔵'],
    ['SIAP', '🟣'],
  ];
  const idx = steps.findIndex((s) => s[0] === stage);
  return steps.map((s, i) => (i <= idx ? s[1] : '⚪')).join(' ');
}

/** Empty-state card mesra (tiada item). */
export function emptyStateCard(title: string, hint: string, actionLabel: string, actionCb: string) {
  return {
    inline_keyboard: [
      [{ text: actionLabel, callback_data: actionCb }],
      [{ text: '⬅️ Kembali', callback_data: 'nav:main' }],
    ],
  };
}

/** Quick Reorder keyboard - 1-tap pesan semula troli lepas. */
export function reorderKeyboard(orderId: number, kedaiId: string) {
  return {
    inline_keyboard: [
      [{ text: '🔁 Pesan Lagi', callback_data: `reorder:${orderId}:${kedaiId}` }],
      [{ text: '⬅️ Kembali', callback_data: 'nav:main' }],
    ],
  };
}
// End: Phase 58 - Rich Menu Item Card Helper
// End: Phase 55 - UI Helpers
