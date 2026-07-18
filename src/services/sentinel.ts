// Start: Phase 20 - Database Heartbeat Sentinel (Fasal 7 Strategy 4 soft-fail)
// Lightweight PostgREST/RPC health probe. Returns soft boolean instead of
// throwing, allowing graceful degradation without crashing the worker runtime.
import { Env, NetworkTelemetryStats, TelemetryAlertPayload } from '../types';
import { sendMessage, escapeMarkdownV2 } from '../telegram';

const TELEGRAM_API = 'https://api.telegram.org/bot';

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
// Start: Phase 35 - Drift Alert Dispatcher (Fasal 7 Strategy 4 + types NetworkTelemetryStats)
/** Ambang bilangan probe berturut-turut gagal sebelum amaran dihantar. */
const DRIFT_ALERT_THRESHOLD = 3;
let sustainedDriftStreak = 0;

/**
 * Bina sampel NetworkTelemetryStats dari hasil probe komponen.
 */
export function buildTelemetryStats(args: {
  upstream_latency_ms: number;
  db_status: NetworkTelemetryStats['db_status'];
  redis_status: NetworkTelemetryStats['redis_status'];
  telegram_status: NetworkTelemetryStats['telegram_status'];
  error_rate_pct?: number;
  active_connections?: number;
  worker_region?: string;
}): NetworkTelemetryStats {
  const anyDown =
    args.db_status === 'DOWN' || args.redis_status === 'DOWN' || args.telegram_status === 'DOWN';
  const anyDegraded =
    args.db_status === 'DEGRADED' || args.redis_status === 'DEGRADED' || args.telegram_status === 'DEGRADED';
  return {
    ts: new Date().toISOString(),
    worker_region: args.worker_region,
    upstream_latency_ms: args.upstream_latency_ms,
    db_status: args.db_status,
    redis_status: args.redis_status,
    telegram_status: args.telegram_status,
    drift_sustained: anyDown || (anyDegraded && sustainedDriftStreak >= DRIFT_ALERT_THRESHOLD),
    error_rate_pct: args.error_rate_pct ?? (anyDown ? 100 : anyDegraded ? 50 : 0),
    active_connections: args.active_connections ?? 0,
  };
}

/**
 * Hantar payload amaran selamat ke ADMIN_TELEGRAM_ID bila connection drift berterusan.
 * Menggunakan escapeMarkdownV2 untuk elak Telegram parse crash (Fasal 6).
 */
export async function dispatchDriftAlert(env: Env, stats: NetworkTelemetryStats): Promise<void> {
  const adminId = env.ADMIN_TELEGRAM_ID;
  if (!adminId) return; // Tiada admin -> jangan crash.

  const payload: TelemetryAlertPayload = {
    level: stats.db_status === 'DOWN' || stats.redis_status === 'DOWN' ? 'CRIT' : 'WARN',
    stats,
    message: `Drift berterusan dikesan. DB=${stats.db_status} Redis=${stats.redis_status} TG=${stats.telegram_status} lat=${stats.upstream_latency_ms}ms`,
  };

  const text =
    escapeMarkdownV2('🚨 AMARAN KESIHATAN JOMORDER\\n\\n') +
    escapeMarkdownV2(`Tahap: ${payload.level}\\n`) +
    escapeMarkdownV2(`DB: ${stats.db_status}\\n`) +
    escapeMarkdownV2(`Redis: ${stats.redis_status}\\n`) +
    escapeMarkdownV2(`Telegram: ${stats.telegram_status}\\n`) +
    escapeMarkdownV2(`Kelewatan: ${stats.upstream_latency_ms}ms\\n`) +
    escapeMarkdownV2(`Drift berterusan: ${stats.drift_sustained ? 'YA' : 'TIDAK'}`);

  await sendMessage(env, Number(adminId), text);
}

/**
 * Evaluasi drift & auto-dispatch alert jika streak melepasi ambang.
 * Panggil dari sentinel cron (index.ts) secara berkala.
 */
export async function evaluateConnectionDrift(env: Env, probe: {
  dbOk: boolean;
  redisOk: boolean;
  tgOk: boolean;
  latencyMs: number;
}): Promise<NetworkTelemetryStats> {
  const db_status = probe.dbOk ? 'OK' : 'DOWN';
  const redis_status = probe.redisOk ? 'OK' : 'DOWN';
  const telegram_status = probe.tgOk ? 'OK' : 'DOWN';

  const healthy = probe.dbOk && probe.redisOk && probe.tgOk;
  if (healthy) {
    sustainedDriftStreak = 0;
  } else {
    sustainedDriftStreak += 1;
  }

  const stats = buildTelemetryStats({
    upstream_latency_ms: probe.latencyMs,
    db_status,
    redis_status,
    telegram_status,
  });

  if (sustainedDriftStreak >= DRIFT_ALERT_THRESHOLD) {
    stats.drift_sustained = true;
    await dispatchDriftAlert(env, stats);
  }
  return stats;
}
// End: Phase 35 - Drift Alert Dispatcher

// Start: Phase 36 Sentinel Drift Alert
/** Ambang metrik untuk auto-dispatch alert ke ADMIN_TELEGRAM_ID. */
const ALERT_LATENCY_MS = 1500;
const ALERT_ERROR_RATE_PCT = 30;

/**
 * Evaluasi metrik telemetry mentah terhadap ambang.
 * Jika latency / error-rate / drift streak melepasi ambang, bina
 * NetworkTelemetryStats dan trigger dispatchDriftAlert ke admin.
 */
export async function evaluateTelemetryThresholds(env: Env, metrics: {
  latencyMs: number;
  errorRatePct: number;
  driftCount: number;
}): Promise<NetworkTelemetryStats> {
  const latencyBreach = metrics.latencyMs >= ALERT_LATENCY_MS;
  const errorBreach = metrics.errorRatePct >= ALERT_ERROR_RATE_PCT;
  const driftBreach = metrics.driftCount >= DRIFT_ALERT_THRESHOLD;

  const db_status = latencyBreach ? 'DEGRADED' : 'OK';
  const redis_status = errorBreach ? 'DEGRADED' : 'OK';
  const telegram_status = 'OK';

  const stats = buildTelemetryStats({
    upstream_latency_ms: metrics.latencyMs,
    db_status,
    redis_status,
    telegram_status,
    error_rate_pct: metrics.errorRatePct,
    active_connections: metrics.driftCount,
  });

  if (latencyBreach || errorBreach || driftBreach) {
    stats.drift_sustained = true;
    await dispatchDriftAlert(env, stats);
  }
  return stats;
}
// End: Phase 36 Sentinel Drift Alert

// End: Phase 20 - Database Heartbeat Sentinel

// Start: Phase 21 - Sentinel Fallback Hardening (Fasal 7 Strategy 4 soft-fail)
// Multi-stage fallback: RPC analytical drift tidak lagi trigger false-alarm
// selagi base PostgREST metadata endpoint masih respon < 500.
// End: Phase 21 - Sentinel Fallback Hardening

// Start: Phase 44 - Status Snapshot Exporter (untuk /status command)
/** Hasil probe kesihatan komponen untuk kad status. */
export interface StatusSnapshot {
  db: boolean;
  redis: boolean;
  telegram?: boolean;
  ts: string;
}

/**
 * Ambil snapshot kesihatan DB + Redis untuk paparan /status.
 * Soft-fail: jika probe gagal, flag dikembalikan false tanpa throw.
 */
export async function getStatusSnapshot(env: Env): Promise<StatusSnapshot> {
  const db = await checkDatabaseHealth(env);
  let redis = false;
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), HEARTBEAT_TIMEOUT_MS);
      const res = await fetch(`${env.UPSTASH_REDIS_REST_URL}/ping`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` },
        signal: controller.signal,
      });
      clearTimeout(timer);
      redis = res.ok;
    } catch {
      redis = false;
    }
  }
  // Start: Phase 45 - Telegram API Ping Probe
  let telegram = false;
  if (env.TELEGRAM_BOT_TOKEN) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), HEARTBEAT_TIMEOUT_MS);
      const res = await fetch(`${TELEGRAM_API}/getMe`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timer);
      telegram = res.ok;
    } catch {
      telegram = false;
    }
  }
  // End: Phase 45 - Telegram API Ping Probe
  return {
    db,
    redis,
    telegram,
    ts: new Date().toISOString(),
  };
}
// End: Phase 44 - Status Snapshot Exporter
