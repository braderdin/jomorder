// Start: JomOrder Fasa 11 - Real-time Notification Engine (File 1)
// Fasal 6 (escape + keyboard) + Fasal 7 Strategy 1 (RLS isolation by merchant_telegram_id)
// Fasal 4 (SOA) + JomOrder Modern-Siber brand identity (RM, emoji, polite MY tone).
// Core helpers: merchant new-order alert + buyer status-change alert.

import { Env } from '../types';
import { sendMessage, escapeMarkdownV2, merchantMenuKeyboard, customerMenuKeyboard } from '../telegram';

/** Payload ringkas untuk notifikasi pesanan baharu ke peniaga. */
export interface NewOrderAlert {
  orderId: number;
  orderRef: string;
  customerName: string;
  itemCount: number;
  totalAmount: number;
  merchantTelegramId: number;
}

/** Payload ringkas untuk notifikasi kemas kini status ke pembeli. */
export interface CustomerUpdateAlert {
  orderId: number;
  orderRef: string;
  customerTelegramId: number;
  previousStatus: string;
  newStatus: string;
  shopName: string;
}

/**
 * notifyMerchantNewOrder
 * Hantar alert segera ke peniaga bila pesanan baharu di-commit (status PENDING/paid).
 * Diikat ke merchant_telegram_id (Fasal 7 Strategy 1 multi-tenant isolation).
 * Soft-fail: kesilapan hantar tidak menggagalkan commit order (Fasal 7 Strategy 4).
 */
export async function notifyMerchantNewOrder(env: Env, alert: NewOrderAlert): Promise<void> {
  const caption =
    '🔔 *PESANAN BAHARU DITERIMA!*\n\n' +
    escapeMarkdownV2(`Rujukan: ${alert.orderRef}\n`) +
    escapeMarkdownV2(`Pembeli: ${alert.customerName}\n`) +
    escapeMarkdownV2(`Item: ${alert.itemCount} produk\n`) +
    escapeMarkdownV2(`Jumlah: RM${alert.totalAmount.toFixed(2)}\n\n`) +
    escapeMarkdownV2('Sila sediakan makanan dan tekan butang di bawah untuk kemas kini ✅');
  await sendMessage(env, alert.merchantTelegramId, caption, merchantMenuKeyboard());
}

/**
 * notifyCustomerOrderUpdate
 * Hantar alert masa nyata ke pembeli bila status pesanan berubah
 * (MEMASAK / DELIVERY / COMPLETED / PREPARING / DELIVERED). Diikat ke customer_telegram_id.
 * Soft-fail: kesilapan hantar di-log senyap tanpa hentikan flow (Fasal 7 Strategy 4).
 */
export async function notifyCustomerOrderUpdate(env: Env, alert: CustomerUpdateAlert): Promise<void> {
  const statusEmoji =
    alert.newStatus === 'MEMASAK' ? '🍳'
    : alert.newStatus === 'DELIVERY' ? '🛵'
    : alert.newStatus === 'COMPLETED' ? '🎉'
    : alert.newStatus === 'PREPARING' ? '👨‍🍳'
    : alert.newStatus === 'DELIVERED' ? '✅'
    : '📦';
  const caption =
    `${statusEmoji} *STATUS PESANAN KEMAS KINI*\n\n` +
    escapeMarkdownV2(`Kedai: ${alert.shopName}\n`) +
    escapeMarkdownV2(`Rujukan: ${alert.orderRef}\n`) +
    escapeMarkdownV2(`Peralihan: ${alert.previousStatus} -> ${alert.newStatus}\n\n`) +
    escapeMarkdownV2('Terima kasih menggunakan JomOrder! 🙏');
  await sendMessage(env, alert.customerTelegramId, caption, customerMenuKeyboard());
}

// Start: Phase 38 - Queue-Driven Instant Customer Dispatch
/**
 * notifyCustomerQueueUpdate
 * Fire status update segera ke chat thread pelanggan bila peniaga mutasi
 * queue (PENDING -> PREPARING -> DELIVERED). Dijana dari merchant_order.ts
 * handleQueueNextCallback. Soft-fail selamat (Fasal 7 Strategy 4).
 */
export async function notifyCustomerQueueUpdate(
  env: Env,
  customerTelegramId: number,
  orderId: string | number,
  newStatus: string
): Promise<void> {
  const msg =
    newStatus === 'PREPARING'
      ? `👨‍🍳 Pesanan #${orderId} sedang disediakan!`
      : newStatus === 'DELIVERED'
      ? `🛵 Pesanan #${orderId} telah dihantar!`
      : `📦 Pesanan #${orderId} -> ${newStatus}`;
  try {
    await sendMessage(env, customerTelegramId, escapeMarkdownV2(msg), customerMenuKeyboard());
  } catch {
    // Soft-fail (Fasal 7 Strategy 4): jangan crash flow utama.
  }
}
// End: Phase 38 - Queue-Driven Instant Customer Dispatch

// End: JomOrder Fasa 11 - Real-time Notification Engine (File 1)