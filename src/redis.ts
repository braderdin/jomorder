// Start: JomOrder Fasa 4 - Upstash Redis State & Cart Engine (Fail 2)
// Fasal 7 Strategy 2 (1-hour state timeout) + Strategy 3 (JSONB cart buffer)
// Fasal 4 (SOA) + Fasal 11 (env binding via wrangler.toml)
import { Env, MerchantState } from './types';

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

const stateKey = (id: number) => `state:${id}`;
const cartKey = (id: number) => `cart:${id}`;

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

/**
 * Strategy 3: Buffer cart aktif pelanggan dalam JSON (lightweight).
 * Hanya commit ke rekod_pesanan bila pengesahan eksplisit.
 */
export async function setCart(
  env: Env,
  telegramId: number,
  cart: Record<string, unknown>
): Promise<void> {
  await redisCommand(env, [
    'SET',
    cartKey(telegramId),
    JSON.stringify(cart),
    'EX',
    STATE_TTL_SECONDS,
  ]);
}

/** Lookup cart buffer (ping) untuk troli pelanggan. */
export async function getCart(
  env: Env,
  telegramId: number
): Promise<Record<string, unknown> | null> {
  const raw = await redisCommand(env, ['GET', cartKey(telegramId)]);
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Start: Fasa 5 - Subscription Status Cache (Free-tier quota shield)
// Fasal 7 Strategy 2: cache langganan di Redis supaya setiap mesej masuk
// tak perlu tembak Supabase. Key namespace selari `state:{id}` engine.
const SUB_TTL_SECONDS = 300; // 5-min cache window untuk elak spike DB
const subKey = (id: number) => `sub:${id}`;

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

// End: JomOrder Fasa 4 - Upstash Redis State & Cart Engine (Fail 2)
