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

// Start: Phase 38 - Incoming Update Telemetry Debugger (Fasal 7 S4 resilience)
// Rekam trace metrik tanpa throw supaya pipeline webhook tidak drop payload.
// Diambil dari index.ts untuk grid telemetry queue (ERROR/WARN/INFO only).
export function debugIncomingUpdate(
  env: Env,
  rawFrame: string,
  stage: 'pre-parse' | 'parsed-ok' | 'parse-failed',
  updateId?: number
): void {
  try {
    const len = rawFrame ? rawFrame.length : 0;
    const tag = updateId !== undefined ? `[upd:${updateId}]` : '[upd:?]';
    console.log(
      `[Phase38][telemetry]${tag} stage=${stage} bytes=${len} ts=${new Date().toISOString()}`
    );
  } catch {
    // Silent: debugger tidak boleh ganggu webhook path utama (Fasal 7 S4).
  }
}
// End: Phase 38 - Incoming Update Telemetry Debugger

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
