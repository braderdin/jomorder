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

  const probe = async (name: string, method: string, path: string, headers: Record<string, string> = {}, expected: number): Promise<void> => {
    let actual = 0;
    try {
      const res = await fetch(`${baseUrl}${path}`, { method, headers, body: method === 'POST' ? '{}' : undefined });
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
// End: JomOrder Fasa 9 - Automated Smoke Test Suite (File 5)