// Start: Phase 57 - Image Optimize Guard (WebP 82% target <150KB)
// Fasal 8 (WebP 80-85% quality). Server-side guard: reject imej
// yang melebihi 150KB selepas compress. Compression sebenar dilakukan
// di client (browser canvas -> webp quality 0.82). Modul ini SAHAJA
// validasi saiz akhir sebelum upload R2.
import { Env } from '../types';

const TARGET_MAX_BYTES = 150_000; // 150KB (Fasal 8 relaxed, lagi kecil dari 200KB)

/**
 * estimateCompressedSize - anggar saiz selepas compress (heuristic mudah).
 * Imej WebP quality 82% biasanya ~25-40% saiz PNG asal.
 * Return anggaran byte.
 */
export function estimateCompressedSize(originalBytes: number): number {
  // Heuristic: webp 82% ~ 0.3x saiz asal untuk foto makanan.
  return Math.round(originalBytes * 0.3);
}

/**
 * validateOptimizedSize - semak saiz imej WebP sudah di-compress.
 * Reject jika > 150KB (storage bucket cepat penuh).
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

// Interface kosong elak unused Env import warning jika tiada guna env.
export type _EnvUnused = Env;
// End: Phase 57 - Image Optimize Guard