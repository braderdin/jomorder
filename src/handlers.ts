// Start: JomOrder Fasa 9 - Core Distributor Router (File 4)
// Fasa 4 (SOA) + Fasa 9 (pemisahan modular). Mengalihkan beban ke ./handlers/merchant & ./handlers/customer.
// Hanya sebagai pengedar: menerima kemas kini, mendelegasikan kepada modul khusus. Mengatur penyelenggaraan cron.
import { Env, TelegramUpdate } from './types';
import { handleMerchantCallback, handleMerchantMessage, handleMerchantLocation, handleMerchantPhoto } from './handlers/merchant';
import { getState, checkRateLimit, rateLimitKey } from './redis';
import { handleCustomerLocation, handleCustomerNearby, handlePayNow, handleCheckout, handleApplyCoupon, handleViewShopMenu, handleAddToCart } from './handlers/customer';
import { handleViewCart } from './handlers/customer_cart';
import { invalidateSubscriptionCacheBatch } from './redis';
import { dispatchSubscriptionAlerts } from './services/scheduler';
import { fetchSaasMetrics, fetchPublicStats } from './services/analytics';
import { sendMessage, escapeMarkdownV2, answerCallbackQuery } from './telegram';
import { handleMerchantInvoiceText, handleInvoiceCallback } from './handlers/merchant_invoice';
import { handleMerchantOrderCallback } from './handlers/merchant_order';
import { handleStart, handleAdaptiveWelcome } from './handlers/start';
import { handleCustomerGui } from './handlers/customer_gui';
import { handleMerchantGui } from './handlers/merchant_gui';
import { handleHelp, handleHelpLocaleToggle } from './handlers/help';
import { handleShopMenu, handleMenuKedai } from './handlers/shop_menu';
import { handleTetapan, handleTetapanCallback } from './handlers/settings';
import { handleCartKosong } from './handlers/customer_cart';
import { handleBantuanLokasi } from './handlers/help';
import { handleMerchantDashboard, handleLaporanJualan, handleExportSalesCsv } from './handlers/merchant_dashboard';
// Start: Phase 53 - Remove duplicate stub (use handleLaporanJualan from merchant_dashboard)
// End: Phase 53 - Remove duplicate stub
// Start: Phase 32 - Commerce/Marketing/Admin sub-handler imports
import { handleCreateCoupon, handleListCoupons, handleDeleteCoupon, handleDeleteCouponInline, handlePromo } from './handlers/marketing_coupon';
import { handleCariMakan, handlePesananSaya, handleStartDeepLink } from './handlers/customer_commerce';
import { handleAdminStats, handleSenaraiPendaftaran, handleNaikTaraf } from './handlers/platform_admin';
// Start: Phase 37 - New 22-Command handler imports (merchant/customer/admin modules)
import { handleSenaraiMenu, handleSetLokasi } from './handlers/merchant';
import { handleProfil } from './handlers/customer';
import { handleSejarahPesanan, handleBatalkanPesanan } from './handlers/customer_archive';
import { handlePengumumanBroadcast, handleAdminMessage } from './handlers/admin';
import { handleStatus } from './handlers/status';
import { routeCallbackQuery } from './handlers/router_callbacks';
import { fetchMerchantSalesSummary } from './services/analytics';
import { withCommandGuard } from './services/command_error_interceptor';
// Start: Phase 41 - 22 Command BM Activation imports (alias + profil handler)
// daftarKedaiPermulaan datang dari db.ts (commit onboarding), handleTambahMenu dari merchant.ts.
import { daftarKedaiPermulaan } from './db';
import { handleTambahMenu } from './handlers/merchant';
import { aiMenuWriter, aiSpellCheck, aiCustomerFaq } from './services/ai_features';
import { NATIVE_COMMAND_LIST } from './types';
// End: Phase 41 - 22 Command BM Activation imports
// Start: Phase 71 - AI Spell-Checker + Customer FAQ hooks
// End: Phase 71 - AI Spell-Checker + Customer FAQ hooks
// End: Phase 37 - New 22-Command handler imports

// Start: Phase 70 - Dynamic Command Router (SSOT from NATIVE_COMMAND_LIST)
// Buat peta handler secara dinamis daripada NATIVE_COMMAND_LIST untuk elak duplikasi.
// Handler mapping: command -> handler function (dinamis ikut NATIVE_COMMAND_LIST).
const COMMAND_USERNAME_RE = /@[\w]+/g;
function normalizeCommand(raw?: string): string {
  if (!raw) return '';
  const t = raw.trim();
  if (!t) return '';
  const cleaned = t.replace(COMMAND_USERNAME_RE, '').trim();
  return cleaned;
}

/** Set semua perintah natif untuk validasi pantas (dibentuk dari NATIVE_COMMAND_LIST). */
export const ACTIVE_COMMAND_SET: ReadonlySet<string> = new Set(
  NATIVE_COMMAND_LIST.map((c) => c.command)
);
// End: Phase 70 - Dynamic Command Router (SSOT from NATIVE_COMMAND_LIST)
/** Papan kekunci ucapan bersatu (Fasa 6 maks 2-3 butang/baris, dioptimumkan untuk mudah alih). */
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

/** Routing utama — mendelegasikan kepada modul pedagang/pelanggan mengikut jenis kemas kini. */
export async function handleUpdate(env: Env, update: TelegramUpdate): Promise<void> {
  // Start: Callback query router (delegate ke modul khusus)
  // Phase 52: Ekstrak ke router_callbacks.ts (SOA split, elak fail >500 baris).
  const cb = update.callback_query;
  if (cb?.from) {
    const cbChatId = cb.message?.chat.id ?? cb.from.id;
    await routeCallbackQuery(env, cb, cbChatId);
    return;
  }
  // End: Callback query router

  const msg = update.message;
  if (!msg?.from) return;

  const chatId = msg.chat.id;
  const tgId = msg.from.id;

  const state = await getState(env, tgId); // Mengambil state di awal
  const cmd = normalizeCommand(msg.text);

  // Peta handler untuk penghalaan perintah yang lebih bersih
  const commandHandlers: { [key: string]: Function } = {
    '/start': handleStartDeepLink, // handleStartDeepLink juga mengendalikan /start tanpa payload
    '/bantuan': handleHelp,
    '/menu': handleShopMenu,
    '/menu_kedai': handleMenuKedai,
    '/tetapan': handleTetapan,
    '/cart_kosong': handleCartKosong,
    '/promo': handlePromo,
    '/bantuan_lokasi': handleBantuanLokasi,
    '/urus': handleMerchantDashboard,
    '/dashboard': handleMerchantDashboard,
    '/cipta_kupon': handleCreateCoupon,
    '/senarai_kupon': handleListCoupons,
    '/padam_kupon': handleDeleteCoupon,
    '/cari_makan': handleCariMakan,
    '/pesanan_saya': handlePesananSaya,
    '/admin_stats': handleAdminStats,
    '/senarai_pendaftaran': handleSenaraiPendaftaran,
    '/naiktaraf': handleNaikTaraf,
    '/senarai_menu': handleSenaraiMenu,
    '/set_lokasi': handleSetLokasi,
    '/sejarah_pesanan': handleSejarahPesanan,
    '/batalkan_pesanan': handleBatalkanPesanan,
    '/pengumuman': handlePengumumanBroadcast,
    '/laporan_jualan': handleLaporanJualan,
    '/daftar': handleMerchantMessage, // Onboarding flow
    '/tambah_menu': handleTambahMenu,
    '/urus_kedai': handleMerchantDashboard, // Alias
    '/senarai_pesanan': handlePesananSaya, // Alias
    '/profil': handleProfil,
    '/status': handleStatus,
    '/invois': handleMerchantInvoiceText,
    '/zon_operasi': handleMerchantMessage, // Placeholder, will be handled by merchant_onboarding if in state
  };

  // Cuba untuk menghalakan perintah menggunakan peta handler
  if (cmd && commandHandlers[cmd]) {
    // Handle special cases for commands that need specific parsing or rate limiting
    if (cmd.startsWith('/start')) {
      const payload = cmd.includes(' ') ? cmd.split(/\s+/)[1] : undefined;
      if (payload && payload.startsWith('menu')) {
        await handleCustomerGui(env, chatId, tgId);
        return;
      }
      if (payload && payload.startsWith('app')) {
        await withCommandGuard(env, chatId, '/start', () => commandHandlers[cmd](env, chatId, msg.from, payload));
        return;
      }
      await handleStart(env, chatId, msg.from); // Default /start
      return;
    }

    if (cmd.startsWith('/cipta_kupon') || cmd.startsWith('/padam_kupon')) {
      await withCommandGuard(env, chatId, cmd, () => commandHandlers[cmd](env, chatId, tgId, cmd));
      return;
    }

    if (cmd === '/laporan_jualan' || cmd === '/profil' || cmd === '/status' || cmd === '/troli' || cmd === '/invois') {
      if (!(await checkRateLimit(env, rateLimitKey(String(tgId))))) {
        await sendMessage(env, chatId, escapeMarkdownV2('⏳ Terlalu banyak permintaan. Sila cuba sebentar lagi.'));
        return;
      }
      await withCommandGuard(env, chatId, cmd, () => commandHandlers[cmd](env, chatId, tgId));
      return;
    }

    // Handle AI commands
    if (cmd.startsWith('/tambah_menu_ai')) {
      const nama = cmd.split(/\s+/).slice(1).join(' ').trim();
      if (!nama) {
        await sendMessage(env, chatId, escapeMarkdownV2('🤖 Taip nama hidangan: /tambah_menu_ai Nasi Lemak'));
        return;
      }
      await sendMessage(env, chatId, escapeMarkdownV2('🤖 AI sedang menjana menu...'));
      const hasil = await aiMenuWriter(env, nama);
      await sendMessage(env, chatId, escapeMarkdownV2(`🎨 Hasil AI:\\n${hasil}\\n\\nSalin dan gunakan di /tambah_menu.`));
      return;
    }

    // Default command handling (dinamis dari commandHandlers map)
    if (cmd && commandHandlers[cmd]) {
      await withCommandGuard(env, chatId, cmd, () => commandHandlers[cmd](env, chatId, msg.from));
    }
    return;
  }
  // End of refactored command dispatch (SSOT from NATIVE_COMMAND_LIST)

  // Start: Phase 23 - Geolocation routing (merchant intercept vs customer pipeline)
  // Jika peniaga sedang dalam awaiting_shop_location, lokasi ke merchant handler.
  // Jika peniaga sedang dalam awaiting_shop_location, lokasi akan dihantar ke merchant handler.
  // Else, lokasi pelanggan ke customer handler (Haversine search).
  // Jika tidak, lokasi pelanggan akan dihantar ke customer handler (carian Haversine).
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

  // Start: Phase 51 - Merchant Photo Upload routing (R2 QR capture)
  // Jika mesej ada imej dan peniaga dalam state awaiting_qr_upload,
  // Jika mesej mengandungi imej dan peniaga dalam state awaiting_qr_upload,
  // delegate ke handleMerchantPhoto (download Telegram -> R2 -> patch DB).
  // mendelegasikan kepada handleMerchantPhoto (muat turun Telegram -> R2 -> kemas kini DB).
  if (msg.photo && msg.photo.length > 0) {
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    const handled = await handleMerchantPhoto(env, chatId, tgId, fileId);
    if (handled) return;
  }
  // End: Phase 51 - Merchant Photo Upload routing

  const text = normalizeCommand(msg.text);

  // Customer: carian kedai berdekatan
  if (text === '📍 Kedai Berdekatan') {
    await withCommandGuard(env, chatId, 'nearby_btn', () => handleCustomerNearby(env, chatId, tgId));
    return;
  }

  // Customer: checkout payload trigger
  if (text === '💳 Bayar Sekarang') {
    await withCommandGuard(env, chatId, 'checkout_btn', () => handleCheckout(env, chatId, tgId));
    return;
  }

  // Start: Fasa 13 - Super-Admin delegation (Chip Besar commands)
  // Hanya terima jika tgId == ADMIN_TELEGRAM_ID (guard dalam modul admin).
  if (await handleAdminMessage(env, chatId, tgId, text)) return;
  // End: Fasa 13 - Super-Admin delegation

  // Start: Fasa 15 - Customer Coupon Router hook (resolve Fasa 14 drift)
  // Pembeli menaip /kupon <KOD> -> halakan kepada customer handler untuk mengaplikasikan kupon ke cart buffer.
  if (text.startsWith('/kupon ')) {
    const kod = text.split(/\s+/)[1] || '';
    await withCommandGuard(env, chatId, '/kupon', () => handleApplyCoupon(env, chatId, tgId, kod));
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
      await sendMessage(env, chatId, escapeMarkdownV2('⏳ Terlalu banyak permintaan. Sila cuba sebentar lagi.'));
      return;
    }
    await withCommandGuard(env, chatId, '/troli', () => handleViewCart(env, chatId, tgId));
    return;
  }

  // /laporan_jualan -> agregat metrik SaaS platform (peniaga/admin) format RM.
  // Phase 26: Rate-limit shield (Fasal 7 Strategy 2) elak spam laporan.
  if (text === '/laporan_jualan') {
    if (!(await checkRateLimit(env, rateLimitKey(String(tgId))))) {
      await sendMessage(env, chatId, escapeMarkdownV2('⏳ Terlalu banyak permintaan. Sila cuba sebentar lagi.'));
      return;
    }
    const metrics = await fetchSaasMetrics(env);
    if (!metrics) {
      await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Gagal mendapatkan laporan jualan. Sila cuba lagi sebentar.'));
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
  // Peniaga menjana invois digital MarkdownV2 untuk kedai mereka.
  if (text === '/invois') {
    if (!(await checkRateLimit(env, rateLimitKey(String(tgId))))) {
      await sendMessage(env, chatId, escapeMarkdownV2('⏳ Terlalu banyak permintaan. Sila cuba sebentar lagi.'));
      return;
    }
    await withCommandGuard(env, chatId, '/invois', () => handleMerchantInvoiceText(env, chatId, tgId, text));
    return;
  }
  // End: Phase 29 - /invois command

  // End: Phase 25 - Localized Command Matrix

  // Start: Phase 23 - Merchant state prefix routing ('merchant:' namespace guard)
  // Jika state peniaga wujud (namespace jo:state:{id}), delegate ke merchant handler.
  // Jika state peniaga wujud (namespace jo:state:{id}), mendelegasikan kepada merchant handler.
  // Default: semua teks lain -> merchant handler (dashboard/daftar/fallback).
  if (state && (state.step.startsWith('merchant:') || state.step !== 'idle')) { // Menggunakan state yang sudah diambil
    await handleMerchantMessage(env, chatId, tgId, text);
    return;
  }
  // End: Phase 23 - Merchant state prefix routing

  // Start: Phase 71 - AI Spell-Checker (typo command rescue)
  // Jika teks bermula dengan '/' tetapi TIDAK dikenali sebagai perintah natif,
  // panggil AI untuk membetulkan kesilapan ejaan + mencadangkan perintah yang betul (soft-fail: fallback ke merchant).
  if (text.startsWith('/')) {
    const fixed = await aiSpellCheck(env, text, (NATIVE_COMMAND_LIST as ReadonlyArray<{ command: string }>).map((c) => c.command));
    if (fixed && fixed.trim() !== text.trim() && fixed.trim().startsWith('/') && ACTIVE_COMMAND_SET.has(fixed.trim())) {
      await sendMessage(
        env,
        chatId,
        escapeMarkdownV2(`🔤 Ralat ejaan dikesan!\nMaksud anda: \`${fixed.trim()}\` ?\n\nGunakan butang /menu untuk melihat semua perintah.`)
      );
      return;
    }
  }
  // End: Phase 71 - AI Spell-Checker
  
  // Start: Phase 71 - AI Customer FAQ (free-text fallback utk pelanggan)
  // Jika teks TIDAK bermula dengan '/' dan state idle (bukan pedagang dalam aliran),
  // panggil AI FAQ untuk menjawab soalan umum pelanggan (soft-fail: fallback ke merchant).
  if (!text.startsWith('/') && (!state || state.step === 'idle')) {
    const faq = await aiCustomerFaq(env, text, 'JomOrder');
    if (faq && faq.trim().length > 0) {
      await sendMessage(
        env,
        chatId,
        escapeMarkdownV2(`🤖 *JomOrder AI:*\n${faq.trim()}\n\n(Mahu bercakap dengan pengasas? Gunakan /bantuan)`)
      );
      return;
    }
  }
  // End: Phase 71 - AI Customer FAQ

  // Default fallback -> merchant handler
  await withCommandGuard(env, chatId, 'merchant_fallback', () => handleMerchantMessage(env, chatId, tgId, text));
}

// Start: Fasa 6 - Scheduled Maintenance Wiring (orchestration kekal di distributor)
// Dipanggil dari cron / scheduled invocation (index.ts) untuk gelung automasi penuh.
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
// Memaparkan statistik agregat tanpa pengesahan untuk penghidratan frontend (menggantikan N/A).
// Dipanggil dari index.ts GET /api/public-stats (bypass webhook secret).
// Env penuh (termasuk UPSTASH_REDIS_REST_URL/TOKEN) diserahkan kepada lapisan analitik
// supaya grid cache 60s boleh dimanfaatkan tanpa perlu mengambil semula binding.
export async function handlePublicStats(env: Env): Promise<ReturnType<typeof fetchPublicStats> extends Promise<infer T> ? T : never> {
  const payload = await fetchPublicStats(env);
  return payload;
}
// End: Phase 28 - Public Stats Controller Linkage

// End: JomOrder Fasa 9 - Core Distributor Router (File 4)
