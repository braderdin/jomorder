// Start: Phase 56 - Minigame Service "Tangkap Makanan Jatuh"
// Fasal 7 Strategy 2 (Redis state, 1-hour TTL) + Fasal 6 (mobile inline grid).
// Hiburan sahaja - TANPA kupon (Chip Besar arahan: seronok sahaja).
import { Env } from '../types';
import { getState, setState } from '../redis';

const MINIGAME_PREFIX = 'jo:minigame:';
const FOOD_EMOJI = ['🍔', '🍟', '🍕', '🌮', '🍜', '🍦', '🍩', '🍰', '🧁', '🍪'];

export interface MinigameState {
  score: number;
  round: number;
  active: boolean;
  last_catch: string;
}

/** Mula game baharu. Reset score. */
export async function startMinigame(env: Env, tgId: number): Promise<MinigameState> {
  const s: MinigameState = { score: 0, round: 1, active: true, last_catch: '' };
  await setState(env, { merchant_telegram_id: tgId, minigame: s, last_active: new Date().toISOString() } as never);
  return s;
}

/** Tekan butang tangkap - score +1, pilih emoji rawak jatuh. */
export async function pressCatch(env: Env, tgId: number): Promise<MinigameState | null> {
  const raw = await getState(env, tgId);
  const s = (raw as { minigame?: MinigameState })?.minigame;
  if (!s || !s.active) return null;
  const caught = FOOD_EMOJI[Math.floor(Math.random() * FOOD_EMOJI.length)];
  s.score += 1;
  s.round += 1;
  s.last_catch = caught;
  await setState(env, { merchant_telegram_id: tgId, minigame: s, last_active: new Date().toISOString() } as never);
  return s;
}

/** Tamat game. */
export async function endMinigame(env: Env, tgId: number): Promise<MinigameState | null> {
  const raw = await getState(env, tgId);
  const s = (raw as { minigame?: MinigameState })?.minigame;
  if (!s) return null;
  s.active = false;
  await setState(env, { merchant_telegram_id: tgId, minigame: s, last_active: new Date().toISOString() } as never);
  return s;
}

/** Ambil state semasa. */
export async function getMinigame(env: Env, tgId: number): Promise<MinigameState | null> {
  const raw = await getState(env, tgId);
  return (raw as { minigame?: MinigameState })?.minigame ?? null;
}

/** Senarai emoji makanan untuk grid paparan. */
export function foodEmojiList(): string[] {
  return FOOD_EMOJI;
}
// End: Phase 56 - Minigame Service