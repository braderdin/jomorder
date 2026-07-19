// Start: Phase 57 - R2 Storage Quota Enforcer (20MB per-account hard cap)
// Fasal 8 (R2 limit) + Fasal 7 Strategy 2 (Redis key isolation).
// Hadkan storan per akaun peniaga kepada 20MB total supaya bucket
// tak penuh dengan pantas. Track usage di Redis key 'jo:quota:{tgId}'.
import { Env } from '../types';

const QUOTA_KEY_PREFIX = 'jo:quota:';
const MAX_BYTES_PER_ACCOUNT = 25_000_000; // 25MB hard cap (Fasal 8)

const quotaKey = (tgId: number) => `${QUOTA_KEY_PREFIX}${tgId}`;

/** Baca usage semasa (byte) dari Redis. 0 jika tiada rekod. */
export async function getUsage(env: Env, tgId: number): Promise<number> {
  try {
    const res = await fetch(env.UPSTASH_REDIS_REST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
      },
      body: JSON.stringify([['GET', quotaKey(tgId)]]),
    });
    if (!res.ok) return 0;
    const data = (await res.json()) as Array<{ result: unknown }>;
    const raw = data?.[0]?.result;
    return typeof raw === 'string' ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

/** Semak sebelum upload: true jika masih ada ruang untuk incomingBytes. */
export async function checkQuota(env: Env, tgId: number, incomingBytes: number): Promise<boolean> {
  const used = await getUsage(env, tgId);
  return used + incomingBytes <= MAX_BYTES_PER_ACCOUNT;
}

/** Alias untuk image_optimize.guardUpload (Fasal 8 25MB account cap). */
export async function getStorageUsageBytes(env: Env, tgId: number): Promise<number> {
  return getUsage(env, tgId);
}

/** Tambah usage selepas upload berjaya. */
export async function addUsage(env: Env, tgId: number, bytes: number): Promise<void> {
  const used = await getUsage(env, tgId);
  const next = used + bytes;
  try {
    await fetch(env.UPSTASH_REDIS_REST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
      },
      body: JSON.stringify([['SET', quotaKey(tgId), String(next)]]),
    });
  } catch {
    // non-critical, swallow
  }
}

/** Reset usage (untuk admin purge atau peniaga padam semua aset). */
export async function resetUsage(env: Env, tgId: number): Promise<void> {
  try {
    await fetch(env.UPSTASH_REDIS_REST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
      },
      body: JSON.stringify([['DEL', quotaKey(tgId)]]),
    });
  } catch {
    // non-critical
  }
}

export { MAX_BYTES_PER_ACCOUNT };
// End: Phase 57 - R2 Storage Quota Enforcer