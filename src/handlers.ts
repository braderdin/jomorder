// Start: JomOrder Fasa 4 - Message Router & Onboarding Logic (Fail 3)
// Fasal 7 Strategy 2 (state persist) + Strategy 1 (RLS DB check)
// Fasal 6 (escape + mobile keyboard) + Fasal 4 (SOA)
import { Env, TelegramUpdate, MerchantState } from './types';
import { sendMessage, escapeMarkdownV2, merchantMenuKeyboard } from './telegram';
import { checkMerchantExists, daftarKedaiPermulaan } from './db';
import { setState, getState } from './redis';

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
  const msg = update.message;
  if (!msg?.text || !msg.from) return;

  const chatId = msg.chat.id;
  const tgId = msg.from.id;
  const text = msg.text.trim();

  // Langkah A: 💼 Menu Peniaga
  if (text === '💼 Menu Peniaga') {
    const state: MerchantState = {
      merchant_telegram_id: tgId,
      step: 'browsing_menu',
      last_active: new Date().toISOString(),
    };
    await setState(env, state);
    await sendMessage(env, chatId, escapeMarkdownV2('📋 Menu Peniaga dibuka!'), merchantMenuKeyboard());
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