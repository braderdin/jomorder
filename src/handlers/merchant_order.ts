// Start: Phase 30 - Merchant Order Lifecycle Interactive Layer (LOOP 1 File 1)
// Fasal 7 Strategy 1 (RLS multi-tenant) + Fasal 6 (interactive callback buttons)
// Fasal 4 (SOA) - controller khusus untuk callback 'accept_order:', 'ready_order:', 'reject_order:'
import { Env, OrderStatus, TelegramCallbackQuery } from '../types';
import { answerCallbackQuery, sendMessage, escapeMarkdownV2 } from '../telegram';
import { sendCustomerStatusAlert } from '../services/telegram_notify';

/** Status mapping untuk inline button lifecycle. */
const LIFECYCLE_MAP: Record<string, OrderStatus> = {
  'accept_order:': 'ACCEPTED',
  'ready_order:': 'READY',
  'reject_order:': 'REJECTED',
};

/**
 * Tukar status pesanan dalam rekod_pesanan (RLS-bound ke merchant_telegram_id).
 * Kembalian: true jika status berjaya dikemaskini, false jika gagal/rekod tiada.
 */
async function updateOrderStatus(
  env: Env,
  orderId: string,
  merchantTgId: number,
  status: OrderStatus
): Promise<boolean> {
  const url = `${env.SUPABASE_URL}/rest/v1/rekod_pesanan?order_id=eq.${encodeURIComponent(orderId)}&merchant_telegram_id=eq.${merchantTgId}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ status_pesanan: status, updated_at: new Date().toISOString() }),
  });
  return res.ok;
}

/**
 * Ambil customer_telegram_id dari rekod pesanan (RLS-bound).
 * Kembalian: string id atau null.
 */
async function fetchOrderCustomer(
  env: Env,
  orderId: string,
  merchantTgId: number
): Promise<string | null> {
  const url = `${env.SUPABASE_URL}/rest/v1/rekod_pesanan?order_id=eq.${encodeURIComponent(orderId)}&merchant_telegram_id=eq.${merchantTgId}&select=customer_telegram_id`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ customer_telegram_id: string }>;
  return rows.length > 0 ? rows[0].customer_telegram_id : null;
}

/**
 * Router utama untuk callback lifecycle pesanan peniaga.
 * Dipanggil dari handlers.ts bila data bermula dengan prefix lifecycle.
 * Kembalian: true jika callback diurus, false jika bukan bidang kuasa modul ini.
 */
export async function handleMerchantOrderCallback(
  env: Env,
  cb: TelegramCallbackQuery,
  cbChatId: number,
  data: string
): Promise<boolean> {
  let prefix: string | null = null;
  for (const p of Object.keys(LIFECYCLE_MAP)) {
    if (data.startsWith(p)) {
      prefix = p;
      break;
    }
  }
  if (!prefix) return false;

  const orderId = data.slice(prefix.length);
  const merchantTgId = cb.from.id;
  const newStatus = LIFECYCLE_MAP[prefix];

  const updated = await updateOrderStatus(env, orderId, merchantTgId, newStatus);
  if (!updated) {
    await answerCallbackQuery(env, cb.id, '⚠️ Gagal kemaskini pesanan.', true);
    return true;
  }

  // Notify pelanggan secara real-time (Fasal 6 push alert).
  const customerId = await fetchOrderCustomer(env, orderId, merchantTgId);
  let alertText = '';
  if (newStatus === 'ACCEPTED') alertText = `✅ Pesanan #${orderId} diterima! Kami sedang sediakan.`;
  else if (newStatus === 'READY') alertText = `🍱 Pesanan #${orderId} sudah SIAP! Sila ambil/terima.`;
  else if (newStatus === 'REJECTED') alertText = `❌ Maaf, pesanan #${orderId} ditolak oleh kedai.`;

  if (customerId) {
    await sendCustomerStatusAlert(env, customerId, alertText);
  }

  await answerCallbackQuery(env, cb.id, '✅ Status dikemaskini.', false);
  await sendMessage(
    env,
    cbChatId,
    escapeMarkdownV2(`📦 Pesanan #${orderId} -> ${newStatus}`),
    undefined
  );
  return true;
}
// End: Phase 30 - Merchant Order Lifecycle Interactive Layer