// Start: JomOrder Fasa 9 - Automated Smoke Test Suite (File 5)
// Fasal 10 (Webhook Guard) + Fasal 9 (testing scaffold). Passive audit endpoint resilience.
// Simulate mockup trigger terhadap GET /cron/maintenance + Webhook Guard tanpa side-effect DB.
import { Env } from '../types';

/** Laporan satu ujian resilience endpoint. */
export interface SmokeReport {
  name: string;
  method: string;
  path: string;
  expected: number;
  actual: number;
  pass: boolean;
}

/**
 * runSmokeTests
 * Lakukan siri ujian pasif ke worker yang berjalan (default http://localhost:8787).
 * Audit: cron maintenance (200), webhook-ready GET (200), method lain (405),
 * secret tiada (403), secret sah (200). Fasal 10: 405/403 dianggap PASS (bukan crash).
 */
export async function runSmokeTests(env: Env, baseUrl = 'http://localhost:8787'): Promise<SmokeReport[]> {
  const reports: SmokeReport[] = [];

  const probe = async (name: string, method: string, path: string, headers: Record<string, string> = {}, expected: number, body?: string): Promise<void> => {
    let actual = 0;
    try {
      const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body ?? (method === 'POST' ? '{}' : undefined) });
      actual = res.status;
    } catch {
      actual = 0; // rangkaian gagal (worker tak hidup) → 0, bukan crash
    }
    reports.push({ name, method, path, expected, actual, pass: actual === expected });
  };

  // 1. Cron maintenance (GET) — expect 200 PASS
  await probe('Cron Maintenance', 'GET', '/cron/maintenance', {}, 200);

  // 2. Webhook readiness ping (GET) — expect 200 PASS
  await probe('Webhook Ready Ping', 'GET', '/', {}, 200);

  // 3. Method Not Allowed (PUT) — expect 405 PASS (Fasal 10 harmonized)
  await probe('Method Not Allowed', 'PUT', '/', {}, 405);

  // 4. Webhook Guard: tiada secret token — expect 403 Forbidden PASS
  await probe('Webhook Guard No Secret', 'POST', '/', {}, 403);

  // 5. Webhook Guard: secret sah — expect 200 OK (terima payload)
  await probe('Webhook Guard Valid Secret', 'POST', '/', { 'X-Telegram-Bot-Api-Secret-Token': env.X_TELEGRAM_BOT_API_SECRET_TOKEN }, 200);

  // 6. Start: Fasa 16 Smoke Test Engine Expansion - Coupon Route Validation (/kupon)
  // Mockup POST webhook dengan body mesej pelanggan '/kupon <KOD>' + secret sah.
  // Audit input validation matrix route path /kupon (handler dari customer.ts). Expect 200.
  const kuponMockBody = JSON.stringify({
    update_id: 1,
    message: {
      message_id: 1,
      from: { id: 123456789 },
      chat: { id: 123456789 },
      text: '/kupon TESTKOD',
    },
  });
  await probe('Coupon Route Validation', 'POST', '/', { 'X-Telegram-Bot-Api-Secret-Token': env.X_TELEGRAM_BOT_API_SECRET_TOKEN }, 200, kuponMockBody);
  // End: Fasa 16 Smoke Test Engine Expansion

  // Start: Phase 33 - 16-Command Pathway Audit Matrix (Fasal 4 SOA coverage)
  // Audit penuh kesemua 16 arahan natif + callback del_coupon melalui mockup
  // webhook POST (secret sah). Setiap route dijangka return 200 (Fasal 10).
  const cmdProbe = async (label: string, text: string): Promise<void> => {
    const body = JSON.stringify({
      update_id: 1,
      message: { message_id: 1, from: { id: 123456789 }, chat: { id: 123456789 }, text },
    });
    await probe(label, 'POST', '/', { 'X-Telegram-Bot-Api-Secret-Token': env.X_TELEGRAM_BOT_API_SECRET_TOKEN }, 200, body);
  };
  const cbProbe = async (label: string, data: string): Promise<void> => {
    const body = JSON.stringify({
      update_id: 2,
      callback_query: { id: 'cb1', from: { id: 123456789 }, message: { message_id: 1, chat: { id: 123456789 } }, data },
    });
    await probe(label, 'POST', '/', { 'X-Telegram-Bot-Api-Secret-Token': env.X_TELEGRAM_BOT_API_SECRET_TOKEN }, 200, body);
  };

  const commands = [
    '/start', '/help', '/menu', '/urus', '/cari_makan', '/troli', '/pesanan_saya',
    '/cipta_kupon JOM10 10 20', '/senarai_kupon', '/padam_kupon JOM10', '/invois',
    '/laporan_jualan', '/zon_operasi', '/admin_stats', '/senarai_pendaftaran', '/naiktaraf',
  ];
  for (const c of commands) {
    await cmdProbe(`Cmd: ${c.split(' ')[0]}`, c);
  }
  // Callback inline pemadaman kupon (Phase 33 routing baru).
  await cbProbe('Callback: del_coupon', 'del_coupon:JOM10');
  // End: Phase 33 - 16-Command Pathway Audit Matrix

  return reports;
}

/**
 * summarizeSmokeTests
 * Padatkan laporan ke string status untuk log/telegram. Kira jumlah PASS/FAIL.
 */
export function summarizeSmokeTests(reports: SmokeReport[]): string {
  const passed = reports.filter((r) => r.pass).length;
  const total = reports.length;
  const lines = reports.map(
    (r) => `${r.pass ? '✅' : '❌'} ${r.name} [${r.method} ${r.path}] → ${r.actual} (expect ${r.expected})`
  );
  return `🩺 SMOKE TEST: ${passed}/${total} PASS\n` + lines.join('\n');
}

// Start: Phase 34 - High-Concurrency Load Loop (16 native commands)
/** Keputusan satu kitaran beban serentak. */
export interface LoadResult {
  command: string;
  total: number;
  ok: number;
  fail: number;
  successRate: number;
}

/**
 * runConcurrencyLoadTest
 * Lembing N permintaan serentak bagi setiap 16 arahan natif ke worker
 * (default localhost:8787) dengan secret sah. Kira kadar kejayaan per arahan.
 * Fasal 10: status 200/403/405 dianggap OK (bukan crash).
 */
export async function runConcurrencyLoadTest(
  env: Env,
  concurrency = 10,
  baseUrl = 'http://localhost:8787'
): Promise<LoadResult[]> {
  const commands = [
    '/start', '/help', '/menu', '/urus', '/cari_makan', '/troli', '/pesanan_saya',
    '/cipta_kupon JOM10 10 20', '/senarai_kupon', '/padam_kupon JOM10', '/invois',
    '/laporan_jualan', '/zon_operasi', '/admin_stats', '/senarai_pendaftaran', '/naiktaraf',
  ];
  const results: LoadResult[] = [];
  const secret = { 'X-Telegram-Bot-Api-Secret-Token': env.X_TELEGRAM_BOT_API_SECRET_TOKEN };

  const hit = async (text: string): Promise<boolean> => {
    try {
      const body = JSON.stringify({
        update_id: 1,
        message: { message_id: 1, from: { id: 123456789 }, chat: { id: 123456789 }, text },
      });
      const res = await fetch(`${baseUrl}/`, { method: 'POST', headers: secret, body });
      return res.status === 200 || res.status === 403 || res.status === 405;
    } catch {
      return false;
    }
  };

  for (const c of commands) {
    const batch = Array.from({ length: concurrency }, () => hit(c));
    const outcomes = await Promise.all(batch);
    const ok = outcomes.filter(Boolean).length;
    results.push({
      command: c.split(' ')[0],
      total: concurrency,
      ok,
      fail: concurrency - ok,
      successRate: Math.round((ok / concurrency) * 1000) / 10,
    });
  }
  return results;
}

/** Padatkan keputusan beban ke string status. */
export function summarizeLoadResults(results: LoadResult[]): string {
  const lines = results.map(
    (r) => `${r.fail === 0 ? '✅' : '⚠️'} ${r.command}: ${r.ok}/${r.total} (${r.successRate}%)`
  );
  return `🔥 CONCURRENCY LOAD (16 CMD):\n` + lines.join('\n');
}
// End: Phase 34 - High-Concurrency Load Loop
// End: JomOrder Fasa 9 - Automated Smoke Test Suite (File 5)
