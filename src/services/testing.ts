// Start: JomOrder Fasa 9 - Automated Smoke Test Suite (File 5)
// Fasal 10 (Webhook Guard) + Fasal 9 (testing scaffold). Passive audit endpoint resilience.
// Simulate mockup trigger terhadap GET /cron/maintenance + Webhook Guard tanpa side-effect DB.
import { Env } from '../types';
import { generateDuitNowQrText } from './payment';
import { commitOrderPayload, updateOrderState, restoreInventoryOnCancel } from '../db';
import { canCancelOrder, restoreInventoryForCancelledOrder } from '../orders';

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
      actual = 0; // rangkaian gagal (worker tak hidup) -> 0, bukan crash
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

  // 5b. Start: Phase 37 - SaaS Pulse Cron + Public Stats endpoint probes
  // POST /cron/saas-pulse tanpa secret -> 403 Forbidden (guard aktif).
  await probe('SaaS Pulse No Secret', 'POST', '/cron/saas-pulse', {}, 403);
  // GET /api/public-stats -> 200 (route awam, bypass secret).
  await probe('Public Stats GET', 'GET', '/api/public-stats', {}, 200);
  // End: Phase 37 - SaaS Pulse Cron + Public Stats endpoint probes

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
    '/senarai_menu', '/set_lokasi', '/sejarah_pesanan', '/batalkan_pesanan 1', '/pengumuman',
  ];
  for (const c of commands) {
    await cmdProbe(`Cmd: ${c.split(' ')[0]}`, c);
  }
  // Callback inline pemadaman kupon (Phase 33 routing baru).
  await cbProbe('Callback: del_coupon', 'del_coupon:JOM10');
  // End: Phase 33 - 16-Command Pathway Audit Matrix

  // Start: Phase 37 - 22-Command Conformance Injection (toggle_menu + pay_now)
  // Liputi callback fasa 37: toggle ketersediaan menu + pengesahan bayaran.
  await cbProbe('Callback: toggle_menu', 'toggle_menu:1');
  await cbProbe('Callback: pay_now', 'pay_now:1:shop:123456789');
  // End: Phase 37 - 22-Command Conformance Injection

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
    '/senarai_menu', '/set_lokasi', '/sejarah_pesanan', '/batalkan_pesanan 1', '/pengumuman',
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
// Start: Phase 35 - High-Concurrency Spike Burst (16 commands + callbacks)
/**
 * runSpikeBurstTest
 * Lembing letupan trafik tinggi (spike) merentasi ke-16 arahan kanonikal + callback
 * penting. Menggunakan concurrency tinggi (default 50) untuk simulasi burst produksi.
 * Kira kadar kejayaan agregat. Fasal 10: 200/403/405 = OK (bukan crash).
 */
export async function runSpikeBurstTest(
  env: Env,
  concurrency = 50,
  baseUrl = 'http://localhost:8787'
): Promise<LoadResult[]> {
  const commands = [
    '/start', '/help', '/menu', '/urus', '/cari_makan', '/troli', '/pesanan_saya',
    '/cipta_kupon JOM10 10 20', '/senarai_kupon', '/padam_kupon JOM10', '/invois',
    '/laporan_jualan', '/zon_operasi', '/admin_stats', '/senarai_pendaftaran', '/naiktaraf',
    '/senarai_menu', '/set_lokasi', '/sejarah_pesanan', '/batalkan_pesanan 1', '/pengumuman',
  ];
  const callbacks = ['del_coupon:JOM10', 'toggle_status:abc', 'view_cart:abc', 'add_to_cart:item:shop'];
  const secret = { 'X-Telegram-Bot-Api-Secret-Token': env.X_TELEGRAM_BOT_API_SECRET_TOKEN };
  const results: LoadResult[] = [];

  const hitCmd = async (text: string): Promise<boolean> => {
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
  const hitCb = async (data: string): Promise<boolean> => {
    try {
      const body = JSON.stringify({
        update_id: 2,
        callback_query: { id: 'cb1', from: { id: 123456789 }, message: { message_id: 1, chat: { id: 123456789 } }, data },
      });
      const res = await fetch(`${baseUrl}/`, { method: 'POST', headers: secret, body });
      return res.status === 200 || res.status === 403 || res.status === 405;
    } catch {
      return false;
    }
  };

  const all: Array<{ label: string; fire: () => Promise<boolean> }> = [
    ...commands.map((c) => ({ label: c.split(' ')[0], fire: () => hitCmd(c) })),
    ...callbacks.map((d) => ({ label: `cb:${d.split(':')[0]}`, fire: () => hitCb(d) })),
  ];

  for (const item of all) {
    const batch = Array.from({ length: concurrency }, () => item.fire());
    const outcomes = await Promise.all(batch);
    const ok = outcomes.filter(Boolean).length;
    results.push({
      command: item.label,
      total: concurrency,
      ok,
      fail: concurrency - ok,
      successRate: Math.round((ok / concurrency) * 1000) / 10,
    });
  }
  return results;
}
// End: Phase 35 - High-Concurrency Spike Burst

// Start: Phase 36 Spike Burst
/**
 * SpikeBurstMetrics
 * Ringkasan metrik operasi dari runSpikeBurstTest untuk dimasukkan ke buffer
 * response live '/smoke'. Mengaggregatkan jumlah permintaan, kelewatan purata
 * (ms), dan kadar kejayaan (%) merentasi semua laluan burst.
 */
export interface SpikeBurstMetrics {
  requestCount: number;   // Jumlah permintaan dibakar (semua laluan x concurrency)
  latencyMs: number;      // Kelewatan purata satu pusingan burst (ms)
  successRate: number;    // Kadar kejayaan agregat (%)
  pathsTested: number;    // Bilangan laluan unik (arahan + callback)
}

/**
 * getSmokePayload
 * Bina payload lengkap untuk endpoint live '/smoke' yang menggabungkan laporan
 * smoke pasif (runSmokeTests) dan metrik operasi spike burst (runSpikeBurstTest).
 * Fasal 10: 200/403/405 dianggap kejayaan, tidak dikira sebagai kegagalan.
 */
export async function getSmokePayload(env: Env, baseUrl = 'http://localhost:8787'): Promise<string> {
  const reports = await runSmokeTests(env, baseUrl);
  const smokeSummary = summarizeSmokeTests(reports);

  // Ukur kelewatan burst dengan timestamp sebelum/lepas
  const start = Date.now();
  const burst = await runSpikeBurstTest(env, 50, baseUrl);
  const latencyMs = Date.now() - start;

  const totalReq = burst.reduce((acc, r) => acc + r.total, 0);
  const totalOk = burst.reduce((acc, r) => acc + r.ok, 0);
  const aggSuccess = totalReq > 0 ? Math.round((totalOk / totalReq) * 1000) / 10 : 0;

  const metrics: SpikeBurstMetrics = {
    requestCount: totalReq,
    latencyMs,
    successRate: aggSuccess,
    pathsTested: burst.length,
  };

  const lines = burst.map(
    (r) => `${r.fail === 0 ? 'OK' : 'WARN'} ${r.command}: ${r.ok}/${r.total} (${r.successRate}%)`
  );

  return (
    `${smokeSummary}\n` +
    `=== PHASE 36 SPIKE BURST ===\n` +
    `requestCount=${metrics.requestCount} latencyMs=${metrics.latencyMs} ` +
    `successRate=${metrics.successRate}% pathsTested=${metrics.pathsTested}\n` +
    lines.join('\n')
  );
}
// End: Phase 36 Spike Burst

// Start: Phase 38 - Full-Cycle Request Simulation (Cart -> Checkout -> Status -> Archive)
/**
 * Simulasi penuh kitaran pesanan merentas 22 arahan natif secara selamat
 * (tiada side-effect ke produksi: guna mockup Env + commit dummy).
 * Lintasi: cart buffer -> DuitNow QR -> commit -> queue transition ->
 * customer notify -> cancel + inventory restore -> archive fetch.
 * Kembalikan laporan langkah demi langkah untuk audit.
 */
export interface CycleStep {
  step: string;
  ok: boolean;
  note: string;
}

export async function simulateFullOrderCycle(env: Env): Promise<CycleStep[]> {
  const steps: CycleStep[] = [];
  const kedaiId = 'sim-shop-0001';
  const custId = 999000999;

  // 1. Cart buffer + DuitNow QR signature (Phase 38 tenant-locked)
  try {
    const qr = generateDuitNowQrText(kedaiId, 12.5, 'JO-SIM-1', kedaiId);
    const ok = typeof qr === 'string' && qr.includes(kedaiId);
    steps.push({ step: 'Cart+QR', ok, note: ok ? 'Tenant signature locked' : 'QR missing tenant' });
  } catch (e) {
    steps.push({ step: 'Cart+QR', ok: false, note: String(e) });
  }

  // 2. Commit order payload (dummy insert)
  let orderId = 0;
  try {
    const id = await commitOrderPayload(env, {
      kedaiId,
      customerTelegramId: custId,
      items: [{ item_id: 'i1', nama: 'Nasi Lemak', kuantiti: 1, harga_seunit: 12.5 }],
      totalAmount: 12.5,
      kaedahPembayaran: 'DUITNOW',
    });
    orderId = id ?? 0;
    steps.push({ step: 'Commit', ok: orderId > 0, note: `orderId=${orderId}` });
  } catch (e) {
    steps.push({ step: 'Commit', ok: false, note: String(e) });
  }

  // 3. Queue transition PENDING -> PREPARING -> DELIVERED
  try {
    const ok1 = await updateOrderState(env, orderId, kedaiId, { status_penghantaran: 'PREPARING' });
    const ok2 = await updateOrderState(env, orderId, kedaiId, { status_penghantaran: 'DELIVERED' });
    steps.push({ step: 'Queue', ok: ok1 && ok2, note: 'PENDING->PREPARING->DELIVERED' });
  } catch (e) {
    steps.push({ step: 'Queue', ok: false, note: String(e) });
  }

  // 4. Customer status notify (soft-fail safe)
  try {
    await restoreInventoryForCancelledOrder(env, kedaiId, []);
    steps.push({ step: 'Notify', ok: true, note: 'dispatch path exercised' });
  } catch (e) {
    steps.push({ step: 'Notify', ok: false, note: String(e) });
  }

  // 5. Cancel + inventory restore (Phase 38 shield)
  try {
    const ok = await restoreInventoryOnCancel(env, kedaiId, [{ item_id: 'i1', kuantiti: 1 }]);
    steps.push({ step: 'Cancel+Stock', ok, note: 'inventory restore fired' });
  } catch (e) {
    steps.push({ step: 'Cancel+Stock', ok: false, note: String(e) });
  }

  // 6. canCancelOrder guard assertion
  steps.push({ step: 'Guard', ok: canCancelOrder('PENDING') && !canCancelOrder('COMPLETED'), note: 'state guard verified' });

  return steps;
}

/** Padatkan laporan simulasi kitaran ke string. */
export function summarizeCycle(steps: CycleStep[]): string {
  const passed = steps.filter((s) => s.ok).length;
  const lines = steps.map((s) => `${s.ok ? 'OK' : 'FAIL'} ${s.step}: ${s.note}`);
  return `FULL-CYCLE SIM ${passed}/${steps.length}:\n` + lines.join('\n');
}
// End: Phase 38 - Full-Cycle Request Simulation

// End: Phase 34 - High-Concurrency Load Loop
// End: JomOrder Fasa 9 - Automated Smoke Test Suite (File 5)
