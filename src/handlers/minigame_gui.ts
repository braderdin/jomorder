// Start: Phase 57 - Minigame GUI Handler "Pusing Roda Makanan"
// Fasal 6 (mobile inline grid, BACK button) + Fasal 7 S2 (Redis state).
// Hiburan sahaja - TANPA kupon (Chip Besar arahan: seronok sahaja).
import { Env } from '../types';
import { sendMessage, customerReplyKeyboard } from '../telegram';
import { startMinigame, pressCatch, endMinigame, getMinigame, foodEmojiList } from '../services/minigame';
import { backButton } from './navigation';

const WHEEL_EMOJI = ['🍔', '🍟', '🍕', '🌮', '🍜', '🍦', '🍩', '🍰', '🧁'];
const MINIGAME_INTRO = '🎡 *Pusing Roda Makanan Jatuh*\n\nTekan butang 🔄 untuk pusing roda!\nSetiap pusingan = +1 mata. Seronok je, tiada hadiah ya.\n\nSkor awal: 0';

/** Papar skrin minigame (callback: nav:minigame). */
export async function showMinigame(env: Env, chatId: number, tgId: number): Promise<void> {
  await startMinigame(env, tgId);
  const kb = {
    inline_keyboard: [
      [{ text: '🔄 Pusing Roda!', callback_data: 'mg:catch' }],
      [{ text: '⏹ Tamat', callback_data: 'mg:end' }],
      [backButton('nav:customer')],
    ],
  };
  await sendMessage(env, chatId, MINIGAME_INTRO, kb, customerReplyKeyboard());
}

/** Build roda emoji grid 3x3 dari food list (visual menarik). */
function wheelGrid(center: string): string {
  const list = foodEmojiList();
  const cells = [list[0], list[1], list[2], list[3], center, list[4], list[5], list[6], list[7]];
  return (
    `┌───┬───┬───┐\n` +
    `│${cells[0]}│${cells[1]}│${cells[2]}│\n` +
    `├───┼───┼───┤\n` +
    `│${cells[3]}│${center}│${cells[4]}│\n` +
    `├───┼───┼───┤\n` +
    `│${cells[5]}│${cells[6]}│${cells[7]}│\n` +
    `└───┴───┴───┘`
  );
}

/** Handler callback mg:* */
export async function handleMinigameCallback(env: Env, chatId: number, tgId: number, action: string): Promise<void> {
  if (action === 'mg:catch') {
    const s = await pressCatch(env, tgId);
    if (!s) {
      await showMinigame(env, chatId, tgId);
      return;
    }
    const grid = wheelGrid(s.last_catch);
    const kb = {
      inline_keyboard: [
        [{ text: '🔄 Pusing Lagi!', callback_data: 'mg:catch' }],
        [{ text: '⏹ Tamat', callback_data: 'mg:end' }],
        [backButton('nav:customer')],
      ],
    };
    const msg = `🎡 *Pusing Roda Makanan*\n\n${grid}\n\n${s.last_catch} Pusingan! 🎉\nSkor: *${s.score}* | Pusingan: ${s.round}`;
    await sendMessage(env, chatId, msg, kb, customerReplyKeyboard());
    return;
  }
  if (action === 'mg:end') {
    const s = await endMinigame(env, tgId);
    const score = s ? s.score : 0;
    const kb = { inline_keyboard: [[backButton('nav:customer')]] };
    await sendMessage(env, chatId, `🏁 *Game Tamat!*\nSkor akhir anda: *${score}* mata.\nTerima kasih main ya! 🍔`, kb, customerReplyKeyboard());
    return;
  }
  await showMinigame(env, chatId, tgId);
}

/** Export untuk dipanggil dari router. */
export { foodEmojiList };
// End: Phase 57 - Minigame GUI Handler