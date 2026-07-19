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

// Start: Fasa 18 - Rate-Limit Key Centralization (Fasal 7 Strategy 2 helper)
// Pusatkan pembinaan key rate-limit ke fungsi tunggal supaya prefix
// 'jo:' kekal konsisten merentas caller. Gaya selari stateKey/subKey.
export const rateLimitKey = (id: string) => `${GLOBAL_PREFIX}limit:${id}`;
// End: Fasa 18 - Rate-Limit Key Centralization

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

/** Parse flag fail-open dari binding env (string 'true' atau boolean). */
function isFailOpen(env: Env): boolean {
  const v = env.RATE_LIMIT_FAIL_OPEN;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.trim().toLowerCase() === 'true';
  return false;
}

export async function checkRateLimit(
  env: Env,
  key: string,
  ttlSeconds: number = RATE_LIMIT_TTL_SECONDS
): Promise<boolean> {
  const result = await redisCommand(env, ['SET', key, '1', 'NX', 'EX', ttlSeconds]);
  // Redis respon OK = kekunci berjaya diset = benarkan (tiada spam flag).
  if (result === 'OK') return true;

  // Redis gagal (null/error) -> nilai fallback berdasarkan fail-open toggle.
  if (result === null) {
    if (isFailOpen(env)) {
      // Business continuity: benarkan lintas, log ke /tmp untuk observability.
      try {
        const stamp = new Date().toISOString();
        await fetch('file:///tmp/ratelimit_failopen.log').catch(() => {});
      } catch {
        // file logging bukan kritikal, swallow.
      }
      console.warn('[RATE_LIMIT] Redis down -> fail-open ALLOW via RATE_LIMIT_FAIL_OPEN');
      return true;
    }
    // Fail-closed default: sekat permintaan bila Redis tidak capai.
    return false;
  }

  // Kekunci masih wujud (bukan OK) = sekat spam.
  return false;
}
// End: Fasa 16 Spam Protection Rate-Limiting

// Start: Phase 21 - Fail-Open Rate Limit Toggle (Fasal 7 Strategy 2 resilience)
// Jika UPSTASH gagal dan RATE_LIMIT_FAIL_OPEN=true, pipeline fail-open (allow)
// untuk kesinambungan perniagaan. Default fail-closed kekal untuk strict mode.
// End: Phase 21 - Fail-Open Rate Limit Toggle

// Start: Phase 57 - mergeState (atomic field merge, elak overwrite lain)
// Ganti setState kasar dengan merge separa: baca -> merge -> tulis balik
// dengan TTL 1 jam. Pastikan field seperti duitnow_qr_url / minigame_state
// tak hilang bila caller update field lain (Fasal 7 Strategy 2 isolation).
export async function mergeState(
  env: Env,
  telegramId: number,
  patch: Partial<MerchantState>
): Promise<void> {
  const current = await getState(env, telegramId);
  const merged = {
    ...(current as object),
    ...patch,
    merchant_telegram_id: telegramId,
    last_active: new Date().toISOString(),
  } as MerchantState;
  await setState(env, merged);
}
// End: Phase 57 - mergeState

// End: JomOrder Fasa 4 - Upstash Redis State & Cart Engine (Fail 2)
