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
import { handleMerchantInvoiceText, handleInvoiceCallback } from './handlers/merchant_invoice';
import { handleMerchantOrderCallback } from './handlers/merchant_order';
import { handleStart } from './handlers/start';
import { handleHelp } from './handlers/help';
import { handleShopMenu } from './handlers/shop_menu';
import { handleMerchantDashboard } from './handlers/merchant_dashboard';
// Start: Phase 32 - Commerce/Marketing/Admin sub-handler imports
import { handleCreateCoupon, handleListCoupons, handleDeleteCoupon, handleDeleteCouponInline } from './handlers/marketing_coupon';
import { handleCariMakan, handlePesananSaya, handleStartDeepLink } from './handlers/customer_commerce';
import { handleAdminStats, handleSenaraiPendaftaran, handleNaikTaraf } from './handlers/platform_admin';
// Start: Phase 37 - New 22-Command handler imports (merchant/customer/admin modules)
import { handleSenaraiMenu, handleSetLokasi } from './handlers/merchant';
import { handleSejarahPesanan, handleBatalkanPesanan } from './handlers/customer';
import { handlePengumumanBroadcast } from './handlers/admin';
import { fetchMerchantSalesSummary } from './services/analytics';

/** Handler /laporan_jualan - agregat jualan kedai sendiri (merchant-scoped). */
async function handleMerchantSalesSummary(env: Env, chatId: number, tgId: number): Promise<void> {
  const data = await fetchMerchantSalesSummary(env, tgId);
  if (!data) {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Gagal ambil laporan jualan kedai.'));
    return;
  }
  const text =
    escapeMarkdownV2('📊 LAPORAN JUALAN KEDAI:\\n\\n') +
    escapeMarkdownV2(`Jumlah Pesanan: ${data.total_orders}\\n`) +
    escapeMarkdownV2(`Pesanan Dibayar: ${data.paid_orders}\\n`) +
    escapeMarkdownV2(`Pendapatan: RM${data.total_earnings_rm.toFixed(2)}`);
  await sendMessage(env, chatId, text);
}
// End: Phase 37 - New 22-Command handler imports

// Start: Phase 36 - Sealed 16-Command Distributor Routing Matrix (zero dead-code)
// Satu sumber benar memetakan kesemua 16 arahan natif ke handler aktif.
// Digunakan sebagai kontrak pengesahan supaya tiada arahan terbiar (dead-code).
export const DISTRIBUTOR_COMMAND_MAP: ReadonlyArray<{
  command: string;
  handler: string;
  active: true;
}> = [
  { command: '/start', handler: 'handleStartDeepLink', active: true },
  { command: '/help', handler: 'handleHelp', active: true },
  { command: '/menu', handler: 'handleShopMenu', active: true },
  { command: '/urus', handler: 'handleMerchantDashboard', active: true },
  { command: '/cari_makan', handler: 'handleCariMakan', active: true },
  { command: '/troli', handler: 'handleViewCart', active: true },
  { command: '/pesanan_saya', handler: 'handlePesananSaya', active: true },
  { command: '/cipta_kupon', handler: 'handleCreateCoupon', active: true },
  { command: '/senarai_kupon', handler: 'handleListCoupons', active: true },
  { command: '/padam_kupon', handler: 'handleDeleteCoupon', active: true },
  { command: '/invois', handler: 'handleMerchantInvoiceText', active: true },
  { command: '/laporan_kedai', handler: 'fetchSaasMetrics', active: true },
  { command: '/zon_operasi', handler: 'inline_zones', active: true },
  { command: '/admin_stats', handler: 'handleAdminStats', active: true },
  { command: '/senarai_pendaftaran', handler: 'handleSenaraiPendaftaran', active: true },
  { command: '/naiktaraf', handler: 'handleNaikTaraf', active: true },
  { command: '/senarai_menu', handler: 'handleSenaraiMenu', active: true },
  { command: '/laporan_jualan', handler: 'handleMerchantSalesSummary', active: true },
  { command: '/set_lokasi', handler: 'handleSetLokasi', active: true },
  { command: '/sejarah_pesanan', handler: 'handleSejarahPesanan', active: true },
  { command: '/batalkan_pesanan', handler: 'handleBatalkanPesanan', active: true },
  { command: '/pengumuman', handler: 'handlePengumumanBroadcast', active: true },
];
// End: Phase 37 - Expanded 22-Command Distributor Routing Matrix (zero dead-code)
// Note: /laporan_jualan diubah dari fetchSaasMetrics (platform) ke handleMerchantSalesSummary (merchant-scoped)
// di atas; baris asal di bawah dijadikan alias platform (tidak aktif double-count).

/** Toggle status operasi kedai (BUKA <-> TUTUP) ikut RLS merchant_telegram_id. */
async function handleDashboardToggle(
  env: Env,
  cb: import('./types').TelegramCallbackQuery,
  chatId: number,
  kedaiId: string
): Promise<boolean> {
  try {
    const getUrl = `${env.SUPABASE_URL}/rest/v1/senarai_kedai?id=eq.${encodeURIComponent(kedaiId)}&select=status_kedai&limit=1`;
    const getRes = await fetch(getUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!getRes.ok) return false;
    const rows = (await getRes.json()) as Array<{ status_kedai?: string }>;
    if (!Array.isArray(rows) || rows.length === 0) return false;
    const current = rows[0].status_kedai || 'TUTUP';
    const next = current === 'BUKA' || current === 'AKTIF' ? 'TUTUP' : 'BUKA';
    const patchUrl = `${env.SUPABASE_URL}/rest/v1/senarai_kedai?id=eq.${encodeURIComponent(kedaiId)}`;
    const patchRes = await fetch(patchUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ status_kedai: next }),
    });
    if (!patchRes.ok) return false;
    await answerCallbackQuery(env, cb.id, next === 'BUKA' ? 'Kedai dibuka' : 'Kedai ditutup');
    // Re-render dashboard terkini
    await handleMerchantDashboard(env, chatId, cb.from.id);
    return true;
  } catch {
    return false; // Soft-fail (Fasal 7 Strategy 4)
  }
}

/** Quick actions dari papan pemerintah (laporan / pesanan / tetapan / carian). */
async function handleDashboardQuickAction(
  env: Env,
  cb: import('./types').TelegramCallbackQuery,
  chatId: number,
  action: string,
  tgId: number
): Promise<boolean> {
  await answerCallbackQuery(env, cb.id);
  switch (action) {
    case 'merchant_report': {
      const m = await fetchSaasMetrics(env);
      if (!m) {
        await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Gagal ambil laporan.'));
        return true;
      }
      await sendMessage(
        env,
        chatId,
        escapeMarkdownV2('📊 LAPORAN KEDAI\\n\\n') +
          escapeMarkdownV2(`Peniaga Aktif: ${m.total_active_merchants}\\n`) +
          escapeMarkdownV2(`Jumlah Pesanan: ${m.total_orders}\\n`) +
          escapeMarkdownV2(`Hasil: RM${m.total_revenue_rm.toFixed(2)}`)
      );
      return true;
    }
    case 'merchant_orders':
      await sendMessage(env, chatId, escapeMarkdownV2('📦 Semak pesanan: taip /invois atau lihat butang pesanan.'));
      return true;
    case 'merchant_settings':
      await sendMessage(env, chatId, escapeMarkdownV2('⚙️ Tetapan: taip /urus untuk buka semula papan pemerintah.'));
      return true;
    case 'open_nearby':
      await handleCustomerNearby(env, chatId, tgId);
      return true;
    case 'open_cart':
      await handleViewCart(env, chatId, tgId);
      return true;
    default:
      return false;
  }
}

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
   try {
    const cbChatId = cb.message?.chat.id ?? cb.from.id;
    const data = cb.data || '';
    // Merchant: order lifecycle + admin approval
    if (await handleMerchantCallback(env, cb, cbChatId, data)) return;
    // Start: Phase 29 - Invoice inline callback routing
    if (data.startsWith('view_invoice:')) {
      if (await handleInvoiceCallback(env, cb, cbChatId, data)) return;
    }
    // End: Phase 29 - Invoice inline callback routing
    // Start: Phase 30 - Merchant Order Lifecycle callback routing
    // Fasal 6 (interactive buttons accept/ready/reject) -> delegate ke merchant_order.
    if (
      data.startsWith('accept_order:') ||
      data.startsWith('ready_order:') ||
      data.startsWith('reject_order:')
    ) {
      if (await handleMerchantOrderCallback(env, cb, cbChatId, data)) return;
    }
    // End: Phase 30 - Merchant Order Lifecycle callback routing
    // Customer: payment confirmation
    if (await handlePayNow(env, cb, cbChatId, data)) return;

    // Start: Phase 31 - Dashboard inline callback routing (Fasal 6 interactive grid)
    // Toggle status operasi kedai + quick actions dari papan pemerintah.
    if (data.startsWith('toggle_status:')) {
      const kedaiId = data.slice('toggle_status:'.length);
      if (await handleDashboardToggle(env, cb, cbChatId, kedaiId)) return;
    }
    if (
      data === 'merchant_report' ||
      data === 'merchant_orders' ||
      data === 'merchant_settings' ||
      data === 'open_nearby' ||
      data === 'open_cart'
    ) {
      if (await handleDashboardQuickAction(env, cb, cbChatId, data, cb.from.id)) return;
    }
    // End: Phase 31 - Dashboard inline callback routing

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

    // Start: Phase 34 - Coupon inline deletion callback wiring (del_coupon:<KOD>)
    // Bridge terus ke logic pemadaman terharden (rollback buffer + audit snapshot).
    // Dismiss spinner dulu (Fasal 6 UX) sebelum delegate ke handler.
    if (data.startsWith('del_coupon:')) {
      const kod = data.slice('del_coupon:'.length);
      await answerCallbackQuery(env, cb.id, 'Memadam kupon...');
      await handleDeleteCouponInline(env, cbChatId, cb.from.id, kod);
      return;
    }
    // End: Phase 34 - Coupon inline deletion callback wiring

    // Start: Phase 35 - Callback Spinner Hardening (Fasal 7 Strategy 4)
    // Dismiss spinner untuk callback tak dikenali supaya Tiada Telegram retry hang.
    await answerCallbackQuery(env, cb.id, '✅');
    return;
    // End: Phase 35 - Callback Spinner Hardening
   } catch {
    // Phase 35: soft-fail - jawab spinner jika handler throw (elak hang).
    await answerCallbackQuery(env, cb.id, 'Sila cuba sebentar lagi');
   }
  }
  // End: Callback query router

  const msg = update.message;
  if (!msg?.from) return;

  const chatId = msg.chat.id;
  const tgId = msg.from.id;

  // Start: Phase 31 - Core Bot Command Activation Matrix (Fasal 4 SOA delegation)
  // Arahan teks di-delegate ke sub-handler khusus (LOOP 1-2 modules).
  const cmd = (msg.text || '').trim();
  if (cmd === '/help' || cmd === '/bantuan') {
    await handleHelp(env, chatId, msg.from);
    return;
  }
  if (cmd === '/menu') {
    await handleShopMenu(env, chatId);
    return;
  }
  if (cmd === '/urus' || cmd === '/dashboard') {
    await handleMerchantDashboard(env, chatId, tgId);
    return;
  }
  // Start: Phase 32 - 16-Command Activation Matrix (Commerce/Marketing/Admin)
  // Deep-link: /start dengan payload ?startapp=kedai_id=XXX.
  if (cmd.startsWith('/start')) {
    const payload = cmd.includes(' ') ? cmd.split(/\s+/)[1] : undefined;
    await handleStartDeepLink(env, chatId, msg.from, payload);
    return;
  }
  // Marketing coupon commands (merchant).
  if (cmd.startsWith('/cipta_kupon')) {
    await handleCreateCoupon(env, chatId, tgId, cmd);
    return;
  }
  if (cmd === '/senarai_kupon') {
    await handleListCoupons(env, chatId, tgId);
    return;
  }
  if (cmd.startsWith('/padam_kupon')) {
    await handleDeleteCoupon(env, chatId, tgId, cmd);
    return;
  }
  // Customer commerce commands.
  if (cmd === '/cari_makan') {
    await handleCariMakan(env, chatId, tgId);
    return;
  }
  if (cmd === '/pesanan_saya') {
    await handlePesananSaya(env, chatId, tgId);
    return;
  }
  // Admin protected commands.
  if (cmd === '/admin_stats') {
    await handleAdminStats(env, chatId, tgId);
    return;
  }
  if (cmd === '/senarai_pendaftaran') {
    await handleSenaraiPendaftaran(env, chatId, tgId);
    return;
  }
  if (cmd === '/naiktaraf') {
    await handleNaikTaraf(env, chatId, tgId);
    return;
  }
  // Start: Phase 37 - New 6-Command Activation Matrix (22-command convergence)
  if (cmd === '/senarai_menu') {
    await handleSenaraiMenu(env, chatId, tgId);
    return;
  }
  if (cmd === '/set_lokasi') {
    await handleSetLokasi(env, chatId, tgId);
    return;
  }
  if (cmd === '/sejarah_pesanan') {
    await handleSejarahPesanan(env, chatId, tgId);
    return;
  }
  if (cmd.startsWith('/batalkan_pesanan')) {
    await handleBatalkanPesanan(env, chatId, tgId, cmd);
    return;
  }
  if (cmd === '/pengumuman') {
    await handlePengumumanBroadcast(env, chatId, tgId);
    return;
  }
  if (cmd === '/laporan_jualan') {
    if (!(await checkRateLimit(env, rateLimitKey(String(tgId))))) {
      await sendMessage(env, chatId, escapeMarkdownV2('⏳ Terlalu banyak permintaan. Cuba sebentar lagi.'));
      return;
    }
    await handleMerchantSalesSummary(env, chatId, tgId);
    return;
  }
  // End: Phase 37 - New 6-Command Activation Matrix
  // End: Phase 32 - 16-Command Activation Matrix
  // End: Phase 31 - Core Bot Command Activation Matrix

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

  // Start: Phase 29 - /invois command (Digital Invoice Engine)
  // Peniaga jana invois digital MarkdownV2 untuk kedai mereka.
  if (text === '/invois') {
    if (!(await checkRateLimit(env, rateLimitKey(String(tgId))))) {
      await sendMessage(env, chatId, escapeMarkdownV2('⏳ Terlalu banyak permintaan. Cuba sebentar lagi.'));
      return;
    }
    await handleMerchantInvoiceText(env, chatId, tgId, text);
    return;
  }
  // End: Phase 29 - /invois command

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
