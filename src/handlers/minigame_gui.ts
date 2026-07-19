// Start: Phase 56 - Minigame GUI Handler "Tangkap Makanan Jatuh"
// Fasal 6 (mobile inline grid, BACK button) + Fasal 7 S2 (Redis state).
import { Env } from '../types';
import { sendMessage } from '../telegram';
import { startMinigame, pressCatch, endMinigame, getMinigame, foodEmojiList } from '../services/minigame';
import { backButton } from './navigation';

const MINIGAME_INTRO = '🎮 *Tangkap Makanan Jatuh*\n\nTekan butang 🍔 untuk tangkap makanan yang jatuh!\nSetiap tangkapan = +1 mata. Seronok je, tiada hadiah ya.\n\nSkor awal: 0';

/** Papar skrin minigame (callback: nav:minigame). */
export async function showMinigame(env: Env, chatId: number, tgId: number): Promise<void> {
  await startMinigame(env, tgId);
  const kb = {
    inline_keyboard: [
      [{ text: '🍔 Tangkap!', callback_data: 'mg:catch' }],
      [{ text: '⏹ Tamat', callback_data: 'mg:end' }],
      [backButton('nav:customer')],
    ],
  };
  await sendMessage(env, chatId, MINIGAME_INTRO, kb);
}

/** Handler callback mg:* */
export async function handleMinigameCallback(env: Env, chatId: number, tgId: number, action: string): Promise<void> {
  if (action === 'mg:catch') {
    const s = await pressCatch(env, tgId);
    if (!s) {
      await showMinigame(env, chatId, tgId);
      return;
    }
    const kb = {
      inline_keyboard: [
        [{ text: '🍔 Tangkap Lagi!', callback_data: 'mg:catch' }],
        [{ text: '⏹ Tamat', callback_data: 'mg:end' }],
        [backButton('nav:customer')],
      ],
    };
    const msg = `🎮 *Tangkap Makanan Jatuh*\n\n${s.last_catch} Ditangkap! 🎉\nSkor: *${s.score}* | Pusingan: ${s.round}`;
    await sendMessage(env, chatId, msg, kb);
    return;
  }
  if (action === 'mg:end') {
    const s = await endMinigame(env, tgId);
    const score = s ? s.score : 0;
    const kb = { inline_keyboard: [[backButton('nav:customer')]] };
    await sendMessage(env, chatId, `🏁 *Game Tamat!*\nSkor akhir anda: *${score}* mata.\nTerima kasih main ya! 🍔`, kb);
    return;
  }
  await showMinigame(env, chatId, tgId);
}

/** Export untuk dipanggil dari router. */
export { foodEmojiList };
// End: Phase 56 - Minigame GUI Handler