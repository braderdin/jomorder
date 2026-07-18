// Start: Phase 32 - Upstash Redis Session Cache (Command Session State Engine)
// Fasal 7 Strategy 2 (1-hour TTL) + Strategy 3 (cart buffer shield) + Fasal 4 (SOA).
// Cache CommandSessionState untuk elak hammer DB ketika tukar panel interaktif.
import { Env, CommandSessionState } from '../types';

const GLOBAL_PREFIX = 'jo:'; // Fasa 17 namespace prefix (multi-tenant isolation).
const SESSION_TTL_SECONDS = 3600; // 1-hour inactivity reset (Fasal 7 Strategy 2).

/** Executor generik ke Upstash Redis REST API (command array format). */
async function redisCommand(env: Env, cmd: unknown[]): Promise<unknown> {
  try {
    const res = await fetch(env.UPSTASH_REDIS_REST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
      },
      body: JSON.stringify([cmd]),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ result: unknown }>;
    return data?.[0]?.result ?? null;
  } catch {
    return null; // Soft-fail (Fasal 7 Strategy 4).
  }
}

const sessionKey = (id: number) => `${GLOBAL_PREFIX}cmd_session:${id}`;

/**
 * Tulis CommandSessionState ke Redis dengan TTL 1-jam.
 * Auto-reset selepas idle (Fasal 7 Strategy 2).
 */
export async function setCommandSession(env: Env, state: CommandSessionState): Promise<void> {
  await redisCommand(env, [
    'SET',
    sessionKey(state.telegram_id),
    JSON.stringify(state),
    'EX',
    SESSION_TTL_SECONDS,
  ]);
}

/** Baca CommandSessionState semasa; null jika tamat tempoh / tiada. */
export async function getCommandSession(
  env: Env,
  telegramId: number
): Promise<CommandSessionState | null> {
  const raw = await redisCommand(env, ['GET', sessionKey(telegramId)]);
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as CommandSessionState;
  } catch {
    return null;
  }
}

/** Gugur session state secara eksplisit (contoh: selepas checkout selesai). */
export async function clearCommandSession(env: Env, telegramId: number): Promise<void> {
  await redisCommand(env, ['DEL', sessionKey(telegramId)]);
}

/** Lanjutkan TTL session sedia ada (sentuh semula tanpa tulis semula payload). */
export async function touchCommandSession(env: Env, telegramId: number): Promise<void> {
  await redisCommand(env, ['EXPIRE', sessionKey(telegramId), SESSION_TTL_SECONDS]);
}
// End: Phase 32 - Upstash Redis Session Cache