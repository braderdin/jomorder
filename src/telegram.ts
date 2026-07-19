// Start: JomOrder Fasa 3 - Telegram API Utility Module
// Fasal 6 (Escape MarkdownV2/HTML) + Fasal 4 (SOA)
import { Env, TelegramApiResponse, TelegramUpdate } from './types';

const TELEGRAM_API = 'https://api.telegram.org/bot';

/**
 * Sanitize string untuk elak Telegram parsing crash (Fasal 6).
 * Escape special chars: . - ! ( ) _ *
 */
export function escapeMarkdownV2(text: string): string {
  const specialChars = ['.', '-', '!', '(', ')', '_', '*'];
  let escaped = text;
  for (const ch of specialChars) {
    escaped = escaped.split(ch).join(`\\${ch}`);
  }
  return escaped;
}

/** Hantar mesej teks ke chat dengan parse_mode MarkdownV2 */
export async function sendMessage(
  env: Env,
  chatId: number,
  text: string,
  replyMarkup?: object
): Promise<TelegramApiResponse> {
  const url = `${TELEGRAM_API}${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: 'MarkdownV2',
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return (await res.json()) as TelegramApiResponse;
}

/** Hantar foto ke chat menggunakan Telegram Bot API sendPhoto. */
export async function sendPhoto(
  env: Env,
  chatId: number,
  photo: string,
  caption?: string
): Promise<TelegramApiResponse> {
  const url = `${TELEGRAM_API}${env.TELEGRAM_BOT_TOKEN}/sendPhoto`;
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    photo,
  };
  if (caption) {
    payload.caption = caption;
    payload.parse_mode = 'MarkdownV2';
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return (await res.json()) as TelegramApiResponse;
}

/** Template Custom Keyboard - Menu Peniaga (Fasal 6 mobile-optimized, max 2-3 btn/row) */
export function merchantMenuKeyboard() {
  return {
    keyboard: [
      [{ text: '💼 Menu Peniaga' }, { text: '📍 Lokasi' }],
      [{ text: '📦 Pesanan' }, { text: '⚙️ Tetapan' }],
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
  };
}

/** Template Custom Keyboard - Navigasi Pelanggan (Fasal 6 mobile-optimized) */
export function customerMenuKeyboard() {
  return {
    keyboard: [
      [{ text: '🍔 Lihat Menu' }, { text: '🛒 Troli' }],
      [{ text: '📍 Kedai Berdekatan' }, { text: '❓ Bantuan' }],
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
  };
}

// Start: Phase 53 - Customer Command Grid (30-command surfacing)
/** Custom keyboard pelanggan yang paparkan arahan natif utama (max 2 btn/row). */
export function customerCommandGrid() {
  return {
    keyboard: [
      [{ text: '📍 Cari Makan' }, { text: '🏪 Menu Kedai' }],
      [{ text: '🛒 Troli' }, { text: '🎟️ Promo' }],
      [{ text: '📖 Sejarah' }, { text: '👤 Profil' }],
      [{ text: '❓ Bantuan' }, { text: '📍 Bantuan Lokasi' }],
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
  };
}
// End: Phase 53 - Customer Command Grid

// Start: Phase 45 - Rich Dashboard Inline Helper (Fasal 6)
/** Inline keyboard papan pemerintah peniaga kaya (max 2 btn/row). */
export function merchantDashboardKeyboard(kedaiId: string, isBuka: boolean) {
  const toggleLabel = isBuka ? '🔴 Tutup Kedai' : '🟢 Buka Kedai';
  return inlineKeyboard([
    [{ text: toggleLabel, callback_data: `toggle_status:${kedaiId}` }, { text: '📊 Laporan', callback_data: 'merchant_report' }],
    [{ text: '📦 Pesanan', callback_data: 'merchant_orders' }, { text: '⚙️ Tetapan', callback_data: 'merchant_settings' }],
    [{ text: '➕ Menu', callback_data: 'merchant_menu' }, { text: '📈 Analitik', callback_data: 'merchant_analytics' }],
  ]);
}
// End: Phase 45 - Rich Dashboard Inline Helper

/** Template Inline Keyboard generik (max 2-3 btn/row) */
export function inlineKeyboard(buttons: Array<Array<{ text: string; callback_data: string }>>) {
  return { inline_keyboard: buttons };
}

// Start: Phase 52 - Merchant Dashboard V3 Grid Helper (Fasal 6 mobile-optimized)
/**
 * merchantDashboardKeyboardV3
 * Papan pemerintah peniaga versi 3 dengan grid 2 butang sebaris,
 * toggle_status diikuti kedaiId (router perlu id), tambah butang
 * Menu Kedai (/menu_kedai) dan Tetapan (/tetapan) quick deep-link.
 * Konsisten dengan Fasal 6 (mobile screen optimized, max 2 btn/row).
 */
export function merchantDashboardKeyboardV2(kedaiId?: string) {
  const toggleData = kedaiId ? `toggle_status:${kedaiId}` : 'toggle_status';
  return {
    inline_keyboard: [
      [{ text: '🟢 Buka/Tutup', callback_data: toggleData }, { text: '📊 Laporan', callback_data: 'merchant_report' }],
      [{ text: '📦 Pesanan', callback_data: 'merchant_orders' }, { text: '📋 Menu Kedai', callback_data: 'merchant_menu' }],
      [{ text: '⚙️ Tetapan', callback_data: 'merchant_settings' }, { text: '📈 Analitik', callback_data: 'merchant_analytics' }],
      [{ text: '📤 Muat Naik QR', callback_data: 'upload_qr' }, { text: '🆘 Lokasi', callback_data: 'help_lokasi' }],
    ],
  };
}
// End: Phase 52 - Merchant Dashboard V3 Grid Helper

/** Parse incoming webhook payload (Fasal 7 Strategy 4 soft-fail safe) */
export function parseUpdate(body: string): TelegramUpdate | null {
  try {
    return JSON.parse(body) as TelegramUpdate;
  } catch {
    return null;
  }
}

// Start: Phase 39 - Incoming Update Telemetry Debugger (Fasal 7 S4 resilience)
// Rekam trace metrik tanpa throw supaya pipeline webhook tidak drop payload.
// Phase 39: tambah tracer response pipeline untuk Bot API call latency grid.
export function debugIncomingUpdate(
  env: Env,
  rawFrame: string,
  stage: 'pre-parse' | 'parsed-ok' | 'parse-failed' | 'api-send',
  updateId?: number
): void {
  try {
    const len = rawFrame ? rawFrame.length : 0;
    const tag = updateId !== undefined ? `[upd:${updateId}]` : '[upd:?]';
    console.log(
      `[Phase39][telemetry]${tag} stage=${stage} bytes=${len} ts=${new Date().toISOString()}`
    );
  } catch {
    // Silent: debugger tidak boleh ganggu webhook path utama (Fasal 7 S4).
  }
}

/**
 * traceApiCall - rekam latency & status setiap panggilan ke Telegram Bot API.
 * Safe: tidak throw, hanya log. Digunakan dalam sendMessage/answerCallbackQuery.
 */
export async function traceApiCall<T>(
  env: Env,
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const ms = Date.now() - start;
    debugIncomingUpdate(env, `api=${label} ms=${ms}`, 'api-send');
    return result;
  } catch (err) {
    const ms = Date.now() - start;
    console.error(`[Phase39][api-trace] ${label} FAILED ms=${ms} err=${(err as Error).message}`);
    throw err;
  }
}
// End: Phase 39 - Incoming Update Telemetry Debugger

// Start: Phase 25 - Telegram Spinner Dismissal Helper (Fasal 6 inline grid UX)
// answerCallbackQuery: tutup loading spinner segera bila user tekan inline button.
export async function answerCallbackQuery(
  env: Env,
  queryId: string,
  text?: string,
  showAlert?: boolean
): Promise<TelegramApiResponse> {
  const url = `${TELEGRAM_API}${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`;
  const payload: Record<string, unknown> = { callback_query_id: queryId };
  if (text) payload.text = text;
  if (showAlert !== undefined) payload.show_alert = showAlert;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return (await res.json()) as TelegramApiResponse;
}
// End: Phase 25 - Telegram Spinner Dismissal Helper

// Start: Phase 47 - Help Deep-Link Builder (onboarding accelerator)
/**
 * buildHelpDeepLink
 * Hasilkan URL t.me deep-link yang terus buka kategori bantuan tertentu
 * bila ditekan. Contoh: buildHelpDeepLink('peniaga') ->
 * https://t.me/JomOrderBot?start=help_peniaga
 * Kategori: 'peniaga' | 'pelanggan' | 'pentadbir'
 */
export function buildHelpDeepLink(category: 'peniaga' | 'pelanggan' | 'pentadbir'): string {
  const bot = 'JomOrderBot';
  return `https://t.me/${bot}?start=help_${category}`;
}
// End: Phase 47 - Help Deep-Link Builder

/** Template Inline Keyboard - single BACK button row (Phase 55 navigation). */
export function backKeyboard(action: string, label = '⬅️ Kembali') {
  return { inline_keyboard: [[{ text: label, callback_data: action }]] };
}

/** Navigation grid: Main menu 3-column (Peniaga/Pelanggan/Pentadbir) + lang. */
export function navGrid() {
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

// End: JomOrder Fasa 3 - Telegram API Utility Module
