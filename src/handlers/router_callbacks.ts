// Start: Phase 52 - Callback Router Extraction (Fasal 4 SOA split)
// Ekstrak callback_query routing dari handlers.ts (fail melebihi 500 baris).
// Modul ini mengandungi SEMUA routing inline button (Fasal 6 grid).
// Dipanggil dari handleUpdate() di handlers.ts bagi elak duplication.
import { Env, TelegramCallbackQuery } from '../types';
import { answerCallbackQuery, sendMessage, escapeMarkdownV2, navGrid } from '../telegram';
import { handleMerchantCallback } from './merchant';
import { handleInvoiceCallback } from './merchant_invoice';
import { handleMerchantOrderCallback } from './merchant_order';
import { handlePayNow } from './customer';
import { handleSenaraiMenu, handleSetLokasi } from './merchant';
import { handleLaporanJualan, handleDashboardQuickAction, handleExportSalesCsv } from './merchant_dashboard';
import { handleSejarahPesanan } from './customer';
import { handleHelpLocaleToggle, handleHelp } from './help';
import { handleStatus } from './status';
import { handleViewShopMenu, handleAddToCart } from './customer';
import { handleViewCart } from './customer_cart';
import { handleDeleteCouponInline, handlePromo } from './marketing_coupon';
import { handleTetapanCallback } from './settings';
import { withCommandGuard } from '../services/command_error_interceptor';
import { setNav } from './navigation';
import { handleStart } from './start';
import { handleCustomerGui, handleCustomerShopsGui } from './customer_gui';
import { handleCustomerProfileGui } from './customer_profile';
import { handleMerchantGui } from './merchant_gui';
import { handleMerchantOnboardGui } from './merchant_onboard';
import { handleFeedbackGui } from './feedback_gui';
import { handleMinigameCallback, showMinigame } from './minigame_gui';

/**
 * Route semua callback_query (inline button) ke handler khusus.
 * @returns true jika callback telah dikendalikan (tidak perlu fallback).
 */
export async function routeCallbackQuery(
  env: Env,
  cb: TelegramCallbackQuery,
  cbChatId: number
): Promise<boolean> {
  try {
    const data = cb.data || '';
    // Merchant: order lifecycle + admin approval
    if (await handleMerchantCallback(env, cb, cbChatId, data)) return true;
    // Invoice inline callback
    if (data.startsWith('view_invoice:')) {
      if (await handleInvoiceCallback(env, cb, cbChatId, data)) return true;
    }
    // Merchant order lifecycle (accept/ready/reject)
    if (
      data.startsWith('accept_order:') ||
      data.startsWith('ready_order:') ||
      data.startsWith('reject_order:')
    ) {
      if (await handleMerchantOrderCallback(env, cb, cbChatId, data)) return true;
    }
    // Customer: payment confirmation
    if (await handlePayNow(env, cb, cbChatId, data)) return true;
    // Dashboard toggle status operasi kedai
    if (data.startsWith('toggle_status:')) {
      const kedaiId = data.slice('toggle_status:'.length);
      return await handleDashboardToggleViaCb(env, cb, cbChatId, kedaiId);
    }
    // Dashboard quick actions (delegate to real handler in merchant_dashboard.ts)
    if (
      data === 'merchant_report' ||
      data === 'merchant_orders' ||
      data === 'merchant_settings' ||
      data === 'open_nearby' ||
      data === 'open_cart' ||
      data === 'open_promo' ||
      data === 'merchant_zon' ||
      data === 'upload_qr'
    ) {
      return await handleDashboardQuickAction(env, cb, cbChatId, data, cb.from.id);
    }
    // Dead callback repair: merchant_menu / merchant_analytics
    if (data === 'merchant_menu') {
      await answerCallbackQuery(env, cb.id, 'Memuatkan menu...');
      await withCommandGuard(env, cbChatId, '/senarai_menu', () => handleSenaraiMenu(env, cbChatId, cb.from.id));
      return true;
    }
    if (data === 'merchant_analytics') {
      await answerCallbackQuery(env, cb.id, 'Memuatkan analitik...');
      await withCommandGuard(env, cbChatId, '/laporan_jualan', () => handleLaporanJualan(env, cbChatId, cb.from.id));
      return true;
    }
    // History pagination
    if (data.startsWith('sejarah_page:')) {
      const page = Number(data.slice('sejarah_page:'.length)) || 1;
      await answerCallbackQuery(env, cb.id, 'Memuatkan...');
      await withCommandGuard(env, cbChatId, '/sejarah_pesanan', () => handleSejarahPesanan(env, cbChatId, cb.from.id, page));
      return true;
    }
    // Sales CSV export
    if (data.startsWith('export_sales_csv:')) {
      await answerCallbackQuery(env, cb.id, 'Menyediakan CSV...');
      await withCommandGuard(env, cbChatId, '/laporan_jualan', () => handleExportSalesCsv(env, cbChatId, cb.from.id));
      return true;
    }
    // Help locale toggle
    if (data.startsWith('help_locale:')) {
      const parts = data.slice('help_locale:'.length).split(':');
      const cat = (parts[0] || 'pelanggan') as 'peniaga' | 'pelanggan' | 'pentadbir';
      const loc = (parts[1] || 'ms') as 'ms' | 'en';
      await answerCallbackQuery(env, cb.id, 'Menukar bahasa...');
      await withCommandGuard(env, cbChatId, '/bantuan', () => handleHelpLocaleToggle(env, cbChatId, cat, loc));
      return true;
    }
    // Status refresh
    if (data === 'status_refresh') {
      await answerCallbackQuery(env, cb.id, 'Menyegarkan...');
      await withCommandGuard(env, cbChatId, '/status', () => handleStatus(env, cbChatId, cb.from.id));
      return true;
    }
    // Menu browsing + cart
    if (data.startsWith('view_shop:')) {
      const kedaiId = data.slice('view_shop:'.length);
      if (await handleViewShopMenu(env, cbChatId, cb.from.id, kedaiId)) return true;
    }
    if (data.startsWith('add_to_cart:')) {
      const parts = data.split(':');
      const itemId = parts[1] || '';
      const kedaiId = parts[2] || '';
      if (await handleAddToCart(env, cbChatId, cb.from.id, itemId, kedaiId, cb.id)) return true;
    }
    if (data.startsWith('view_cart:')) {
      if (await handleViewCart(env, cbChatId, cb.from.id, cb.id)) return true;
    }
    // Coupon inline deletion
    if (data.startsWith('del_coupon:')) {
      const kod = data.slice('del_coupon:'.length);
      await answerCallbackQuery(env, cb.id, 'Memadam kupon...');
      await handleDeleteCouponInline(env, cbChatId, cb.from.id, kod);
      return true;
    }
    // Settings callback (locale / notif / qr / zon)
    if (
      data.startsWith('set_locale:') ||
      data === 'set_notif' ||
      data === 'upload_qr' ||
      data === 'merchant_zon'
    ) {
      await answerCallbackQuery(env, cb.id, 'Menyimpan...');
      if (await handleTetapanCallback(env, cbChatId, cb.from.id, data)) return true;
    }
    // Start: Phase 55 - Navigation Grid Callbacks (BACK + BM/EN)
    if (data === 'nav:main') {
      await answerCallbackQuery(env, cb.id);
      await setNav(env, cb.from.id, 'idle');
      await sendMessage(env, cbChatId, escapeMarkdownV2('📱 Menu Utama JomOrder'), navGrid());
      return true;
    }
    if (data === 'nav:customer') {
      await answerCallbackQuery(env, cb.id);
      await setNav(env, cb.from.id, 'customer_main');
      await handleStart(env, cbChatId, cb.from, '/start');
      return true;
    }
    if (data === 'nav:merchant') {
      await answerCallbackQuery(env, cb.id);
      await setNav(env, cb.from.id, 'merchant_main');
      await handleStart(env, cbChatId, cb.from, '/start');
      return true;
    }
    if (data === 'nav:admin') {
      await answerCallbackQuery(env, cb.id);
      await sendMessage(env, cbChatId, escapeMarkdownV2('🛡️ Pentadbir: taip /admin_stats atau /pengumuman'), navGrid());
      return true;
    }
    if (data === 'nav:help') {
      await answerCallbackQuery(env, cb.id);
      await withCommandGuard(env, cbChatId, '/bantuan', () => handleHelp(env, cbChatId, cb.from));
      return true;
    }
    if (data === 'nav:lang') {
      await answerCallbackQuery(env, cb.id, 'BM/EN akan ditambah');
      await sendMessage(env, cbChatId, escapeMarkdownV2('🌐 BM/EN toggle: ciri dalam pembangunan. Default BM.'), navGrid());
      return true;
    }
    // GUI sub-menu routing
    if (data === 'open_shops') {
      await answerCallbackQuery(env, cb.id);
      await handleCustomerShopsGui(env, cbChatId, cb.from.id);
      return true;
    }
    if (data === 'open_cart') {
      await answerCallbackQuery(env, cb.id);
      await handleViewCart(env, cbChatId, cb.from.id);
      return true;
    }
    if (data === 'open_promo') {
      await answerCallbackQuery(env, cb.id);
      await handlePromo(env, cbChatId);
      return true;
    }
    if (data === 'open_history') {
      await answerCallbackQuery(env, cb.id);
      await handleSejarahPesanan(env, cbChatId, cb.from.id, 1);
      return true;
    }
    if (data === 'open_profile') {
      await answerCallbackQuery(env, cb.id);
      await handleCustomerProfileGui(env, cbChatId, cb.from.id);
      return true;
    }
    if (data === 'open_pay') {
      await answerCallbackQuery(env, cb.id);
      await handleViewCart(env, cbChatId, cb.from.id);
      return true;
    }
    if (data === 'open_review') {
      await answerCallbackQuery(env, cb.id);
      await handleFeedbackGui(env, cbChatId, cb.from.id, 0);
      return true;
    }
    if (data === 'customer_gui') {
      await answerCallbackQuery(env, cb.id);
      await handleCustomerGui(env, cbChatId, cb.from.id);
      return true;
    }
    if (data === 'merchant_gui') {
      await answerCallbackQuery(env, cb.id);
      await handleMerchantGui(env, cbChatId, cb.from.id);
      return true;
    }
    if (data === 'onboard_shop') {
      await answerCallbackQuery(env, cb.id);
      await handleMerchantOnboardGui(env, cbChatId, cb.from.id);
      return true;
    }
    if (data.startsWith('rate:')) {
      const parts = data.split(':');
      const oid = Number(parts[1] || 0);
      const stars = Number(parts[2] || 0);
      await answerCallbackQuery(env, cb.id, `${stars} bintang diterima`);
      await sendMessage(env, cbChatId, escapeMarkdownV2(`⭐ Terima kasih! Penilaian ${stars} bintang untuk #${oid} disimpan.`), navGrid());
      return true;
    }
    // End: Phase 55 - Navigation Grid Callbacks

    // Start: Phase 56 - Minigame routes
    if (data === 'nav:minigame') {
      await answerCallbackQuery(env, cb.id);
      await showMinigame(env, cbChatId, cb.from.id);
      return true;
    }
    if (data === 'open_minigame') {
      await answerCallbackQuery(env, cb.id);
      await showMinigame(env, cbChatId, cb.from.id);
      return true;
    }
    if (data.startsWith('mg:')) {
      await answerCallbackQuery(env, cb.id);
      await handleMinigameCallback(env, cbChatId, cb.from.id, data);
      return true;
    }
    // End: Phase 56 - Minigame routes

    // Spinner dismissal untuk callback tak dikenali (Fasal 7 S4)
    await answerCallbackQuery(env, cb.id, 'OK');
    return true;
  } catch {
    await answerCallbackQuery(env, cb.id, 'Sila cuba sebentar lagi');
    return true;
  }
}

// Start: Phase 52 - Dashboard toggle + quick action (moved from handlers.ts)
async function handleDashboardToggleViaCb(
  env: Env,
  cb: TelegramCallbackQuery,
  cbChatId: number,
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
    await handleMerchantDashboardRefresh(env, cbChatId, cb.from.id);
    return true;
  } catch {
    return false;
  }
}

async function handleDashboardQuickActionCb(
  env: Env,
  cb: TelegramCallbackQuery,
  cbChatId: number,
  action: string,
  tgId: number
): Promise<boolean> {
  await answerCallbackQuery(env, cb.id);
  switch (action) {
    case 'merchant_report':
      await sendMessage(env, cbChatId, escapeMarkdownV2('📊 Guna /laporan_jualan untuk lihat analitik kedai anda.'));
      return true;
    case 'merchant_orders':
      await sendMessage(env, cbChatId, escapeMarkdownV2('📦 Semak pesanan: taip /invois atau lihat butang pesanan.'));
      return true;
    case 'merchant_settings':
      await sendMessage(env, cbChatId, escapeMarkdownV2('⚙️ Tetapan: taip /tetapan untuk buka panel.'));
      return true;
    case 'open_nearby':
      await handleCustomerNearbyCb(env, cbChatId, tgId);
      return true;
    case 'open_cart':
      await handleViewCart(env, cbChatId, tgId);
      return true;
    default:
      return false;
  }
}

// Lazy import untuk elak cycle (handleMerchantDashboard / handleCustomerNearby)
async function handleMerchantDashboardRefresh(env: Env, chatId: number, tgId: number): Promise<void> {
  const { handleMerchantDashboard } = await import('./merchant_dashboard');
  await handleMerchantDashboard(env, chatId, tgId);
}
async function handleCustomerNearbyCb(env: Env, chatId: number, tgId: number): Promise<void> {
  const { handleCustomerNearby } = await import('./customer');
  await handleCustomerNearby(env, chatId, tgId);
}
// End: Phase 52 - Dashboard toggle + quick action
// End: Phase 52 - Callback Router Extraction