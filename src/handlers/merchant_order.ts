// Start: Phase 30 - Merchant Order Lifecycle Interactive Layer (LOOP 1 File 1)
// Fasal 7 Strategy 1 (RLS multi-tenant) + Fasal 6 (interactive callback buttons)
// Fasal 4 (SOA) - controller khusus untuk callback 'accept_order:', 'ready_order:', 'reject_order:'
import { Env, OrderStatus, TelegramCallbackQuery } from '../types';
import { answerCallbackQuery, sendMessage, escapeMarkdownV2, merchantMenuKeyboard, navGrid, merchantReplyKeyboard } from '../telegram';
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
  // Phase 38: align ke schema sebenar (status_penghantaran) - tutup drift Fasa 30.
  const url = `${env.SUPABASE_URL}/rest/v1/rekod_pesanan?order_id=eq.${encodeURIComponent(orderId)}&merchant_telegram_id=eq.${merchantTgId}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ status_penghantaran: status, updated_at: new Date().toISOString() }),
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

  // Start: Phase 36 - Instant Spinner Release (release UI loading button segera)
  // Lepaskan answerCallbackQuery SEBELUM async notify supaya butang client tidak
  // terkunci spinner. Ini selaras Fasal 6 interactive UX shield.
  await answerCallbackQuery(env, cb.id, '✅ Status dikemaskini.', false);
  // End: Phase 36 - Instant Spinner Release

  // Notify pelanggan secara real-time (Fasal 6 push alert).
  const customerId = await fetchOrderCustomer(env, orderId, merchantTgId);
  let alertText = '';
  if (newStatus === 'ACCEPTED') alertText = `✅ Pesanan #${orderId} diterima! Kami sedang sediakan.`;
  else if (newStatus === 'READY') alertText = `🍱 Pesanan #${orderId} sudah SIAP! Sila ambil/terima.`;
  else if (newStatus === 'REJECTED') alertText = `❌ Maaf, pesanan #${orderId} ditolak oleh kedai.`;

  if (customerId) {
    await sendCustomerStatusAlert(env, customerId, alertText);
  }

  await sendMessage(
    env,
    cbChatId,
    escapeMarkdownV2(`📦 Pesanan #${orderId} -> ${newStatus}`),
    undefined
  );
  return true;
}

// Start: Phase 38 - Live Order Queue (senarai_pesanan) state machine
/**
 * Papar queue pesanan aktif peniaga dengan inline button transition
 * PENDING -> PREPARING -> DELIVERED. Setiap callback diikat order_id + kedai_id
 * (Fasal 7 Strategy 1 RLS) supaya tiada drift multi-tenant.
 */
const QUEUE_NEXT: Record<string, string> = {
  PENDING: 'PREPARING',
  PREPARING: 'DELIVERED',
  DELIVERED: 'COMPLETED',
  COMPLETED: 'COMPLETED',
};

export async function handleMerchantOrderQueue(
  env: Env,
  chatId: number,
  merchantTgId: number
): Promise<boolean> {
  const url =
    `${env.SUPABASE_URL}/rest/v1/rekod_pesanan` +
    `?kedai_id=eq.${merchantTgId}` +
    `&status_penghantaran=in.(PENDING,PREPARING,DELIVERED)` +
    `&select=id,status_penghantaran,jumlah_harga,pelanggan_telegram_id` +
    `&order=created_at.asc&limit=20`;
  try {
    const res = await fetch(url, { method: 'GET', headers: supabaseHeaders(env) });
    if (!res.ok) {
      await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Gagal ambil senarai pesanan.'), merchantReplyKeyboard());
      return true;
    }
    const rows = (await res.json()) as Array<{
      id: number;
      status_penghantaran?: string;
      jumlah_harga?: number;
    }>;
    if (!Array.isArray(rows) || rows.length === 0) {
      await sendMessage(env, chatId, escapeMarkdownV2('📭 Tiada pesanan aktif dalam queue.'), merchantReplyKeyboard());
      return true;
    }
    const lines = rows
      .map((r) => {
        const st = r.status_penghantaran || 'PENDING';
        return `#${r.id} [${st}] RM${(Number(r.jumlah_harga) || 0).toFixed(2)}`;
      })
      .join('\n');
    const keyboard = rows.map((r) => {
      const cur = r.status_penghantaran || 'PENDING';
      const next = QUEUE_NEXT[cur] || 'DELIVERED';
      return [
        {
          text: `▶ ${next} (#${r.id})`,
          callback_data: `queue_next:${r.id}:${merchantTgId}:${cur}`,
        },
      ];
    });
    await sendMessage(
      env,
      chatId,
      escapeMarkdownV2('📋 SENARAI PESANAN AKTIF:\\n') + lines,
      { inline_keyboard: keyboard }
    );
  } catch {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Ralat baca queue pesanan.'), navGrid());
  }
  return true;
}

/**
 * Router untuk callback queue_next: (PENDING->PREPARING->DELIVERED).
 * Lepas answerCallbackQuery segera (Fasal 6 spinner guard) sebelum PATCH.
 */
export async function handleQueueNextCallback(
  env: Env,
  cb: TelegramCallbackQuery,
  cbChatId: number,
  data: string
): Promise<boolean> {
  if (!data.startsWith('queue_next:')) return false;
  const parts = data.split(':');
  const orderId = parts[1] || '';
  const merchantTgId = Number(parts[2] || cb.from.id);
  const current = (parts[3] || 'PENDING') as string;
  const next = QUEUE_NEXT[current] || 'DELIVERED';

  // Spinner release segera (Fasal 6 trap).
  await answerCallbackQuery(env, cb.id, '✅ Queue dikemaskini.', false);

  const url =
    `${env.SUPABASE_URL}/rest/v1/rekod_pesanan` +
    `?id=eq.${encodeURIComponent(orderId)}&merchant_telegram_id=eq.${merchantTgId}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { ...supabaseHeaders(env), Prefer: 'return=minimal' },
    body: JSON.stringify({ status_penghantaran: next, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    await sendMessage(env, cbChatId, escapeMarkdownV2('⚠️ Gagal kemaskini queue.'), navGrid());
    return true;
  }
  // Notify pelanggan real-time (Fasal 7 Strategy 4 soft-fail).
  try {
    const custUrl =
      `${env.SUPABASE_URL}/rest/v1/rekod_pesanan?id=eq.${encodeURIComponent(orderId)}` +
      `&merchant_telegram_id=eq.${merchantTgId}&select=customer_telegram_id`;
    const cRes = await fetch(custUrl, { method: 'GET', headers: supabaseHeaders(env) });
    if (cRes.ok) {
      const cRows = (await cRes.json()) as Array<{ customer_telegram_id?: string }>;
      if (Array.isArray(cRows) && cRows.length > 0) {
        const cid = Number(cRows[0].customer_telegram_id || 0);
        const msg =
          next === 'PREPARING'
            ? `👨‍🍳 Pesanan #${orderId} sedang disediakan!`
            : `🛵 Pesanan #${orderId} telah dihantar!`;
        if (cid) await sendCustomerStatusAlert(env, String(cid), msg);
      }
    }
  } catch { /* soft-fail */ }
  await sendMessage(env, cbChatId, escapeMarkdownV2(`📦 #${orderId} -> ${next}`), navGrid());
  return true;
}

/** Header Supabase service_role (merchant_order module). */
function supabaseHeaders(env: Env): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

// End: Phase 38 - Live Order Queue (senarai_pesanan) state machine

// End: Phase 30 - Merchant Order Lifecycle Interactive Layer
