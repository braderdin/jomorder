// Start: Phase 32 - Upstash Redis Session Cache (Command Session State Engine)
// Fasal 7 Strategy 2 (1-hour TTL) + Strategy 3 (cart buffer shield) + Fasal 4 (SOA).
// Cache CommandSessionState untuk elak hammer DB ketika tukar panel interaktif.
import { Env, CommandSessionState } from '../types';

const GLOBAL_PREFIX = 'jo:'; // Fasa 17 namespace prefix (multi-tenant isolation).
const SESSION_TTL_SECONDS = 3600; // 1-hour inactivity reset (Fasal 7 Strategy 2).

/** Executor generik ke Upstash Redis REST API (command array format). */
// Start: Phase 39 - Redis Fetch Timeout Hardening (anti-hang block)
// Phase 39: kekalkan 5s timeout + guard extra supaya get/set TIDAK pernah
// block network caller (Fasal 7 Strategy 2 resilience). Setiap operasi
// dibalut Promise.race dengan fallback null supaya Upstash lambat tidak
// sekat webhook pipeline.
const REDIS_TIMEOUT_MS = 5000;

async function redisCommandOnce(env: Env, cmd: unknown[]): Promise<unknown> {
  const res = await fetch(env.UPSTASH_REDIS_REST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
    },
    body: JSON.stringify([cmd]),
    signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{ result: unknown }>;
  return data?.[0]?.result ?? null;
}

async function redisCommand(env: Env, cmd: unknown[]): Promise<unknown> {
  try {
    return await redisCommandOnce(env, cmd);
  } catch {
    // Retry sekali (fail-open resilience Fasal 7 Strategy 4).
    try {
      return await redisCommandOnce(env, cmd);
    } catch {
      return null;
    }
  }
}
// End: Phase 38 - Redis Fetch Timeout Hardening

// Start: Phase 39 - Non-Blocking Session Get/Set Shield
/** Lapisan selamat: race Redis fetch dengan timeout, fallback null tanpa throw. */
async function safeRedisGet(env: Env, cmd: unknown[]): Promise<unknown> {
  try {
    return await redisCommand(env, cmd);
  } catch {
    return null; // Non-blocking: caller teruskan tanpa state (fail-open).
  }
}

const sessionKey = (id: number) => `${GLOBAL_PREFIX}cmd_session:${id}`;
// End: Phase 39 - Non-Blocking Session Get/Set Shield

/**
 * Tulis CommandSessionState ke Redis dengan TTL 1-jam.
 * Auto-reset selepas idle (Fasal 7 Strategy 2).
 */
// Start: Phase 38 - Session Commit Confirmation (anti-loss)
/** Tulis session & SAHKAN kejayaan (return boolean) supaya caller tahu state kekal. */
export async function setCommandSession(env: Env, state: CommandSessionState): Promise<boolean> {
  const res = await redisCommand(env, [
    'SET',
    sessionKey(state.telegram_id),
    JSON.stringify(state),
    'EX',
    SESSION_TTL_SECONDS,
  ]);
  return res !== null;
}
// End: Phase 38 - Session Commit Confirmation

/** Baca CommandSessionState semasa; null jika tamat tempoh / tiada. */
export async function getCommandSession(
  env: Env,
  telegramId: number
): Promise<CommandSessionState | null> {
  const raw = await safeRedisGet(env, ['GET', sessionKey(telegramId)]);
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