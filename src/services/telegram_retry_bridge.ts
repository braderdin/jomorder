// Start: Phase 59 - Telegram Retry Bridge (Wire sendMessage to backoff manager)
// Fasal 7 Strategy 4 (webhook resilience) + Phase 40 webhook_retry_manager.
// Semua keluarga sendMessage/sendPhoto mesti LULUS melalui exponential backoff
// supaya mesej tak hilang bila Telegram drop link sementara.
// Fail-open: jika retry manager gagal sepenuhnya, fallback ke fetch biasa (soft).
import { Env, TelegramApiResponse } from '../types';
import { sendWithRetry } from './webhook_retry_manager';

const TELEGRAM_API = 'https://api.telegram.org/bot';

/**
 * bridgeSendMessage
 * Hantar teks dengan retry backoff. Fallback fetch jika retry null.
 */
export async function bridgeSendMessage(
  env: Env,
  chatId: number,
  text: string,
  parseMode: string | undefined,
  replyMarkup?: object
): Promise<TelegramApiResponse> {
  const payload: Record<string, unknown> = { chat_id: chatId, text };
  if (parseMode) payload.parse_mode = parseMode;
  if (replyMarkup) payload.reply_markup = replyMarkup;

  const res = await sendWithRetry(env, 'sendMessage', payload);
  if (res && res.ok) return (await res.json()) as TelegramApiResponse;

  // Fail-open fallback (Phase 40 resilience).
  try {
    const direct = await fetch(`${TELEGRAM_API}${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return (await direct.json()) as TelegramApiResponse;
  } catch {
    return { ok: false, result: null } as unknown as TelegramApiResponse;
  }
}

/**
 * bridgeSendPhoto
 * Hantar foto dengan retry backoff. Fallback fetch jika retry null.
 */
export async function bridgeSendPhoto(
  env: Env,
  chatId: number,
  photo: string,
  caption?: string,
  replyMarkup?: object
): Promise<TelegramApiResponse> {
  const payload: Record<string, unknown> = { chat_id: chatId, photo };
  if (caption) payload.caption = caption;
  if (replyMarkup) payload.reply_markup = replyMarkup;

  const res = await sendWithRetry(env, 'sendPhoto', payload);
  if (res && res.ok) return (await res.json()) as TelegramApiResponse;

  try {
    const direct = await fetch(`${TELEGRAM_API}${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return (await direct.json()) as TelegramApiResponse;
  } catch {
    return { ok: false, result: null } as unknown as TelegramApiResponse;
  }
}
// End: Phase 59 - Telegram Retry Bridge