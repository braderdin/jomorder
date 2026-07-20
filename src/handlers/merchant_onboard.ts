// Start: Phase 55 - Merchant Onboarding GUI (Fasal 6 mobile grid + BACK)
// Pandu peniaga daftar kedai tanpa /command. Setiap step ada BACK.
import { Env } from '../types';
import { sendMessage, escapeMarkdownV2, merchantReplyKeyboard, inlineKeyboard } from '../telegram';
import { setNav } from './navigation';
import { getState, setState } from '../redis';

/** Papar langkah pendaftaran kedai (GUI). */
export async function handleMerchantOnboardGui(
  env: Env,
  chatId: number,
  tgId: number
): Promise<void> {
  await setNav(env, tgId, 'merchant_main');
  const text =
    escapeMarkdownV2('🏪 *DAFTAR KEDAI BARU*\\n\\n') +
    escapeMarkdownV2('Langkah pendaftaran:\\n') +
    escapeMarkdownV2('1️⃣ Nama kedai\\n') +
    escapeMarkdownV2('2️⃣ Kongsi lokasi 📍\\n') +
    escapeMarkdownV2('3️⃣ Muat naik QR DuitNow\\n\\n') +
    escapeMarkdownV2('Tekan butang untuk mula. Semua tanpa taip command!');
  const kb = {
    inline_keyboard: [
      [{ text: '✏️ Isi Nama Kedai', callback_data: 'onboard_name' }],
      [{ text: '📍 Kongsi Lokasi', callback_data: 'share_loc' }],
      [{ text: '📤 Muat Naik QR', callback_data: 'upload_qr' }],
      [{ text: '⬅️ Kembali', callback_data: 'nav:main' }],
    ],
  };
  await sendMessage(env, chatId, text, kb, merchantReplyKeyboard());
}

/**
 * handleOnboardNamePrompt - dipanggil bila user tekan onboard_name.
 * Set state step='awaiting_shop_name', hantar prompt + BACK.
 */
export async function handleOnboardNamePrompt(
  env: Env,
  chatId: number,
  tgId: number
): Promise<void> {
  await setState(env, {
    merchant_telegram_id: tgId,
    step: 'awaiting_shop_name',
    last_active: new Date().toISOString(),
  } as never);
  const kb = inlineKeyboard([[ { text: '⬅️ Kembali', callback_data: 'onboard_shop' } ]]);
  await sendMessage(env, chatId, escapeMarkdownV2('✏️ Sila taip NAMA KEDAI anda di ruang chat.\\n\\nContoh: Kedai Nasi Ayam Mak Mah'), kb);
}

/**
 * handleOnboardShareLoc - kongsi lokasi via native Telegram location request.
 */
export async function handleOnboardShareLoc(
  env: Env,
  chatId: number,
  tgId: number
): Promise<void> {
  await setState(env, {
    merchant_telegram_id: tgId,
    step: 'awaiting_lokasi',
    last_active: new Date().toISOString(),
  } as never);
  const kb = { keyboard: [[{ text: '📍 Kongsi Lokasi Sekarang', request_location: true }]], resize_keyboard: true, one_time_keyboard: true };
  await sendMessage(env, chatId, escapeMarkdownV2('📍 Tekan butang di bawah untuk kongsi lokasi kedai anda:'), kb);
}
// End: Phase 55 - Merchant Onboarding GUI
