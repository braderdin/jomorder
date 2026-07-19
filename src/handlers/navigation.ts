// Start: Phase 55 - Navigation Layer (BACK button + breadcrumb)
// Fasal 6 (mobile max 2-3 btn/row) + Fasal 7 S2 (Redis state).
import { Env } from '../types';
import { getState, mergeState } from '../redis';

export type NavStage = 'idle' | 'customer_main' | 'merchant_main' | 'admin_main' | 'customer_browse' | 'customer_cart' | 'merchant_menu' | 'merchant_orders' | 'merchant_coupons' | 'merchant_settings';

const NAV_PREFIX = 'jo:nav:';

/** Simpan breadcrumb navigation penguna (disimpan dalam MerchantState.nav_stage). */
export async function setNav(env: Env, tgId: number, stage: NavStage): Promise<void> {
  await mergeState(env, tgId, { nav_stage: stage } as never);
}

/** Baca breadcrumb semasa. */
export async function getNav(env: Env, tgId: number): Promise<NavStage> {
  const s = await getState(env, tgId);
  return ((s as { nav_stage?: NavStage })?.nav_stage as NavStage) || 'idle';
}

/** Keyboard utama 3-kolum (Peniaga / Pelanggan / Pentadbir) + BM/EN. */
export function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '🛒 Pelanggan', callback_data: 'nav:customer' },
        { text: '🏪 Peniaga', callback_data: 'nav:merchant' },
      ],
      [
        { text: '🛡️ Pentadbir', callback_data: 'nav:admin' },
        { text: '🌐 BM/EN', callback_data: 'nav:lang' },
      ],
      [{ text: 'ℹ️ Bantuan', callback_data: 'nav:help' }],
    ],
  };
}

/** Back button single-row inline. */
export function backButton(action: string) {
  return {
    inline_keyboard: [[{ text: '⬅️ Kembali', callback_data: action }]],
  };
}

/** Back + extra action row. */
export function backWith(actions: Array<{ text: string; cb: string }>, back = 'nav:main') {
  return {
    inline_keyboard: [
      actions.map((a) => ({ text: a.text, callback_data: a.cb })),
      [{ text: '⬅️ Kembali', callback_data: back }],
    ],
  };
}

/** Start: Phase 56 - Minigame button helper */
/** Butang buka minigame untuk disisip dalam grid pelanggan. */
export function minigameButton() {
  return { text: '🎮 Main', callback_data: 'open_minigame' };
}
/** End: Phase 56 - Minigame button helper */

// Start: Phase 58 - Nested BACK Chain (parentOf map)
// Setiap stage ada parent. Butang BACK nested kembali ke parent yang betul,
// bukan lompat terus ke nav:main (UX lebih mesra).
export const NAV_PARENT: Record<NavStage, NavStage> = {
  idle: 'idle',
  customer_main: 'idle',
  merchant_main: 'idle',
  admin_main: 'idle',
  customer_browse: 'customer_main',
  customer_cart: 'customer_main',
  merchant_menu: 'merchant_main',
  merchant_orders: 'merchant_main',
  merchant_coupons: 'merchant_main',
  merchant_settings: 'merchant_main',
};

/** Dapatkan parent stage untuk nested BACK. */
export function parentOf(stage: NavStage): NavStage {
  return NAV_PARENT[stage] || 'idle';
}

/** Callback data untuk BACK dari stage semasa. */
export function backToStage(stage: NavStage): string {
  const p = parentOf(stage);
  if (p === 'customer_main') return 'customer_gui';
  if (p === 'merchant_main') return 'merchant_gui';
  return 'nav:main';
}
// End: Phase 58 - Nested BACK Chain
// End: Phase 55 - Navigation Layer
