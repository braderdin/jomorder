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
/** Prober generik ke URL PostgREST dengan AbortController timeout. */
async function probeUrl(env: Env, url: string, method: string): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEARTBEAT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      signal: controller.signal,
    });
    return res.status;
  } catch {
    // Timeout / network refuse / abort -> null (tiada capaian).
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkDatabaseHealth(env: Env): Promise<boolean> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    // Tiada kredensial -> anggap drift (jangan crash).
    return false;
  }

  // Stage 1: Primary analytical RPC probe.
  const rpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/get_saas_metrics`;
  const rpcStatus = await probeUrl(env, rpcUrl, 'POST');

  // Stage 2: Multi-stage fallback. Jika RPC >= 500 atau network null,
  // cuba base metadata ping ke '/' sebagai bukti DB layer masih hidup.
  if (rpcStatus === null || rpcStatus >= 500) {
    const baseUrl = `${env.SUPABASE_URL}/rest/v1/`;
    const baseStatus = await probeUrl(env, baseUrl, 'GET');
    // Base ping respon (walaupun 401 auth config) = DB layer alive.
    if (baseStatus !== null && baseStatus < 500) {
      return true;
    }
    return false;
  }

  // 2xx atau 401 (auth config) masih dikira capaian rangkaian wujud.
  return rpcStatus < 500;
}
// End: Phase 20 - Database Heartbeat Sentinel

// Start: Phase 21 - Sentinel Fallback Hardening (Fasal 7 Strategy 4 soft-fail)
// Multi-stage fallback: RPC analytical drift tidak lagi trigger false-alarm
// selagi base PostgREST metadata endpoint masih respon < 500.
// End: Phase 21 - Sentinel Fallback Hardening
