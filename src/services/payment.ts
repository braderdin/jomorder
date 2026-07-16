// Start: JomOrder Fasa 7 - Payment Service (DuitNow QR Checkout)
// Fasal 6 (Telegram UI/UX) + Fasal 8 (R2 Storage Limits & WebP Optimization)
// Module ini mengurus: resit pembayaran, muat naik imej (mock), & penjanaan teks DuitNow QR.

import type { Env } from '../types';

/** Had optimasi media mengikut Fasal 8 (2MB per asset, WebP 80-85%). */
export const MAX_RECEIPT_BYTES = 2 * 1024 * 1024; // 2MB hard cap
export const ALLOWED_RECEIPT_MIME = 'image/webp';

/** Struktur butiran pesanan untuk paparan resit. */
export interface PaymentReceiptInput {
  orderId: string;
  merchantName: string;
  customerName: string;
  items: Array<{ name: string; qty: number; price: number }>;
  totalAmount: number; // dalam RM (float)
  deliveryLat: number;
  deliveryLng: number;
}

/** Hasil validasi muat naik resit. */
export interface ReceiptUploadResult {
  ok: boolean;
  reason?: string;
  r2Key?: string;
}

/**
 * generateDuitNowQrText
 * Menjana string teks DuitNow QR standard (EMVCo-ish static payload).
 * Format dipermudah: mengandungi ID peniaga + amaun + rujukan pesanan.
 */
export function generateDuitNowQrText(
  merchantId: string,
  amount: number,
  orderRef: string
): string {
  const cleanAmount = amount.toFixed(2);
  // DuitNow static payload ringkas (bukan penuh EMVCo, cukup untuk display bot)
  return [
    '00020101', // Payload format indicator
    '26', // Merchant account info
    `MY.DUITNOW.${merchantId}`,
    `54${cleanAmount.length.toString().padStart(2, '0')}${cleanAmount}`, // Amount
    `62${orderRef.length.toString().padStart(2, '0')}${orderRef}`, // Reference
    '6304', // CRC placeholder
  ].join('|');
}

/**
 * validateReceiptUpload
 * Semak saiz (<=2MB) & format (WebP) mengikut Fasal 8 sebelum muat naik.
 */
export function validateReceiptUpload(
  fileSizeBytes: number,
  mimeType: string
): ReceiptUploadResult {
  if (fileSizeBytes > MAX_RECEIPT_BYTES) {
    return { ok: false, reason: 'Imej melebihi had 2MB (Fasal 8).' };
  }
  if (mimeType.toLowerCase() !== ALLOWED_RECEIPT_MIME) {
    return { ok: false, reason: 'Format mesti WebP (Fasal 8 optimasi).' };
  }
  return { ok: true };
}

/**
 * mockUploadReceipt
 * Muat naik resit pelanggan ke R2 (atau mock fallback jika bucket tiada).
 * Mengembalikan kunci R2 untuk rujukan rekod_pesanan.
 */
export async function mockUploadReceipt(
  env: Env,
  orderId: string,
  imageData: BodyInit
): Promise<ReceiptUploadResult> {
  const r2Key = `receipts/${orderId}.webp`;
  try {
    if (env.R2_BUCKET) {
      await env.R2_BUCKET.put(r2Key, imageData);
    }
    // Mock: anggap berjaya walaupun R2 tiada (dev simulation)
    return { ok: true, r2Key };
  } catch (err) {
    return { ok: false, reason: `Muat naik gagal: ${(err as Error).message}` };
  }
}

/**
 * buildPaymentReceiptLayout
 * Menyusun teks resit mesra mobile untuk dipaparkan di Telegram (MarkdownV2 escape).
 */
export function buildPaymentReceiptLayout(input: PaymentReceiptInput): string {
  const esc = (s: string) => s.replace(/([._\-!()*])/g, '\\$1');
  const lines: string[] = [];
  lines.push(`*RESIT PESANAN \\- ${esc(input.merchantName)}*`);
  lines.push(`ID: \`${esc(input.orderId)}\``);
  lines.push(`Pelanggan: ${esc(input.customerName)}`);
  lines.push('\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-');
  for (const it of input.items) {
    lines.push(`${esc(it.name)} x${it.qty} = RM${(it.qty * it.price).toFixed(2)}`);
  }
  lines.push('\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-');
  lines.push(`*JUMLAH: RM${input.totalAmount.toFixed(2)}*`);
  lines.push(`Lokasi: ${input.deliveryLat.toFixed(4)}, ${input.deliveryLng.toFixed(4)}`);
  return lines.join('\n');
}

// End: JomOrder Fasa 7 - Payment Service