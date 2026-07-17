// Start: JomOrder Fasa 9 - Core Distributor Router (File 4)
// Fasal 4 (SOA) + Fasal 9 (modular split). Strip berat ke ./handlers/merchant & ./handlers/customer.
// Distributor sahaja: terima update, delegate ke modul khusus. Orchestrate cron maintenance.
import { Env, TelegramUpdate } from './types';
import { handleMerchantCallback, handleMerchantMessage } from './handlers/merchant';
import { handleCustomerLocation, handleCustomerNearby, handlePayNow, handleCheckout } from './handlers/customer';
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