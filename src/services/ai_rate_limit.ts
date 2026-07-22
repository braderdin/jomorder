// Start: Phase 69 - AI Helper Rate Limiter (Fasal 18 + syarat Chip Besar)
// Had: 5 saat antara panggilan, 5 RPM, 20 RPD. Menggunakan Redis Upstash.
// Hanya untuk Lapisan A (projek sendiri). Pengguna (Puter) TIDAK menyentuh ini.
import { Env } from '../types';
import { getRedis, setRedis } from '../redis';

const RPM_KEY = 'jo:helper:rpm';
const RPD_KEY = (d: string) => `jo:helper:rpd:${d}`;
const RPM_TTL = 60; // saat
const RPD_TTL = 86400; // saat (1 hari)
const MAX_RPM = 5;
const MAX_RPD = 20;
const MIN_GAP_MS = 5000; // jeda minimum 5 saat

// Konstanta untuk pesan alasan dan kesalahan
const REASON_RPM_FULL = 'RPM penuh';
const REASON_RPD_FULL = 'RPD penuh';
const REASON_REDIS_ERROR = 'Redis error, soft-fail allowed';

let lastCallTs = 0;

export async function checkHelperQuota(env: Env): Promise<{ ok: boolean; reason?: string }> {
  const now = Date.now();
  const gap = now - lastCallTs;
  if (gap < MIN_GAP_MS) {
    await new Promise((r) => setTimeout(r, MIN_GAP_MS - gap));
  }
  try {
    const day = new Date().toISOString().slice(0, 10);
    const rpm = Number((await getRedis(env, RPM_KEY)) || '0');
    const rpd = Number((await getRedis(env, RPD_KEY(day))) || '0');
    if (rpm >= MAX_RPM) return { ok: false, reason: REASON_RPM_FULL };
    if (rpd >= MAX_RPD) return { ok: false, reason: REASON_RPD_FULL };
    await setRedis(env, RPM_KEY, String(rpm + 1), RPM_TTL);
    await setRedis(env, RPD_KEY(day), String(rpd + 1), RPD_TTL);
    lastCallTs = Date.now();
    return { ok: true };
  } catch (e) {
    // Log kesalahan Redis, tetapi tetap soft-fail agar fungsionaliti inti tidak terganggu
    console.error('AI Rate Limiter Redis Error:', e); // Log kesalahan Redis
    // Soft-fail: membenarkan jika Redis tidak berfungsi (jangan menyekat projek)
    lastCallTs = Date.now();
    return { ok: true };
  }
}
// End: Phase 69 - AI Helper Rate Limiter