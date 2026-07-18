// Start: JomOrder Fasa 9 - Modular Merchant Handler (File 2)
// Fasal 4 (SOA) + Fasal 7 Strategy 2 (state) + Fasal 6 (escape/keyboard)
// Pindahan dari src/handlers.ts: onboarding, dashboard, order lifecycle, admin approval.
import { Env, MerchantState } from '../types';
import { sendMessage, escapeMarkdownV2, merchantMenuKeyboard } from '../telegram';
import { checkMerchantExists, daftarKedaiPermulaan, updateOrderState, upgradeMerchantToPremium, getMenuByKedaiId, toggleMenuAvailability } from '../db';
import { setState, getState, invalidateSubscriptionCache, checkRateLimit, rateLimitKey } from '../redis';
import { getSubscriptionStatus, sendExpiryAlert, isExpired } from '../subscription';
import { answerCallbackQuery } from '../telegram';
import { transitionOrderStatus, OrderLifecycle } from '../orders';
import { buildDecisionCaption } from '../services/admin';
import { notifyCustomerOrderUpdate } from '../services/notifications';
import { createCoupon, listCoupons } from '../services/discounts';

/** Custom keyboard: butang pendaftaran kedai (Fasal 6 max 1 btn row). */
function daftarKedaiKeyboard() {
  return {
    keyboard: [[{ text: '🏪 Daftar Kedai Saya' }]],
    resize_keyboard: true,
    one_time_keyboard: false,
  };
}

/**
 * handleMerchantCallback
 * Tangani callback milik peniaga: order lifecycle (order_next:) + admin approval
 * (approve_shop:/reject_shop:). Return true jika callback diuruskan.
 */
export async function handleMerchantCallback(
  env: Env,
  cb: { id: string; from: { id: number }; message?: { chat: { id: number } } },
  cbChatId: number,
  data: string
): Promise<boolean> {
  // Start: Fasa 5 - Order Lifecycle callback (PENDING->MEMASAK->DELIVERY->COMPLETED)
  if (data.startsWith('order_next:')) {
    const parts = data.split(':');
    const orderId = Number(parts[1]);
    const kedaiId = parts[2] || '';
    const currentStatus = (parts[3] || 'PENDING') as OrderLifecycle;
    const subStatus = await getSubscriptionStatus(env, cb.from.id);
    const next = await transitionOrderStatus(env, orderId, kedaiId, currentStatus, subStatus);
    // Fasa 11: Fetch customer_telegram_id + rujukan untuk notifikasi masa nyata.
    let customerTg = 0;
    let orderRef = `JO-${orderId}`;
    try {
      const ordUrl = `${env.SUPABASE_URL}/rest/v1/rekod_pesanan?id=eq.${orderId}&kedai_id=eq.${kedaiId}&select=pelanggan_telegram_id`;
      const ordRes = await fetch(ordUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      });
      if (ordRes.ok) {
        const rows = (await ordRes.json()) as Array<{ pelanggan_telegram_id?: string }>;
        if (Array.isArray(rows) && rows.length > 0) {
          customerTg = Number(rows[0].pelanggan_telegram_id || 0);
        }
      }
    } catch { /* soft-fail Fasal 7 Strategy 4 */ }
    if (next) {
      await updateOrderState(env, orderId, kedaiId, { status_penghantaran: next });
      // Fasa 11: Alert masa nyata ke pembeli (Real-time Engine).
      if (customerTg) {
        await notifyCustomerOrderUpdate(env, {
          orderId,
          orderRef,
          customerTelegramId: customerTg,
          previousStatus: currentStatus,
          newStatus: next,
          shopName: kedaiId,
        });
      }
      await sendMessage(
        env,
        cbChatId,
        escapeMarkdownV2(`✅ Pesanan #${orderId} dikemas kini: ${currentStatus} → ${next}`),
        merchantMenuKeyboard()
      );
    } else {
      await sendMessage(
        env,
        cbChatId,
        escapeMarkdownV2('⚠️ Tidak dapat kemas kini pesanan \\(sudah COMPLETED atau disekat grace-period\\)\\.'),
        merchantMenuKeyboard()
      );
    }
    return true;
  }
  // End: Fasa 5 - Order Lifecycle callback

  // Start: Fasa 8 - Admin Approval Gateway callback
  if (data.startsWith('approve_shop:') || data.startsWith('reject_shop:')) {
    const parts = data.split(':');
    const shopId = parts[1] || '';
    const merchantTgId = Number(parts[2] || 0);
    const approved = data.startsWith('approve_shop:');

    // Switch status_kedai di Supabase (service_role bypass RLS, Fasal 7 Strategy 1)
    const patchUrl = `${env.SUPABASE_URL}/rest/v1/senarai_kedai?id=eq.${shopId}`;
    await fetch(patchUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ status_kedai: approved ? 'DILULUSKAN' : 'DITOLAK' }),
    });

    // Clear Redis cache segera (Fasal 7 Strategy 2)
    if (merchantTgId) await invalidateSubscriptionCache(env, merchantTgId);

    // Answer callback (buang spinner) - inline fetch
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: cb.id, text: approved ? '✅ Diluluskan' : '⛔ Ditolak' }),
    });

    // Kapsyen ke admin + notifikasi terus ke peniaga
    await sendMessage(env, cbChatId, buildDecisionCaption(approved, shopId), merchantMenuKeyboard());
    if (merchantTgId) {
      await sendMessage(
        env,
        merchantTgId,
        escapeMarkdownV2(
          approved
            ? '🎉 Permohonan kedai ANDA DILULUSKAN! Anda kini boleh terima pesanan.'
            : '⛔ Permohonan kedai anda DITOLAK. Sila hubungi sokongan.'
        ),
        merchantMenuKeyboard()
      );
    }
    return true;
  }
  // End: Fasa 8 - Admin Approval Gateway callback

  // Start: Phase 37 - Menu Availability Toggle callback (toggle_menu:<ID>)
  // Peniaga togol status_tersedia item menu terus dari senarai menu (Fasal 6).
  if (data.startsWith('toggle_menu:')) {
    const menuItemId = Number(data.slice('toggle_menu:'.length));
    if (!menuItemId || Number.isNaN(menuItemId)) return true;
    const kedaiId = await getKedaiIdByMerchant(env, cb.from.id);
    if (!kedaiId) {
      await answerCallbackQuery(env, cb.id, 'Kedai tidak dijumpai');
      return true;
    }
    const ok = await toggleMenuAvailability(env, menuItemId, kedaiId);
    if (ok) {
      await answerCallbackQuery(env, cb.id, 'Status menu dikemas kini');
      // Re-render senarai menu terkini
      await handleSenaraiMenu(env, cbChatId, cb.from.id);
    } else {
      await answerCallbackQuery(env, cb.id, 'Gagal kemas kini menu');
    }
    return true;
  }
  // End: Phase 37 - Menu Availability Toggle callback

  return false;
}

/**
 * handleMerchantMessage
 * Tangani mesej teks milik peniaga: menu dashboard, pendaftaran kedai,
 * fallback daftar, dan default. (Geolocation & checkout diurus customer.ts)
 */
export async function handleMerchantMessage(
  env: Env,
  chatId: number,
  tgId: number,
  text: string
): Promise<void> {
  // Start: Fasa 15 - Premium Upsell Command (/naiktaraf)
  if (text === '/naiktaraf') {
    // Start: Fasa 18 Rate-Limit Key Centralization - guna helper rateLimitKey (jo:limit:{id})
    const limitKey = rateLimitKey(String(tgId));
    const allowed = await checkRateLimit(env, limitKey);
    if (!allowed) {
      await sendMessage(env, chatId, escapeMarkdownV2('⏳ Terlalu banyak permintaan naik taraf. Sila cuba sebentar lagi.'), merchantMenuKeyboard());
      return;
    }
    // End: Fasa 16 Spam Protection Rate-Limiting
    const exists = await checkMerchantExists(env, tgId);
    if (!exists) {
      await sendMessage(env, chatId, escapeMarkdownV2('Hai! Anda belum daftar kedai. Tekan butang di bawah untuk mula 🚀'), daftarKedaiKeyboard());
      return;
    }
    const subStatus = await getSubscriptionStatus(env, tgId);
    if ((subStatus as string) === 'PREMIUM') {
      await sendMessage(env, chatId, escapeMarkdownV2('⭐ Anda sudah akaun PREMIUM! Nikmati semua ciri eksklusif.'), merchantMenuKeyboard());
      return;
    }
    // Simulasi payment gateway check-out success (Fasa 15 flow).
    const upgraded = await upgradeMerchantToPremium(env, tgId);
    if (upgraded) {
      await sendMessage(
        env,
        chatId,
        escapeMarkdownV2('🎉 TAHNIAH! Langganan anda berjaya dinaik taraf ke PREMIUM ⭐\n\nAnda kini boleh cipta kupon diskaun, analitik lanjutan & keutamaan sokongan. Terima kasih kerana menyokong JomOrder!'),
        merchantMenuKeyboard()
      );
    } else {
      await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Gagal naik taraf buat masa ini. Sila cuba sebentar lagi.'), merchantMenuKeyboard());
    }
    return;
  }
  // End: Fasa 15 - Premium Upsell Command (/naiktaraf)

  // Start: Fasa 14 - Premium Coupon Commands (guarded)
  if (text.startsWith('/cipta_kupon') || text.startsWith('/senarai_kupon')) {
    const exists = await checkMerchantExists(env, tgId);
    if (!exists) {
      await sendMessage(env, chatId, escapeMarkdownV2('Hai! Anda belum daftar kedai. Tekan butang di bawah untuk mula 🚀'), daftarKedaiKeyboard());
      return;
    }
    const subStatus = await getSubscriptionStatus(env, tgId);
    // Guard: hanya akaun PREMIUM atau AKTIF diluluskan sahaja (premium SaaS gate)
    const premiumDiluluskan = (subStatus as string) === 'PREMIUM' || subStatus === 'AKTIF';
    if (!premiumDiluluskan) {
      await sendMessage(env, chatId, escapeMarkdownV2('🔒 Ciri kupon adalah eksklusif PREMIUM. Sila naik taraf langganan anda.'), merchantMenuKeyboard());
      return;
    }
    if (text.startsWith('/senarai_kupon')) {
      const kupon = await listCoupons(env, tgId);
      if (kupon.length === 0) {
        await sendMessage(env, chatId, escapeMarkdownV2('Tiada kupon diwujudkan lagi. Guna /cipta_kupon <KOD> <PERATUS>'), merchantMenuKeyboard());
        return;
      }
      const senaraiKupon = kupon.map((k, i) => {
        const val = k.jenis_diskaun === 'PERCENT' ? `${k.nilai_diskaun}%` : `RM${k.nilai_diskaun}`;
        const stat = k.status_aktif ? '✅' : '⛔';
        return `${i + 1}\\. ${escapeMarkdownV2(k.kod_kupon)} \\- ${val} ${stat}`;
      }).join('\n');
      await sendMessage(env, chatId, escapeMarkdownV2('🎟️ SENARAI KUPON:\n') + senaraiKupon, merchantMenuKeyboard());
      return;
    }
    // /cipta_kupon <KOD> <NILAI> [RM]
    const parts = text.split(/\s+/);
    if (parts.length < 3) {
      await sendMessage(env, chatId, escapeMarkdownV2('Format: /cipta_kupon <KOD> <PERATUS>  \\(atau tambah RM untuk jumlah tetap, contoh: /cipta_kupon POTONG5 5 RM\\)'), merchantMenuKeyboard());
      return;
    }
    const kod = parts[1].toUpperCase();
    const nilai = Number(parts[2]);
    let jenis: 'PERCENT' | 'AMOUNT' = 'PERCENT';
    if (parts[3] && parts[3].toUpperCase() === 'RM') jenis = 'AMOUNT';
    if (isNaN(nilai) || nilai <= 0) {
      await sendMessage(env, chatId, escapeMarkdownV2('Nilai diskaun mesti nombor positif.'), merchantMenuKeyboard());
      return;
    }
    if (jenis === 'PERCENT' && nilai > 100) {
      await sendMessage(env, chatId, escapeMarkdownV2('Peratus diskaun tidak boleh melebihi 100%.'), merchantMenuKeyboard());
      return;
    }
    const ok = await createCoupon(env, tgId, kod, jenis, nilai);
    if (ok) {
      const valTxt = jenis === 'PERCENT' ? `${nilai}%` : `RM${nilai}`;
      await sendMessage(env, chatId, escapeMarkdownV2(`🎟️ Kupon ${kod} berjaya diwujudkan! Diskaun: ${valTxt}`), merchantMenuKeyboard());
    } else {
      await sendMessage(env, chatId, escapeMarkdownV2('❌ Gagal cipta kupon. Kod mungkin sudah wujud atau kedai tidak dijumpai.'), merchantMenuKeyboard());
    }
    return;
  }
  // End: Fasa 14 - Premium Coupon Commands (guarded)

  // Langkah A: 💼 Menu Peniaga
  if (text === '💼 Menu Peniaga') {
    const subStatus = await getSubscriptionStatus(env, tgId);
    if (subStatus !== 'AKTIF') {
      await sendExpiryAlert(env, chatId, subStatus, 'Kedai Anda');
    }
    const state: MerchantState = {
      merchant_telegram_id: tgId,
      step: 'browsing_menu',
      last_active: new Date().toISOString(),
    };
    await setState(env, state);
    const notis = isExpired(subStatus) ? ' \\(Akses pesanan berjalan dibenarkan sehingga siap\\)' : '';
    await sendMessage(env, chatId, escapeMarkdownV2('📋 Menu Peniaga dibuka!' + notis), merchantMenuKeyboard());
    return;
  }

  // Butang pendaftaran kedai
  if (text === '🏪 Daftar Kedai Saya') {
    const state: MerchantState = {
      merchant_telegram_id: tgId,
      step: 'awaiting_shop_name',
      last_active: new Date().toISOString(),
    };
    await setState(env, state);
    await sendMessage(env, chatId, escapeMarkdownV2('Taip nama kedai anda untuk mendaftar:'), daftarKedaiKeyboard());
    return;
  }

  // Semak state sedia ada (Fasal 7 Strategy 2)
  const current = await getState(env, tgId);
  if (current?.step === 'awaiting_shop_name') {
    // Langkah B: simpan nama kedai, minta lokasi native Telegram (Fasal 7 Strategy 2).
    const next: MerchantState = {
      merchant_telegram_id: tgId,
      shop_name: text,
      step: 'awaiting_shop_location',
      last_active: new Date().toISOString(),
    };
    await setState(env, next);
    await sendMessage(
      env,
      chatId,
      escapeMarkdownV2(`📍 Terima kasih! Kedai "${text}" disimpan sementara. Sila hantar 📍 lokasi kedai anda untuk melengkapkan pendaftaran.`),
      {
        keyboard: [[{ text: '📍 Kongsi Lokasi Kedai', request_location: true }]],
        resize_keyboard: true,
        one_time_keyboard: false,
      }
    );
    return;
  }

  // Langkah B: basic text input — semak pendaftaran dalam DB
  const exists = await checkMerchantExists(env, tgId);
  if (!exists) {
    await sendMessage(
      env,
      chatId,
      escapeMarkdownV2('Hai! Anda belum daftar kedai. Tekan butang di bawah untuk mula 🚀'),
      daftarKedaiKeyboard()
    );
    return;
  }

  await sendMessage(env, chatId, escapeMarkdownV2('Menu utama JomOrder 🤖'), merchantMenuKeyboard());
}

// Start: Phase 23 - Merchant Geolocation Intercept (awaiting_shop_location)
// Tangkap native Telegram location object, kunci lat/long, dan commit ke
// senarai_kedai via daftarKedaiPermulaan (Fasal 7 Strategy 2 + Strategy 1).
// Return true jika lokasi diuruskan (halang lencongan ke customer pipeline).
export async function handleMerchantLocation(
  env: Env,
  chatId: number,
  tgId: number,
  latitude: number,
  longitude: number
): Promise<boolean> {
  const current = await getState(env, tgId);
  if (!current || current.step !== 'awaiting_shop_location') return false;

  const namaKedai = current.shop_name || 'Kedai Tanpa Nama';
  const ok = await daftarKedaiPermulaan(env, tgId, namaKedai, latitude, longitude);
  const next: MerchantState = {
    merchant_telegram_id: tgId,
    shop_name: namaKedai,
    step: ok ? 'idle' : 'awaiting_shop_location',
    last_active: new Date().toISOString(),
  };
  await setState(env, next);
  if (ok) {
    await sendMessage(
      env,
      chatId,
      escapeMarkdownV2(`✅ Kedai "${namaKedai}" berjaya didaftarkan dengan lokasi! Status: MENUNGGU PENGESAHAN. Sila tunggu kelulusan admin.`),
      merchantMenuKeyboard()
    );
  } else {
    await sendMessage(
      env,
      chatId,
      escapeMarkdownV2('❌ Gagal daftar lokasi. Sila hantar 📍 lokasi kedai anda sekali lagi.'),
      {
        keyboard: [[{ text: '📍 Kongsi Lokasi Kedai', request_location: true }]],
        resize_keyboard: true,
        one_time_keyboard: false,
      }
    );
  }
  return true;
}
// Start: Phase 37 - Merchant Catalog & Location Hooks (22-command matrix)
/**
 * handleSenaraiMenu
 * Papar menu kedai peniaga dengan inline toggle tersedia/tidak (Fasal 6).
 * Query menu_makanan ikat merchant_telegram_id -> kedai_id (Fasal 7 Strategy 1).
 */
export async function handleSenaraiMenu(
  env: Env,
  chatId: number,
  tgId: number
): Promise<void> {
  const kedaiId = await getKedaiIdByMerchant(env, tgId);
  if (!kedaiId) {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Anda belum daftar kedai. Taip 🏪 Daftar Kedai Saya.'), merchantMenuKeyboard());
    return;
  }
  const menu = await getMenuByKedaiId(env, kedaiId);
  if (menu.length === 0) {
    await sendMessage(env, chatId, escapeMarkdownV2('🍽️ Tiada hidangan dalam menu kedai anda.'), merchantMenuKeyboard());
    return;
  }
  const lines = menu
    .map((m) => `${escapeMarkdownV2(m.nama_hidangan)} \\- RM${m.harga.toFixed(2)}`)
    .join('\n');
  const keyboard = menu.map((m) => [
    {
      text: `🔄 ${m.nama_hidangan.slice(0, 20)}`,
      callback_data: `toggle_menu:${m.id}`,
    },
  ]);
  await sendMessage(
    env,
    chatId,
    escapeMarkdownV2('📋 SENARAI MENU KEDAI:\\n') + lines,
    { inline_keyboard: keyboard }
  );
}

/**
 * handleSetLokasi
 * Minta peniaga hantar 📍 lokasi native untuk override koordinat kedai runtime.
 * Set state awaiting_shop_location supaya handler geolocation intercept ambil alih.
 */
export async function handleSetLokasi(
  env: Env,
  chatId: number,
  tgId: number
): Promise<void> {
  const exists = await checkMerchantExists(env, tgId);
  if (!exists) {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Anda belum daftar kedai. Taip 🏪 Daftar Kedai Saya.'), merchantMenuKeyboard());
    return;
  }
  const next: MerchantState = {
    merchant_telegram_id: tgId,
    step: 'awaiting_shop_location',
    last_active: new Date().toISOString(),
  };
  await setState(env, next);
  await sendMessage(
    env,
    chatId,
    escapeMarkdownV2('📍 Hantar lokasi baharu kedai anda dengan butang 📍 di bawah:'),
    {
      keyboard: [[{ text: '📍 Kongsi Lokasi Kedai', request_location: true }]],
      resize_keyboard: true,
      one_time_keyboard: false,
    }
  );
}

/** Helper: dapatkan kedai_id dari merchant_telegram_id (RLS bind). */
async function getKedaiIdByMerchant(env: Env, tgId: number): Promise<string | null> {
  const url = `${env.SUPABASE_URL}/rest/v1/senarai_kedai?merchant_telegram_id=eq.${tgId}&select=id&limit=1`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ id: string }>;
    return Array.isArray(rows) && rows.length > 0 ? rows[0].id : null;
  } catch {
    return null;
  }
}
// End: Phase 37 - Merchant Catalog & Location Hooks

// End: Phase 23 - Merchant Geolocation Intercept

// End: JomOrder Fasa 9 - Modular Merchant Handler (File 2)
