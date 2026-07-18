// Start: Phase 40 - Webhook Retry Backoff Manager (Real-Time Edge Diagnostic)
// Fasal 7 Strategy 4 (webhook resilience) + Fasal 10 (webhook guard).
// Exponential backoff retry manager untuk selamatkan frame transmisi yang
// putus akibat Telegram server drop link sementara. Setiap percubaan balut
// dengan AbortSignal timeout supaya edge runtime tidak terhang.
// Fail-open: selepas maxRetries habis, return null (caller soft-fail 200).

import { Env } from '../types';

/** Konfigurasi backoff eksponen. */
const MAX_RETRIES = 4;
const BASE_DELAY_MS = 250;
const FETCH_TIMEOUT_MS = 8000;

/**
 * sleep
 * Helper rehat tak-synchronous antara percubaan (bypass timer freeze).
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * sendWithRetry
 * Hantar payload ke Telegram Bot API dengan exponential backoff.
 * @param env bindings worker (perlu TELEGRAM_BOT_TOKEN)
 * @param method contoh 'sendMessage' / 'answerCallbackQuery'
 * @param payload body JSON untuk method tersebut
 * @returns Response dari percubaan terakhir, atau null jika semua gagal.
 */
export async function sendWithRetry(
  env: Env,
  method: string,
  payload: Record<string, unknown>
): Promise<Response | null> {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;
  let lastResp: Response | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      // 2xx / 4xx (selain 429) tidak perlu retry: 4xx = payload error kekal.
      if (res.ok || (res.status >= 400 && res.status !== 429 && res.status !== 502 && res.status !== 503)) {
        return res;
      }
      lastResp = res;
    } catch {
      // Network drop / timeout -> layak retry.
      lastResp = null;
    }
    // Jangan rehat selepas percubaan terakhir.
    if (attempt < MAX_RETRIES) {
      const delay = BASE_DELAY_MS * 2 ** attempt;
      await sleep(delay);
    }
  }
  return lastResp;
}

/**
 * answerCallbackQueryWithRetry
 * Wrapper khusus untuk dismiss spinner callback (Fasal 6 UX) dengan retry.
 * Soft-fail: jika semua percubaan gagal, return false (tidak throw).
 */
export async function answerCallbackQueryWithRetry(
  env: Env,
  queryId: string,
  text?: string
): Promise<boolean> {
  const res = await sendWithRetry(env, 'answerCallbackQuery', {
    callback_query_id: queryId,
    text: text ?? '',
    cache_time: 0,
  });
  return res !== null && res.ok;
}

/**
 * captureRetryFailure
 * Log kegagalan retry ke diagnostic buffer (fail-open). Tidak block caller.
 */
export async function captureRetryFailure(
  env: Env,
  method: string,
  stage: string
): Promise<void> {
  try {
    // Diagnostic ringan: audit telemetry jika dbFetch ada (elak import cycle).
    const url = `${env.SUPABASE_URL}/rest/v1/audit_telemetry_health`;
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        component: 'webhook_retry_manager',
        status: 'RETRY_EXHAUSTED',
        detail_json: { method, stage },
      }),
    });
  } catch {
    // swallow - diagnostic bukan kritikal
  }
}

// End: Phase 40 - Webhook Retry Backoff Manager