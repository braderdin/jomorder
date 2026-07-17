// Start: JomOrder Fasa 4 - Upstash Redis State & Cart Engine (Fail 2)
// Fasal 7 Strategy 2 (1-hour state timeout) + Strategy 3 (JSONB cart buffer)
// Fasal 4 (SOA) + Fasal 11 (env binding via wrangler.toml)
import { Env, MerchantState } from './types';

const GLOBAL_PREFIX = 'jo:'; // Fasa 17 Redis global namespace prefix (multi-tenant key isolation)
const STATE_TTL_SECONDS = 3600; // 1-hour inactivity reset (Fasal 7 Strategy 2)

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
    return null;
  }
}

const stateKey = (id: number) => `${GLOBAL_PREFIX}state:${id}`;

/**
 * Strategy 2: Persist merchant conversation step dengan 1-hour TTL window.
 * Auto-reset selepas 1 jam idle (Fasal 7 Strategy 2).
 */
export async function setState(env: Env, state: MerchantState): Promise<void> {
  await redisCommand(env, [
    'SET',
    stateKey(state.merchant_telegram_id),
    JSON.stringify(state),
    'EX',
    STATE_TTL_SECONDS,
  ]);
}

/** Baca state semasa peniaga; null jika tamat tempoh / tiada rekod. */
export async function getState(env: Env, telegramId: number): Promise<MerchantState | null> {
  const raw = await redisCommand(env, ['GET', stateKey(telegramId)]);
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as MerchantState;
  } catch {
    return null;
  }
}

// Start: Fasa 16 Codebase Dead-Code Removal - setCart/getCart/cartKey dibuang (tiada caller, Strategy 3 cart buffer beralih ke engine state)
// Start: Fasa 5 - Subscription Status Cache (Free-tier quota shield)
// Fasal 7 Strategy 2: cache langganan di Redis supaya setiap mesej masuk
// tak perlu tembak Supabase. Key namespace selari `state:{id}` engine.
const SUB_TTL_SECONDS = 300; // 5-min cache window untuk elak spike DB
const subKey = (id: number) => `${GLOBAL_PREFIX}sub:${id}`;

/** Tulis status langganan ke cache Redis (fast-path). */
export async function setSubscriptionCache(
  env: Env,
  telegramId: number,
  status: string
): Promise<void> {
  await redisCommand(env, [
    'SET',
    subKey(telegramId),
    status,
    'EX',
    SUB_TTL_SECONDS,
  ]);
}

/** Baca status langganan dari cache; null jika tiada / tamat tempoh. */
export async function getSubscriptionCache(
  env: Env,
  telegramId: number
): Promise<string | null> {
  const raw = await redisCommand(env, ['GET', subKey(telegramId)]);
  return typeof raw === 'string' ? raw : null;
}

// End: Fasa 5 - Subscription Status Cache

// Start: Fasa 6 - Subscription Cache Invalidation Hook
// Fasal 7 Strategy 2 (Redis fast-path shield).
// Dipanggil bila admin buat manual override (status langganan / tamat timestamp)
// supaya cache `sub:{id}` digugur serentak & next read paksa fetch DB segar.
export async function invalidateSubscriptionCache(
  env: Env,
  telegramId: number
): Promise<void> {
  await redisCommand(env, ['DEL', subKey(telegramId)]);
}

/** Gugur cache untuk senarai peniaga serentak (batch, untuk scheduler loop). */
export async function invalidateSubscriptionCacheBatch(
  env: Env,
  telegramIds: number[]
): Promise<void> {
  for (const id of telegramIds) {
    await invalidateSubscriptionCache(env, id);
  }
}

// End: Fasa 6 - Subscription Cache Invalidation Hook

// Start: Fasa 16 Spam Protection Rate-Limiting (Fasal 7 Strategy 2 Redis shield)
// SET key value NX EX -> atomik. Return true jika kekunci berjaya diset
// (tiada flag sebelum ini = benarkan). False jika sub-key masih wujud = sekat spam.
const RATE_LIMIT_TTL_SECONDS = 10; // short TTL window block automated PATCH spam
export async function checkRateLimit(
  env: Env,
  key: string,
  ttlSeconds: number = RATE_LIMIT_TTL_SECONDS
): Promise<boolean> {
  const result = await redisCommand(env, ['SET', key, '1', 'NX', 'EX', ttlSeconds]);
  return result === 'OK';
}
// End: Fasa 16 Spam Protection Rate-Limiting

// End: JomOrder Fasa 4 - Upstash Redis State & Cart Engine (Fail 2)
