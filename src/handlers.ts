// Start: JomOrder Fasa 9 - Core Distributor Router (File 4)
// Fasal 4 (SOA) + Fasal 9 (modular split). Strip berat ke ./handlers/merchant & ./handlers/customer.
// Distributor sahaja: terima update, delegate ke modul khusus. Orchestrate cron maintenance.
import { Env, TelegramUpdate } from './types';
import { handleMerchantCallback, handleMerchantMessage, handleMerchantLocation } from './handlers/merchant';
import { getState, checkRateLimit, rateLimitKey } from './redis';
import { handleCustomerLocation, handleCustomerNearby, handlePayNow, handleCheckout, handleApplyCoupon, handleViewShopMenu, handleAddToCart } from './handlers/customer';
import { handleViewCart } from './handlers/customer_cart';
import { handleAdminMessage } from './handlers/admin';
import { invalidateSubscriptionCacheBatch } from './redis';
import { dispatchSubscriptionAlerts } from './services/scheduler';
import { fetchSaasMetrics, fetchPublicStats } from './services/analytics';
import { sendMessage, escapeMarkdownV2, answerCallbackQuery } from './telegram';

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

    // Start: Phase 24 - Menu browsing + interactive cart callback routing
    // Fasal 7 Strategy 3 (cart buffer) + Fasal 6 (callback delegation).
    if (data.startsWith('view_shop:')) {
      const kedaiId = data.slice('view_shop:'.length);
      if (await handleViewShopMenu(env, cbChatId, cb.from.id, kedaiId)) return;
    }
    if (data.startsWith('add_to_cart:')) {
      const parts = data.split(':');
      const itemId = parts[1] || '';
      const kedaiId = parts[2] || '';
      if (await handleAddToCart(env, cbChatId, cb.from.id, itemId, kedaiId, cb.id)) return;
    }
    // End: Phase 24 - Menu browsing + interactive cart callback routing

    // Start: Phase 25 - View Cart callback routing (dismiss spinner via handleViewCart)
    if (data.startsWith('view_cart:')) {
      if (await handleViewCart(env, cbChatId, cb.from.id, cb.id)) return;
    }
    // End: Phase 25 - View Cart callback routing

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

  // Start: Phase 25 - Localized Command Matrix (Bahasa Melayu)
  // /troli -> papar cart buffer pelanggan (handleViewCart).
  // Phase 26: Rate-limit shield (Fasal 7 Strategy 2) elak spam troli.
  // Nota: cart_buffer disimpan via setState() yang enforce EX 3600 (1-jam TTL)
  // di redis.ts -> memelihara memori cluster (Fasal 7 Strategy 3).
  if (text === '/troli') {
    if (!(await checkRateLimit(env, rateLimitKey(String(tgId))))) {
      await sendMessage(env, chatId, escapeMarkdownV2('⏳ Terlalu banyak permintaan. Cuba sebentar lagi.'));
      return;
    }
    await handleViewCart(env, chatId, tgId);
    return;
  }

  // /laporan_jualan -> agregat metrik SaaS platform (peniaga/admin) format RM.
  // Phase 26: Rate-limit shield (Fasal 7 Strategy 2) elak spam laporan.
  if (text === '/laporan_jualan') {
    if (!(await checkRateLimit(env, rateLimitKey(String(tgId))))) {
      await sendMessage(env, chatId, escapeMarkdownV2('⏳ Terlalu banyak permintaan. Cuba sebentar lagi.'));
      return;
    }
    const metrics = await fetchSaasMetrics(env);
    if (!metrics) {
      await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Gagal ambil laporan jualan. Cuba lagi sebentar.'));
      return;
    }
    const report =
      escapeMarkdownV2('📊 LAPORAN JUALAN PLATFORM:\\n\\n') +
      escapeMarkdownV2(`Peniaga Aktif: ${metrics.total_active_merchants}\\n`) +
      escapeMarkdownV2(`Stor Premium: ${metrics.total_premium_stores}\\n`) +
      escapeMarkdownV2(`Jumlah Pesanan: ${metrics.total_orders}\\n`) +
      escapeMarkdownV2(`Hasil Kumulatif: RM${metrics.total_revenue_rm.toFixed(2)}\\n`) +
      escapeMarkdownV2(`Unjuran MRR: RM${metrics.mrr_projection_rm.toFixed(2)}`);
    await sendMessage(env, chatId, report);
    return;
  }

  // /zon_operasi -> senarai 5 zon operasi kanonikal (Relational Layer matrix).
  if (text === '/zon_operasi') {
    const zones = ['Kuala Lumpur', 'Puncak Alam', 'Petaling Jaya', 'Shah Alam', 'Klang'];
    const list = zones.map((z, i) => `${i + 1}\\. ${escapeMarkdownV2(z)}`).join('\\n');
    await sendMessage(env, chatId, escapeMarkdownV2('🗺️ ZON OPERASI KAMI:\\n') + list);
    return;
  }
  // End: Phase 25 - Localized Command Matrix

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

// Start: Phase 28 - Public Stats Controller Linkage (Redis KV bindings passthrough)
// Expose unauthenticated aggregate stats untuk frontend hydration (ganti N/A).
// Dipanggil dari index.ts GET /api/public-stats (bypass webhook secret).
// Env penuh (termasuk UPSTASH_REDIS_REST_URL/TOKEN) diserahkan ke analytics
// layer supaya cache grid 60s boleh dimanfaatkan tanpa re-fetch binding.
export async function handlePublicStats(env: Env): Promise<ReturnType<typeof fetchPublicStats> extends Promise<infer T> ? T : never> {
  const payload = await fetchPublicStats(env);
  return payload;
}
// End: Phase 28 - Public Stats Controller Linkage

// End: JomOrder Fasa 9 - Core Distributor Router (File 4)
