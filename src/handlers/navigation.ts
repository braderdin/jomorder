// Start: Phase 55 - Navigation Layer (BACK button + breadcrumb)
// Fasal 6 (mobile max 2-3 btn/row) + Fasal 7 S2 (Redis state).
import { Env } from '../types';
import { getState, setState } from '../redis';

export type NavStage = 'idle' | 'customer_main' | 'merchant_main' | 'admin_main' | 'customer_browse' | 'customer_cart' | 'merchant_menu' | 'merchant_orders' | 'merchant_coupons' | 'merchant_settings';

const NAV_PREFIX = 'jo:nav:';

/** Simpan breadcrumb navigation penguna (disimpan dalam MerchantState.nav_stage). */
export async function setNav(env: Env, tgId: number, stage: NavStage): Promise<void> {
  const s = await getState(env, tgId);
  await setState(env, { ...(s as object), merchant_telegram_id: tgId, nav_stage: stage, last_active: new Date().toISOString() } as never);
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
// End: Phase 55 - Navigation Layer