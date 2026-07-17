// Start: JomOrder Fasa 4 - Core Worker Entry Point (Wired to Fasa 4 modules)
// Fasal 10 (Webhook Guard) + Fasal 4 (SOA) + Fasal 11 (env binding consistency)
import { Env, TelegramUpdate } from './types';
import { parseUpdate } from './telegram';
import { handleUpdate, runScheduledMaintenance } from './handlers';
import { runSmokeTests, summarizeSmokeTests } from './services/testing';
import { checkDatabaseHealth } from './services/sentinel';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Start: Fasa 7 - Cloudflare Cron Upkeep Endpoint (GET /cron/maintenance)
    // Mendengar Cloudflare Cron Triggers dengan selamat; hanya GET dibenarkan.
    // GET lain (smoke test) → 200 PASS. Endpoint ini pull scheduler engine.
    if (request.method === 'GET' && url.pathname.endsWith('/cron/maintenance')) {
      try {
        const scanned = await runScheduledMaintenance(env);
        return new Response(
          JSON.stringify({ status: 'OK', service: 'JomOrder', cron: 'maintenance', merchants_notified: scanned }),
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
    // End: Fasa 7 - Cloudflare Cron Upkeep Endpoint

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

    // Route update ke Message Router & Onboarding Logic (Fail 3)
    await handleUpdate(env, update);
    // End: Update Router

    return new Response('OK', { status: 200 });
  },
};

// End: JomOrder Fasa 4 - Core Worker Entry Point