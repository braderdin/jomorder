// Start: JomOrder Fasa 4 - Message Router & Onboarding Logic (Fail 3)
// Fasal 7 Strategy 2 (state persist) + Strategy 1 (RLS DB check)
// Fasal 6 (escape + mobile keyboard) + Fasal 4 (SOA)
import { Env, TelegramUpdate, MerchantState } from './types';
import { sendMessage, escapeMarkdownV2, merchantMenuKeyboard, customerMenuKeyboard } from './telegram';
import { checkMerchantExists, daftarKedaiPermulaan, ambilKedaiBerhampiran } from './db';
import { setState, getState } from './redis';
import { getSubscriptionStatus, sendExpiryAlert, isExpired } from './subscription';
import { isSearchRestricted, transitionOrderStatus, OrderLifecycle } from './orders';

/** Custom keyboard: butang pendaftaran kedai (Fasal 6 max 1 btn row). */
function daftarKedaiKeyboard() {
  return {
    keyboard: [[{ text: '🏪 Daftar Kedai Saya' }]],
    resize_keyboard: true,
    one_time_keyboard: false,
  };
}

/** Routing utama untuk setiap update masuk. */
export async function handleUpdate(env: Env, update: TelegramUpdate): Promise<void> {
  // Start: Fasa 5 - Order Lifecycle callback router (PENDING->MEMASAK->DELIVERY->COMPLETED)
  // Callback data format: order_next:{orderId}:{kedaiId}:{currentStatus}
  const cb = update.callback_query;
  if (cb?.from) {
    const cbChatId = cb.message?.chat.id ?? cb.from.id;
    const data = cb.data || '';
    if (data.startsWith('order_next:')) {
      const parts = data.split(':');
      const orderId = Number(parts[1]);
      const kedaiId = parts[2] || '';
      const currentStatus = (parts[3] || 'PENDING') as OrderLifecycle;
      const subStatus = await getSubscriptionStatus(env, cb.from.id);
      const next = await transitionOrderStatus(env, orderId, kedaiId, currentStatus, subStatus);
      if (next) {
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
      return;
    }
    return; // callback lain diabaikan buat masa ini
  }
  // End: Fasa 5 - Order Lifecycle callback router

  const msg = update.message;
  if (!msg?.from) return;

  const chatId = msg.chat.id;
  const tgId = msg.from.id;

  // Fasa 5: Pelanggan hantar lokasi -> RPC ambil_kedai_berhampiran auto-exclude TAMAT
  if (msg.location) {
    const kedai = await ambilKedaiBerhampiran(env, msg.location.latitude, msg.location.longitude);
    if (kedai.length === 0) {
      await sendMessage(env, chatId, escapeMarkdownV2('Tiada kedai berdekatan dalam radius 10km 🍽️'));
      return;
    }
    const senarai = kedai
      .map((k, i) => `${i + 1}\\. ${escapeMarkdownV2(k.nama_kedai)} \\(${k.jarak_km.toFixed(1)}km\\)`)
      .join('\n');
    await sendMessage(env, chatId, escapeMarkdownV2('📍 Kedai Berdekatan:\\n') + senarai, customerMenuKeyboard());
    return;
  }

  const text = (msg.text || '').trim();

  // Langkah A: 💼 Menu Peniaga
  if (text === '💼 Menu Peniaga') {
    // Fasa 5: Semak langganan & amarankan jika TAMAT / HAMPIR_TAMAT
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
    // TAMAT masih dibenarkan akses rekod pesanan berjalan (Grace Period)
    const notis = isExpired(subStatus)
      ? ' \\(Akses pesanan berjalan dibenarkan sehingga siap\\)'
      : '';
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
    await sendMessage(
      env,
      chatId,
      escapeMarkdownV2('Taip nama kedai anda untuk mendaftar:'),
      daftarKedaiKeyboard()
    );
    return;
  }

  // Fasa 5: Pelanggan / Peniaga minta carian kedai berdekatan
  if (text === '📍 Kedai Berdekatan') {
    // Guard lapisan ke-2: halang merchant TAMAT buka carian pelanggan baharu
    const subStatus = await getSubscriptionStatus(env, tgId);
    if (isSearchRestricted(subStatus)) {
      await sendExpiryAlert(env, chatId, subStatus, 'Kedai Anda');
      await sendMessage(
        env,
        chatId,
        escapeMarkdownV2('🚫 Carian pelanggan baharu disekat \\(langganan tamat\\)\\. Sila perbaharui\\.'),
        merchantMenuKeyboard()
      );
      return;
    }
    await sendMessage(
      env,
      chatId,
      escapeMarkdownV2('Sila hantar 📍 lokasi anda untuk cari kedai berdekatan 🔎'),
      customerMenuKeyboard()
    );
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

// End: JomOrder Fasa 4 - Message Router & Onboarding Logic (Fail 3)