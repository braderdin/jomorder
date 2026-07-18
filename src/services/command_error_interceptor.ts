// Start: Phase 40 - Catch-All Command Exception Interceptor (Fault-Tolerant Shell)
// Fasal 7 Strategy 4 (webhook resilience) + Fasal 5 (BM alert). Global fallback
// wrapper untuk tangkap runtime exception spike supaya bot tidak pernah mati
// senyap bila individu controller method drop. Setiap command dibalut shell
// ini; pada throw, hantar mesej "Sila cuba sebentar lagi" ke chat + log soft.

import { Env } from '../types';
import { sendMessage, escapeMarkdownV2 } from '../telegram';

/**
 * withCommandGuard
 * Balut sesuatu handler command dengan shell exception interceptor global.
 * @param env bindings worker
 * @param chatId id chat untuk hantar mesej fallback jika handler throw
 * @param commandLabel label arahan (untuk log diagnostic)
 * @param fn async handler sebenar
 * @returns hasil fn, atau undefined jika fn throw (fallback sudah dihantar)
 */
export async function withCommandGuard<T>(
  env: Env,
  chatId: number,
  commandLabel: string,
  fn: () => Promise<T>
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`[Phase40][Interceptor] ${commandLabel} throw:`, msg);
    try {
      await sendMessage(
        env,
        chatId,
        escapeMarkdownV2('⚠️ Arahan tidak dapat diproses buat sementara. Sila cuba sebentar lagi.')
      );
    } catch {
      // Jangan biarkan fallback send gagal block flow (Fasal 7 S4).
    }
    return undefined;
  }
}

/**
 * withSilentGuard
 * Sama seperti withCommandGuard tapi TIDAK hantar mesej ke chat (guna untuk
 * callback/inline handler di mana spinner sudah di-dismiss). Cuma log soft.
 */
export async function withSilentGuard<T>(
  commandLabel: string,
  fn: () => Promise<T>
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[Phase40][SilentGuard] ${commandLabel} throw:`, (err as Error).message);
    return undefined;
  }
}

// End: Phase 40 - Catch-All Command Exception Interceptor