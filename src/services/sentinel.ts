// Start: Phase 20 - Database Heartbeat Sentinel (Fasal 7 Strategy 4 soft-fail)
// Lightweight PostgREST/RPC health probe. Returns soft boolean instead of
// throwing, allowing graceful degradation without crashing the worker runtime.
import { Env } from '../types';

/** Hard ceiling untuk heartbeat round-trip sebelum kita isytihar DRIFT. */
const HEARTBEAT_TIMEOUT_MS = 5000;

/**
 * Laksanakan ping ringan ke Supabase via PostgREST RPC.
 * Menggunakan AbortController supaya tiada hang perpetually jika poolers lambat.
 * @returns true jika DB respon OK, false jika timeout / connection refuse / throw.
 */
export async function checkDatabaseHealth(env: Env): Promise<boolean> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    // Tiada kredensial -> anggap drift (jangan crash).
    return false;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEARTBEAT_TIMEOUT_MS);

  const url = `${env.SUPABASE_URL}/rest/v1/rpc/get_saas_metrics`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      // Signal abort supaya fetch putus jika melebihi timeout.
      signal: controller.signal,
    });
    // 2xx atau 401 (auth config) masih dikira capaian rangkaian wujud.
    return res.status < 500;
  } catch {
    // Timeout / network refuse / abort -> soft false (DRIFT_DETECTED).
    return false;
  } finally {
    clearTimeout(timer);
  }
}
// End: Phase 20 - Database Heartbeat Sentinel