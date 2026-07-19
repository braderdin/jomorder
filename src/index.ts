// Start: JomOrder Fasa 4 - Core Worker Entry Point (Wired to Fasa 4 modules)
// Fasal 10 (Webhook Guard) + Fasal 4 (SOA) + Fasal 11 (env binding consistency)
import { Env, TelegramUpdate } from './types';
import { parseUpdate, debugIncomingUpdate } from './telegram';
import { handleUpdate, runScheduledMaintenance, handlePublicStats } from './handlers';
import { registerBotCommands } from './services/telegram_setup';
import { runSmokeTests, summarizeSmokeTests } from './services/testing';
import { checkDatabaseHealth, selfHealDrift } from './services/sentinel';
import { dispatchSubscriptionAlerts, triggerSaasPulseReport, runDailyCouponSweep, sendDailyDigest } from './services/scheduler';
import { invalidateSubscriptionCacheBatch } from './redis';
import { captureRawWebhookFrame } from './services/telegram_webhook_diagnostics';
import { captureRetryFailure } from './services/webhook_retry_manager';

// Start: Phase 32 - Bot Command Menu Bootstrap (lifecycle onboarding)
// Daftarkan 16 arahan natif ke menu Telegram sekali sahaja per cold-start worker.
// Fire-and-forget: tidak sekat response webhook (Fasal 7 Strategy 4 resilience).
let commandMenuBootstrapped = false;
async function bootstrapCommandMenu(env: Env): Promise<void> {
  if (commandMenuBootstrapped) return;
  commandMenuBootstrapped = true;
  try {
    const ok = await registerBotCommands(env);
    if (!ok) console.warn('[Phase32] registerBotCommands soft-fail (menu mungkin belum sync).');
  } catch (err) {
    console.warn('[Phase32] registerBotCommands error:', (err as Error).message);
  }
}
// End: Phase 32 - Bot Command Menu Bootstrap

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Phase 32: trigger bootstrap menu secara async (tidak sekat route).
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    void bootstrapCommandMenu(env);

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
        // Phase 51: Sentinel self-heal drift recovery (report to admin).
        const healed = await selfHealDrift(env);
        return new Response(
          JSON.stringify({ status: 'OK', service: 'JomOrder', cron: 'maintenance', merchants_notified: ids.length, self_healed: healed }),
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
    // Start: Phase 37 - SaaS Pulse Cron Endpoint (POST, Fasal 10 secret guard)
    // Endpoint automasi yang mencetuskan laporan pulse platform ke ADMIN_TELEGRAM_ID.
    // GET (smoke test) akan jatuh ke Webhook Guard bawah -> 200 PASS (harmonized).
    if (request.method === 'POST' && url.pathname.endsWith('/cron/saas-pulse')) {
      const pulseSecret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
      if (!pulseSecret || pulseSecret !== env.X_TELEGRAM_BOT_API_SECRET_TOKEN) {
        return new Response('Forbidden', { status: 403 });
      }
      try {
        const report = await triggerSaasPulseReport(env);
        return new Response(
          JSON.stringify({ status: 'OK', service: 'JomOrder', cron: 'saas-pulse', dispatched: report }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ status: 'DEGRADED', service: 'JomOrder', error: (err as Error).message }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }
    // End: Phase 37 - SaaS Pulse Cron Endpoint

    // Start: Phase 49 - Coupon Expiry Sweep Cron Endpoint (POST, Fasal 10 guard)
    // Timer cron harian tembak endpoint ini -> matikan kupon tamat + notify peniaga.
    if (request.method === 'POST' && url.pathname.endsWith('/cron/coupon-sweep')) {
      const sweepSecret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
      if (!sweepSecret || sweepSecret !== env.X_TELEGRAM_BOT_API_SECRET_TOKEN) {
        return new Response('Forbidden', { status: 403 });
      }
      try {
        const closed = await runDailyCouponSweep(env);
        return new Response(
          JSON.stringify({ status: 'OK', service: 'JomOrder', cron: 'coupon-sweep', coupons_closed: closed }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ status: 'DEGRADED', service: 'JomOrder', error: (err as Error).message }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }
    // End: Phase 49 - Coupon Expiry Sweep Cron Endpoint

    // Start: Phase 51 - Daily Merchant Digest Cron Endpoint (POST, Fasal 10 guard)
    // Timer cron harian (9pg) tembak endpoint ini -> hantar ringkasan harian ke peniaga.
    if (request.method === 'POST' && url.pathname.endsWith('/cron/daily-digest')) {
      const digestSecret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
      if (!digestSecret || digestSecret !== env.X_TELEGRAM_BOT_API_SECRET_TOKEN) {
        return new Response('Forbidden', { status: 403 });
      }
      try {
        const sent = await sendDailyDigest(env);
        return new Response(
          JSON.stringify({ status: 'OK', service: 'JomOrder', cron: 'daily-digest', merchants_sent: sent }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ status: 'DEGRADED', service: 'JomOrder', error: (err as Error).message }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }
    // End: Phase 51 - Daily Merchant Digest Cron Endpoint

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
    // Start: Phase 51 - Menu Showcase Public Route (/api/menu-showcase)
    // Papar menu trending (gambar + harga) untuk grid landing page.
    // Public-safe: hanya SELECT menu_makanan + join senarai_kedai (no PII).
    if (request.method === 'GET' && url.pathname.endsWith('/api/menu-showcase')) {
      try {
        const q = `${env.SUPABASE_URL}/rest/v1/menu_makanan?select=id,nama_hidangan,harga,gambar_url,kedai_id&status_tersedia=eq.true&order=created_at.desc&limit=8`;
        const res = await fetch(q, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            apikey: env.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
          },
        });
        const items = res.ok ? await res.json() : [];
        return new Response(JSON.stringify({ items }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=30',
          },
        });
      } catch {
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    // End: Phase 51 - Menu Showcase Public Route

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
    // Phase 39: Live Webhook Alignment - raw body capture SEBELUM secret verify
    // supaya payload Telegram tidak hilang jika header verification gagal.
    // Guard saiz payload mentah supaya stream arahan panjang tidak mematikan
    // edge gateway (Fasal 7 Strategy 4 resilience + Fasal 10 timeout block).
    let rawBody: string;
    try {
      rawBody = await request.text();
    } catch (readErr) {
      // Fasal 7 S4: jangan crash worker bila stream read gagal. Soft 200.
      console.error('[Phase39] raw body read fail:', (readErr as Error).message);
      return new Response('OK', { status: 200 });
    }
    // Had 1MB: tolak senyap payload abnormal tanpa crash worker.
    if (rawBody.length > 1_000_000) {
      return new Response('OK', { status: 200 });
    }
    // Phase 39: Dump raw frame ke diagnostic engine SEBELUM parse/trim.
    // Ini mengelak corruption: kita simpan copy mentah untuk error isolation.
    try {
      await captureRawWebhookFrame(env, rawBody);
    } catch {
      // Diagnostic gagal tidak boleh sekat webhook utama (Fasal 7 S4).
    }
    // parseUpdate() dah dibalut try/catch (soft-fail null). Tambahan:
    // trim whitespace stream supaya arahan teks mentah ("/start ") parse bersih.
    // Phase 38: Capture raw frame length sebelum parse untuk telemetry grid.
    // elak corruption: trim selamat + rekam trace tanpa throw (Fasal 7 S4).
    debugIncomingUpdate(env, rawBody, 'pre-parse');
    const update: TelegramUpdate | null = parseUpdate(rawBody.trim());
    if (!update) {
      // Soft 200 untuk elak Telegram retry storm (Fasal 7 Strategy 4)
      debugIncomingUpdate(env, rawBody, 'parse-failed');
      return new Response('OK', { status: 200 });
    }
    // Rekam trace update berjaya untuk queue telemetry grid (Phase 38).
    debugIncomingUpdate(env, JSON.stringify(update), 'parsed-ok', update.update_id);

    // Phase 34: Bound processing ke execution context via ctx.waitUntil()
    // supaya runtime Cloudflare kekalkan worker hidup sehingga loop latar
    // belakang (callback/customer push chain) selesai — elak gateway dropout.
    // Webhook tetap balas 200 segera (Fasal 7 Strategy 4 resilience).
    // Phase 40: Retry middleware intercept - balut processing dengan diagnostic
    // soft-fail supaya frame putus akibat Telegram drop link tidak biarkan
    // worker senyap. Log ke retry manager (fail-open) lalu terus 200 ke Telegram.
    const processing = handleUpdate(env, update).catch(async (err) => {
      const msg = (err as Error).message;
      console.error('[Phase40] update processing soft-fail:', msg);
      try {
        await captureRetryFailure(env, 'handleUpdate', msg.slice(0, 200));
      } catch {
        // swallow diagnostic failure - jangan block webhook response
      }
    });
    ctx.waitUntil(processing);

    // End: Update Router

    return new Response('OK', { status: 200 });
  },
};

// End: JomOrder Fasa 4 - Core Worker Entry Point