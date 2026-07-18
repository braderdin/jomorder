// Start: JomOrder Fasa 4 - Core Worker Entry Point (Wired to Fasa 4 modules)
// Fasal 10 (Webhook Guard) + Fasal 4 (SOA) + Fasal 11 (env binding consistency)
import { Env, TelegramUpdate } from './types';
import { parseUpdate } from './telegram';
import { handleUpdate, runScheduledMaintenance, handlePublicStats } from './handlers';
import { runSmokeTests, summarizeSmokeTests } from './services/testing';
import { checkDatabaseHealth } from './services/sentinel';
import { dispatchSubscriptionAlerts } from './services/scheduler';
import { invalidateSubscriptionCacheBatch } from './redis';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Start: Phase 26 - Cron Maintenance Endpoint (POST sahaja, Fasal 10 guard)
    // GitHub Actions / Cloudflare Cron tembak POST dengan header rahsia.
    // GET (smoke test) akan jatuh ke Webhook Guard bawah -> 200 PASS (harmonized).
    if (request.method === 'POST' && url.pathname.endsWith('/cron/maintenance')) {
      // Strict secret check: tolak 403 jika token tak sepadan (Fasal 10).
      const cronSecret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
      if (!cronSecret || cronSecret !== env.X_TELEGRAM_BOT_API_SECRET_TOKEN) {
        return new Response('Forbidden', { status: 403 });
      }
      try {
        // Delegate terus ke dispatcher langganan (bypass admin node).
        const scanned = await dispatchSubscriptionAlerts(env);
        const ids = scanned.map((r) => r.telegramId);
        if (ids.length > 0) {
          await invalidateSubscriptionCacheBatch(env, ids);
        }
        return new Response(
          JSON.stringify({ status: 'OK', service: 'JomOrder', cron: 'maintenance', merchants_notified: ids.length }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      } catch (err) {
        // Soft 200 (Fasal 7 Strategy 4) — jangan biarkan cron gagal keras
        return new Response(
          JSON.stringify({ status: 'DEGRADED', service: 'JomOrder', error: (err as Error).message }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }
    // End: Phase 26 - Cron Maintenance Endpoint

    // Start: Fasa 10 - Live Smoke Test Engine Endpoint (GET /smoke)
    // Panggil runSmokeTests(env) secara live dan return laporan audit resilience.
    if (request.method === 'GET' && url.pathname.endsWith('/smoke')) {
      try {
        const reports = await runSmokeTests(env);
        const summary = summarizeSmokeTests(reports);
        return new Response(summary, {
          status: 200,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      } catch (err) {
        // Soft 200 (Fasal 7 Strategy 4) - jangan biarkan smoke test gagal keras
        return new Response(
          `SMOKE TEST ERROR: ${(err as Error).message}`,
          { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
        );
      }
    }
    // End: Fasa 10 - Live Smoke Test Engine Endpoint

    // Start: Phase 20 - Database Heartbeat Sentinel Endpoint (GET /health)
    // Soft HTTP 200 untuk elak Telegram/webhook retry storm (Fasal 7 Strategy 4).
    // "OK" = heartbeat hidup, "DRIFT_DETECTED" = sambungan DB jatuh.
    if (request.method === 'GET' && url.pathname.endsWith('/health')) {
      const alive = await checkDatabaseHealth(env);
      return new Response(alive ? 'OK' : 'DRIFT_DETECTED', {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
    // End: Phase 20 - Database Heartbeat Sentinel Endpoint

    // Start: Phase 27 - Public Stats Aggregate Route (bypass webhook secret)
    // Route ini DEDAHKAN data analitik SELAMAT sahaja (COUNT aggregates).
    // Tidak perlu X-Telegram-Bot-Api-Secret-Token -> elak CORS/401 public consumption.
    if (request.method === 'GET' && url.pathname.endsWith('/api/public-stats')) {
      try {
        const payload = await handlePublicStats(env);
        // Cache-Control diharmonikan dengan PUBLIC_STATS_TTL=60 (Phase 28 grid).
        // s-maxage=60 -> Cloudflare edge cache sebaris dengan Redis 60s window.
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=30',
          },
        });
      } catch (err) {
        // Soft 200 (Fasal 7 Strategy 4) - jangan biarkan public route gagal keras
        return new Response(
          JSON.stringify({ status: 'DEGRADED', service: 'JomOrder', error: (err as Error).message }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }
    // End: Phase 27 - Public Stats Aggregate Route

    // Start: Webhook Guard (Fasal 10)
    if (request.method !== 'POST') {
      // Smoke Test Harmonization: GET ping → 200 PASS (bukan deadlock)
      if (request.method === 'GET') {
        return new Response(
          JSON.stringify({ status: 'PASS', service: 'JomOrder', mode: 'webhook-ready' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      // Method lain (PUT/DELETE/etc) → 405 Method Not Allowed
      return new Response('Method Not Allowed', { status: 405 });
    }

    // Validate X-Telegram-Bot-Api-Secret-Token header (Fasal 10)
    const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (!secret || secret !== env.X_TELEGRAM_BOT_API_SECRET_TOKEN) {
      return new Response('Forbidden', { status: 403 });
    }
    // End: Webhook Guard

    // Start: Update Router (Fasa 4 - delegate ke handlers.ts)
    const body = await request.text();
    const update: TelegramUpdate | null = parseUpdate(body);
    if (!update) {
      // Soft 200 untuk elak Telegram retry storm (Fasal 7 Strategy 4)
      return new Response('OK', { status: 200 });
    }

    // Phase 30: Async fire-and-forget untuk elak serverless gateway timeout.
    // Tangkap callback/customer push chain secara non-blocking; webhook terus
    // balas 200 supaya Telegram tidak retry. Sebarang error di-log soft-fail.
    const processing = handleUpdate(env, update).catch((err) => {
      console.error('[Phase30] update processing soft-fail:', (err as Error).message);
    });
    // Jangan tunggu promise tamat — balas segera (Fasal 7 Strategy 4 resilience).
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    void processing;

    // End: Update Router

    return new Response('OK', { status: 200 });
  },
};

// End: JomOrder Fasa 4 - Core Worker Entry Point