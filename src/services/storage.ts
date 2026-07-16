// Start: JomOrder Fasa 8 - Cloudflare R2 Storan Awan Service
// Fasal 8: Hard 2MB cap, raw image byte-signature validation, WebP-only intake.

import { Env } from '../types';

const MAX_BYTES = 2_000_000; // Fasal 8: individual asset hard cap 2MB

// Magic byte signatures untuk format imej dibenarkan (kecuali WebP disahkan berasingan).
const IMAGE_SIGNATURES: Record<string, number[]> = {
  png: [0x89, 0x50, 0x4e, 0x47],
  jpeg: [0xff, 0xd8, 0xff],
  gif: [0x47, 0x49, 0x46],
};

function matchSignature(bytes: Uint8Array): boolean {
  for (const sig of Object.values(IMAGE_SIGNATURES)) {
    if (sig.every((b, i) => bytes[i] === b)) return true;
  }
  return false;
}

// WebP = RIFF<4-byte-size>WEBP (offset 0 & 8).
function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  );
}

export interface UploadResult {
  success: boolean;
  key?: string;
  error?: string;
}

// Validasi mentah: saiz + magic byte + paksa WebP (Fasal 8 quality 80-85% di client).
export function validateImageAsset(data: Uint8Array): { ok: boolean; reason?: string } {
  if (data.byteLength === 0) return { ok: false, reason: 'Fail kosong' };
  if (data.byteLength > MAX_BYTES) {
    return { ok: false, reason: `Saiz ${data.byteLength} byte melebihi had 2MB` };
  }
  if (!matchSignature(data) && !isWebp(data)) {
    return { ok: false, reason: 'Bukan imej sah (tiada magic byte PNG/JPEG/GIF/WebP)' };
  }
  if (!isWebp(data)) {
    return { ok: false, reason: 'Format mesti WebP (Fasal 8: compress 80-85% dulu)' };
  }
  return { ok: true };
}

// Muat naik aset peniaga ke R2 dengan validasi ketat sebelum commit.
export async function uploadMerchantAsset(
  env: Env,
  merchantTgId: number,
  assetType: 'duitnow_qr' | 'receipt',
  data: Uint8Array,
  customKey?: string
): Promise<UploadResult> {
  const check = validateImageAsset(data);
  if (!check.ok) return { success: false, error: check.reason };
  if (!env.R2_BUCKET) return { success: false, error: 'R2_BUCKET tiada binding' };

  const key = customKey ?? `${merchantTgId}/${assetType}_${Date.now()}.webp`;
  await env.R2_BUCKET.put(key, data as unknown as BodyInit);
  return { success: true, key };
}
// End: JomOrder Fasa 8