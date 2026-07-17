// Start: JomOrder Fasa 9 - Core Distributor Router (File 4)
// Fasal 4 (SOA) + Fasal 9 (modular split). Strip berat ke ./handlers/merchant & ./handlers/customer.
// Distributor sahaja: terima update, delegate ke modul khusus. Orchestrate cron maintenance.
import { Env, TelegramUpdate } from './types';
import { handleMerchantCallback, handleMerchantMessage } from './handlers/merchant';
import { handleCustomerLocation, handleCustomerNearby, handlePayNow, handleCheckout, handleApplyCoupon } from './handlers/customer';
import { handleAdminMessage } from './handlers/admin';
import { invalidateSubscriptionCacheBatch } from './redis';
import { dispatchSubscriptionAlerts } from './services/scheduler';

/** Routing utama — delegate ke modul merchant/customer mengikut jenis update. */
export async function handleUpdate(env: Env, update: TelegramUpdate): Promise<void> {
  // Start: Callback query router (delegate ke modul khusus)
  const cb = update.callback_query;
  if (cb?.from) {
    const cbChatId = cb.message?.chat.id ?? cb.from.id;
    const data = cb.data || '';
    // Merchant: order lifecycle + admin approval
    if (await handleMerchantCallback(env, cb, cbChatId, data)) return;
    // Customer: payment confirmation
    if (await handlePayNow(env, cb, cbChatId, data)) return;
    return; // callback lain diabaikan buat masa ini
  }
  // End: Callback query router

  const msg = update.message;
  if (!msg?.from) return;

  const chatId = msg.chat.id;
  const tgId = msg.from.id;

  // Customer: geolocation match
  if (msg.location) {
    await handleCustomerLocation(env, chatId, msg.location.latitude, msg.location.longitude);
    return;
  }

  const text = (msg.text || '').trim();

  // Customer: carian kedai berdekatan
  if (text === '📍 Kedai Berdekatan') {
    await handleCustomerNearby(env, chatId, tgId);
    return;
  }

  // Customer: checkout payload trigger
  if (text === '💳 Bayar Sekarang') {
    await handleCheckout(env, chatId, tgId);
    return;
  }

  // Start: Fasa 13 - Super-Admin delegation (Chip Besar commands)
  // Hanya terima jika tgId == ADMIN_TELEGRAM_ID (guard dalam modul admin).
  if (await handleAdminMessage(env, chatId, tgId, text)) return;
  // End: Fasa 13 - Super-Admin delegation

  // Start: Fasa 15 - Customer Coupon Router hook (resolve Fasa 14 drift)
  // Pembeli taip /kupon <KOD> -> halakan ke customer handler apply kupon ke cart buffer.
  if (text.startsWith('/kupon ')) {
    const kod = text.split(/\s+/)[1] || '';
    await handleApplyCoupon(env, chatId, tgId, kod);
    return;
  }
  // End: Fasa 15 - Customer Coupon Router hook

  // Default: semua teks lain → merchant handler (dashboard/daftar/fallback)
  await handleMerchantMessage(env, chatId, tgId, text);
}

// Start: Fasa 6 - Scheduled Maintenance Wiring (orchestration kekal di distributor)
// Dipanggil dari cron / scheduled invocation (index.ts) bagi loop automasi penuh.
export async function runScheduledMaintenance(env: Env): Promise<number> {
  const scanned = await dispatchSubscriptionAlerts(env);
  const ids = scanned.map((r) => r.telegramId);
  if (ids.length > 0) {
    await invalidateSubscriptionCacheBatch(env, ids);
  }
  return ids.length;
}
// End: Fasa 6 - Scheduled Maintenance Wiring

// End: JomOrder Fasa 9 - Core Distributor Router (File 4)