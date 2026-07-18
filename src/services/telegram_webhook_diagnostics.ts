// Start: Phase 39 - Raw Webhook Frame Diagnostic Engine (Fasal 7 S4 resilience)
// Modul bebas untuk capture, parse dan dump raw Telegram update tree bagi
// tujuan error isolation. Tidak boleh throw ke webhook utama (Fasal 7 S4).
import { Env } from '../types';

// Simpan cache ringkas dalam-memory untuk trace terakhir (ring buffer 50 entri).
// Ini elak kita perlu tulis ke DB pada setiap webhook call (perf + resilience).
const RECENT_FRAMES: Array<{ ts: string; bytes: number; head: string }> = [];
const MAX_FRAMES = 50;

/**
 * captureRawWebhookFrame - simpan salinan mentah payload sebelum parse/trim.
 * Selamat: semua exception ditelan supaya pipeline webhook tidak terhenti.
 */
export async function captureRawWebhookFrame(env: Env, rawBody: string): Promise<void> {
  try {
    const ts = new Date().toISOString();
    const bytes = rawBody ? rawBody.length : 0;
    // Ambil 200 char pertama sebagai head signature untuk log pantas.
    const head = rawBody ? rawBody.slice(0, 200) : '(empty)';
    RECENT_FRAMES.push({ ts, bytes, head });
    if (RECENT_FRAMES.length > MAX_FRAMES) RECENT_FRAMES.shift();

    // Cuba parse untuk pengesanan awal struktur update_id tanpa crash.
    let updateId: number | null = null;
    try {
      const parsed = JSON.parse(rawBody);
      updateId = typeof parsed?.update_id === 'number' ? parsed.update_id : null;
    } catch {
      updateId = null;
    }

    console.log(
      `[Phase39][diagnostic] captured raw frame bytes=${bytes} update_id=${updateId ?? '?'} ts=${ts}`
    );

    // Jika payload nampak corrupted (bukan JSON / tiada update_id), log amaran.
    if (updateId === null) {
      console.warn(
        `[Phase39][diagnostic][WARN] non-standard payload detected bytes=${bytes} head=${head}`
      );
    }
  } catch {
    // Silent: diagnostic tidak boleh ganggu webhook path utama (Fasal 7 S4).
  }
}

/**
 * peekRecentFrames - untuk kegunaan smoke test / debugging sahaja.
 * Return snapshot ring buffer tanpa mutation langsung.
 */
export function peekRecentFrames(): Array<{ ts: string; bytes: number; head: string }> {
  return RECENT_FRAMES.slice(-10);
}

/**
 * analyzeRawFrame - parse selamat untuk diagnostic tree dump.
 * Return struct JSON-friendly untuk dihantar ke admin debug tanpa crash.
 */
export function analyzeRawFrame(rawBody: string): {
  ok: boolean;
  updateId: number | null;
  keys: string[];
  bytes: number;
} {
  try {
    const parsed = JSON.parse(rawBody);
    const keys = Array.isArray(parsed) ? [] : Object.keys(parsed ?? {});
    return {
      ok: true,
      updateId: typeof parsed?.update_id === 'number' ? parsed.update_id : null,
      keys,
      bytes: rawBody ? rawBody.length : 0,
    };
  } catch {
    return { ok: false, updateId: null, keys: [], bytes: rawBody ? rawBody.length : 0 };
  }
}
// End: Phase 39 - Raw Webhook Frame Diagnostic Engine