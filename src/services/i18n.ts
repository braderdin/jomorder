// Start: Phase 59 - i18n Core (BM default + EN toggle)
// Fasal 5 (BM formal) + Fasal 6 (mobile UX). Pusat terjemahan untuk
// mesej sistem supaya BM/EN boleh ditukar ikut locale pengguna.
import { Lang } from './ui_helpers';

/** Kunci mesej sokongan. */
type MsgKey =
  | 'welcome'
  | 'menu_main'
  | 'shop_list'
  | 'cart_empty'
  | 'order_placed'
  | 'back';

const MESSAGES: Record<MsgKey, Record<Lang, string>> = {
  welcome: {
    BM: '🤖 Selamat datang ke JomOrder! Pilih peranan anda di bawah:',
    EN: '🤖 Welcome to JomOrder! Choose your role below:',
  },
  menu_main: {
    BM: '📱 Menu Utama JomOrder',
    EN: '📱 JomOrder Main Menu',
  },
  shop_list: {
    BM: '📋 SENARAI KEDAI AKTIF',
    EN: '📋 ACTIVE SHOP LIST',
  },
  cart_empty: {
    BM: '🛒 Troli anda kosong. Terokai kedai berdekatan!',
    EN: '🛒 Your cart is empty. Explore nearby shops!',
  },
  order_placed: {
    BM: '✅ Pesanan dihantar! Kami maklumkan status.',
    EN: '✅ Order sent! We will notify status.',
  },
  back: {
    BM: '⬅️ Kembali',
    EN: '⬅️ Back',
  },
};

/** Translate mesej ikut lang (default BM). */
export function i18n(key: MsgKey, lang: Lang = 'BM'): string {
  return MESSAGES[key]?.[lang] ?? MESSAGES[key]?.BM ?? key;
}

export type { MsgKey, Lang };
// End: Phase 59 - i18n Core