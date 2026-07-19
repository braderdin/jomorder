// Start: Phase 59 - Image Optimize Guard (Fasal 8 WebP 2MB cap + 25MB account)
// Fasal 8: individu imej cap 2MB, akaun total 25MB. Compression disyorkan
// di client (browser canvas -> webp 82%). Modul ini GUARD sebelum upload R2.
import { Env } from '../types';
import { getStorageUsageBytes } from './storage_quota';

const TARGET_MAX_BYTES = 150_000; // 150KB (saiz WebP disyorkan)
const HARD_INDIVIDUAL_CAP = 2_000_000; // 2MB hard cap (Fasal 8)
const ACCOUNT_CAP = 25_000_000; // 25MB total per akaun (Fasal 8)

/**
 * estimateCompressedSize - anggar saiz selepas compress (heuristic mudah).
 */
export function estimateCompressedSize(originalBytes: number): number {
  return Math.round(originalBytes * 0.3);
}

/**
 * validateOptimizedSize - semak saiz imej WebP sudah di-compress.
 */
export function validateOptimizedSize(data: Uint8Array): { ok: boolean; reason?: string } {
  if (data.byteLength === 0) return { ok: false, reason: 'Fail kosong' };
  if (data.byteLength > TARGET_MAX_BYTES) {
    return {
      ok: false,
      reason: `Imej mesti <${Math.round(TARGET_MAX_BYTES / 1000)}KB selepas compress (kini ${Math.round(data.byteLength / 1000)}KB)`,
    };
  }
  return { ok: true };
}

/**
 * guardUpload - semak HARD cap individu (2MB) + akaun total (25MB).
 * Panggil SEBELUM simpan ke R2. Reject dengan reason BM jika langgar.
 */
export async function guardUpload(
  env: Env,
  merchantTgId: number,
  incomingBytes: number
): Promise<{ ok: boolean; reason?: string }> {
  if (incomingBytes > HARD_INDIVIDUAL_CAP) {
    return { ok: false, reason: `Imej individu mesti ≤2MB (kini ${(incomingBytes / 1_000_000).toFixed(1)}MB)` };
  }
  try {
    const used = await getStorageUsageBytes(env, merchantTgId);
    if (used + incomingBytes > ACCOUNT_CAP) {
      return { ok: false, reason: `Had storan 25MB akaun penuh (guna ${(used / 1_000_000).toFixed(1)}MB)` };
    }
  } catch {
    // Jika metric gagal, benarkan (fail-open) tapi log amaran.
    console.warn('[Phase59] guardUpload storage metric fail, allow upload');
  }
  return { ok: true };
}
// End: Phase 59 - Image Optimize Guard
