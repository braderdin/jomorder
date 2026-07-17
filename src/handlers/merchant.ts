// Start: JomOrder Fasa 9 - Modular Merchant Handler (File 2)
// Fasal 4 (SOA) + Fasal 7 Strategy 2 (state) + Fasal 6 (escape/keyboard)
// Pindahan dari src/handlers.ts: onboarding, dashboard, order lifecycle, admin approval.
import { Env, MerchantState } from '../types';
import { sendMessage, escapeMarkdownV2, merchantMenuKeyboard } from '../telegram';
import { checkMerchantExists, daftarKedaiPermulaan, updateOrderState } from '../db';
import { setState, getState, invalidateSubscriptionCache } from '../redis';
import { getSubscriptionStatus, sendExpiryAlert, isExpired } from '../subscription';
import { transitionOrderStatus, OrderLifecycle } from '../orders';
import { buildDecisionCaption } from '../services/admin';
import { notifyCustomerOrderUpdate } from '../services/notifications';

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
      const ordUrl = `${env.SUPABASE_URL}/rest/v1/rekod_pesanan?id=eq.${orderId}&kedai_id=eq.${kedaiId}&select=customer_telegram_id,rujukan_pesanan`;
      const ordRes = await fetch(ordUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      });
      if (ordRes.ok) {
        const rows = (await ordRes.json()) as Array<{ customer_telegram_id?: string; rujukan_pesanan?: string }>;
        if (Array.isArray(rows) && rows.length > 0) {
          customerTg = Number(rows[0].customer_telegram_id || 0);
          if (rows[0].rujukan_pesanan) orderRef = rows[0].rujukan_pesanan;
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
    const ok = await daftarKedaiPermulaan(env, tgId, text);
    const next: MerchantState = {
      merchant_telegram_id: tgId,
      shop_name: text,
      step: ok ? 'idle' : 'awaiting_shop_name',
      last_active: new Date().toISOString(),
    };
    await setState(env, next);
    await sendMessage(
      env,
      chatId,
      escapeMarkdownV2(ok ? `✅ Kedai "${text}" berjaya didaftarkan!` : '❌ Gagal daftar. Cuba lagi.'),
      merchantMenuKeyboard()
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
// End: JomOrder Fasa 9 - Modular Merchant Handler (File 2)