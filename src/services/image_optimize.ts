// Start: Phase 59 - Image Optimize Guard (Fasal 8 WebP 2MB cap + 25MB account)
// Fasal 8: individu imej cap 2MB, akaun total 25MB. Compression disyorkan
// di client (browser canvas -> webp 82%). Modul ini GUARD sebelum upload R2.
// Phase 64: tambah compressToWebP() guna Cloudflare Images API (real re-encode).
import { Env } from '../types';
import { getStorageUsageBytes } from './storage_quota';

const TARGET_MAX_BYTES = 150_000; // 150KB (saiz WebP disyorkan)
const HARD_INDIVIDUAL_CAP = 2_000_000; // 2MB hard cap (Fasal 8)
const ACCOUNT_CAP = 25_000_000; // 25MB total per akaun (Fasal 8)
const WEBP_QUALITY = 82; // Fasal 8: 80-85% target

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

/**
 * compressToWebP
 * Benar-benar RE-ENCODE input bytes ke WebP guna Cloudflare Images API.
 * Fasal 8: pipeline mesti tukar byte, bukan sekadar size-guard.
 * @param input - raw image bytes (dari Telegram)
 * @returns WebP-encoded bytes (<150KB target via quality 82)
 * @throws jika API gagal / token tiada (caller harus fallback)
 */
export async function compressToWebP(env: Env, input: Uint8Array): Promise<Uint8Array> {
  const acct = env.CLOUDFLARE_ACCOUNT_ID;
  const token = env.CF_IMAGES_API_TOKEN;
  if (!acct || !token) {
    throw new Error('Cloudflare Images API tidak dikonfigurasi (CLOUDFLARE_ACCOUNT_ID / CF_IMAGES_API_TOKEN)');
  }
  // Upload direct ke Cloudflare Images dengan output format webp + quality.
  const form = new FormData();
  form.append('file', new Blob([input as unknown as ArrayBuffer], { type: 'application/octet-stream' }));
  const url = `https://api.cloudflare.com/client/v4/accounts/${acct}/images/v1`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Cloudflare Images API gagal: ${res.status}`);
  }
  const json = (await res.json()) as { success: boolean; result?: { variants?: string[]; id?: string } };
  if (!json.success || !json.result?.variants?.length) {
    throw new Error('Cloudflare Images tiada variant');
  }
  // Variant pertama ialah URL asal; tukar ke webp via image resizing query.
  const base = json.result.variants[0].replace(/\/pub\/.*/, '');
  const webpUrl = `${base}/cdn-cgi/image/format=webp,quality=${WEBP_QUALITY}/${json.result.id}/public`;
  const webpRes = await fetch(webpUrl);
  if (!webpRes.ok) {
    throw new Error(`WebP fetch gagal: ${webpRes.status}`);
  }
  const buf = new Uint8Array(await webpRes.arrayBuffer());
  // Auto-shrink jika masih >150KB: turunkan quality secara rekursif.
  if (buf.byteLength > TARGET_MAX_BYTES) {
    return await shrinkWebp(env, json.result.id!, base, WEBP_QUALITY - 10);
  }
  return buf;
}

/** Rekursif turunkan quality sehingga saiz <150KB atau cap minimum 40. */
async function shrinkWebp(env: Env, imgId: string, base: string, quality: number): Promise<Uint8Array> {
  if (quality < 40) {
    // Ambil apa ada (jangan infinite loop). Caller guard akan handle.
    const r = await fetch(`${base}/cdn-cgi/image/format=webp,quality=40/${imgId}/public`);
    return new Uint8Array(await r.arrayBuffer());
  }
  const webpUrl = `${base}/cdn-cgi/image/format=webp,quality=${quality}/${imgId}/public`;
  const res = await fetch(webpUrl);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > TARGET_MAX_BYTES) {
    return await shrinkWebp(env, imgId, base, quality - 10);
  }
  return buf;
}
// End: Phase 59 - Image Optimize Guard