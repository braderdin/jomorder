// Start: Phase 63 - Customer Profile + History GUI (no-command polish)
// Fasal 6 (BM UI) + Fasal 7 S1 (isolation). Profile edit inline + history
// pagination dengan BACK nested (back:customer).
import { Env } from '../types';
import { sendMessage, escapeMarkdownV2, inlineKeyboard, customerReplyKeyboard } from '../telegram';
import { handleCustomerProfileGui as showProfile } from './customer_profile';
import { handleSejarahPesanan } from './customer_archive';
import { getState, setState } from '../redis';

/**
 * handleProfileEditGui
 * Papar pilihan edit profil (nama / lokasi / padam akaun) dengan BACK.
 */
export async function handleProfileEditGui(env: Env, chatId: number, tgId: number): Promise<void> {
  try {
    const text =
      escapeMarkdownV2('👤 PROFIL SAYA\\n\\n') +
      escapeMarkdownV2('Pilih untuk kemaskini:\\n') +
      escapeMarkdownV2('• Nama paparan\\n• Kongsi lokasi\\n• Padam akaun');
    const buttons = inlineKeyboard([
      [{ text: '✏️ Nama', callback_data: 'profile_edit_name' }, { text: '📍 Lokasi', callback_data: 'share_loc' }],
      [{ text: '🗑️ Padam', callback_data: 'profile_delete' }],
      [{ text: '⬅️ Kembali', callback_data: 'back:customer' }],
    ]);
    await sendMessage(env, chatId, text, buttons, customerReplyKeyboard());
  } catch {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Ralat sistem. Cuba sebentar lagi.'));
  }
}

/**
 * handleHistoryGui
 * Papar sejarah pesanan dengan pagination inline + BACK.
 */
export async function handleHistoryGui(env: Env, chatId: number, tgId: number, page = 1): Promise<void> {
  try {
    // handleSejarahPesanan sudah hantar senarai; append BACK + pagination.
    await handleSejarahPesanan(env, chatId, tgId, page);
    const buttons = inlineKeyboard([
      page > 1 ? [{ text: '⬅️ Sebelum', callback_data: `sejarah_page:${page - 1}` }] : [{ text: '⬅️ Kembali', callback_data: 'back:customer' }],
      [{ text: '➡️ Seterus', callback_data: `sejarah_page:${page + 1}` }],
    ]);
    await sendMessage(env, chatId, escapeMarkdownV2('📄 Navigasi sejarah:'), buttons);
  } catch {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Ralat sistem. Cuba sebentar lagi.'));
  }
}

/**
 * handleProfileDeleteConfirm
 * Pengesahan padam akaun (soft delete flag).
 */
export async function handleProfileDeleteConfirm(env: Env, chatId: number, tgId: number): Promise<void> {
  try {
    const state = await getState(env, tgId);
    if (state) {
      await setState(env, { ...state, deleted_flag: true } as never);
    }
    await sendMessage(
      env,
      chatId,
      escapeMarkdownV2('🗑️ Akaun ditandakan untuk padam.\\n\\n') +
      escapeMarkdownV2('Hubungi pentadbir jika mahu aktifkan semula. Data anda kekal selamat.'),
      inlineKeyboard([[{ text: '⬅️ Kembali', callback_data: 'back:customer' }]])
    );
  } catch {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Ralat sistem. Cuba sebentar lagi.'));
  }
}
// End: Phase 63 - Customer Profile + History GUI