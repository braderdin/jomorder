// Start: JomOrder Fasa 9 - Core Distributor Router (File 4)
// Fasal 4 (SOA) + Fasal 9 (modular split). Strip berat ke ./handlers/merchant & ./handlers/customer.
// Distributor sahaja: terima update, delegate ke modul khusus. Orchestrate cron maintenance.
import { Env, TelegramUpdate } from './types';
import { handleMerchantCallback, handleMerchantMessage, handleMerchantLocation } from './handlers/merchant';
import { getState } from './redis';
import { handleCustomerLocation, handleCustomerNearby, handlePayNow, handleCheckout, handleApplyCoupon } from './handlers/customer';
import { handleAdminMessage } from './handlers/admin';
import { invalidateSubscriptionCacheBatch } from './redis';
import { dispatchSubscriptionAlerts } from './services/scheduler';
import { sendMessage, escapeMarkdownV2 } from './telegram';

/** Keyboard unified greeting (Fasal 6 max 2-3 btn/row, mobile-optimized). */
function unifiedGreetingKeyboard() {
  return {
    keyboard: [
      [{ text: '🏪 Daftar Kedai Saya' }, { text: '📍 Kedai Berdekatan' }],
      [{ text: '💼 Menu Peniaga' }, { text: '🛒 Troli' }],
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
  };
}

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

  // Start: Phase 23 - /start unified greeting menu (Fasal 6 responsive keyboard)
  if ((msg.text || '').trim() === '/start') {
    await sendMessage(
      env,
      chatId,
      escapeMarkdownV2('🤖 Selamat datang ke JomOrder! Saya pembantu pesanan makanan anda.\n\nPeniaga: daftar kedai & terima pesanan.\nPelanggan: cari kedai berdekatan & buat pesanan.'),
      unifiedGreetingKeyboard()
    );
    return;
  }
  // End: Phase 23 - /start unified greeting menu

  // Start: Phase 23 - Geolocation routing (merchant intercept vs customer pipeline)
  // Jika peniaga sedang dalam awaiting_shop_location, lokasi ke merchant handler.
  // Else, lokasi pelanggan ke customer handler (Haversine search).
  if (msg.location) {
    const mState = await getState(env, tgId);
    if (mState && mState.step === 'awaiting_shop_location') {
      await handleMerchantLocation(env, chatId, tgId, msg.location.latitude, msg.location.longitude);
      return;
    }
    await handleCustomerLocation(env, chatId, msg.location.latitude, msg.location.longitude);
    return;
  }
  // End: Phase 23 - Geolocation routing

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

  // Start: Phase 23 - Merchant state prefix routing ('merchant:' namespace guard)
  // Jika state peniaga wujud (namespace jo:state:{id}), delegate ke merchant handler.
  // Default: semua teks lain -> merchant handler (dashboard/daftar/fallback).
  const state = await getState(env, tgId);
  if (state && (state.step.startsWith('merchant:') || state.step !== 'idle')) {
    await handleMerchantMessage(env, chatId, tgId, text);
    return;
  }
  // End: Phase 23 - Merchant state prefix routing

  // Default fallback -> merchant handler
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