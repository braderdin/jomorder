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

// End: JomOrder Fasa 3 - Telegram API Utility Module
