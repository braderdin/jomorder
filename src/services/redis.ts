// src/services/redis.ts
// Implementation for Redis-based AI helper cooldown management.
// Related to Phase 68b: src/services/redis.ts | setHelperFail + getHelperFail
// Fasal 11: Cloudflare Workers compatible - uses Upstash REST API via fetch (no ioredis/process)

import { Env } from '../types';

/**
 * Internal helper: Upstash Redis REST request.
 * Cloudflare Workers compatible - uses native fetch, no external deps.
 */
async function upstashRequest(
  env: Env,
  command: string,
  key: string,
  ...args: (string | number)[]
): Promise<unknown> {
  const url = `${env.UPSTASH_REDIS_REST_URL}/${command}/${encodeURIComponent(key)}${args.map((a) => `/${encodeURIComponent(String(a))}`).join('')}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`Upstash Redis error: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { result?: unknown };
  return data.result;
}

/**
 * Sets an AI helper model on cooldown in Redis.
 * @param env The environment object containing Upstash Redis credentials.
 * @param modelName The name of the AI helper model.
 * @param cooldownSeconds The duration in seconds for the cooldown period.
 */
export async function setHelperFail(env: Env, modelName: string, cooldownSeconds: number): Promise<void> {
  const key = `ai_helper_cooldown:${modelName}`;
  const currentTime = Math.floor(Date.now() / 1000);
  const expiryTimestamp = currentTime + cooldownSeconds;

  try {
    // Use SET with EX option for automatic expiration
    await upstashRequest(env, 'SET', key, expiryTimestamp.toString(), 'EX', cooldownSeconds);
    console.log(`AI helper "${modelName}" set on cooldown until ${new Date(expiryTimestamp * 1000).toISOString()}`);
  } catch (error) {
    console.error(`Error setting cooldown for AI helper "${modelName}":`, error);
  }
}

/**
 * Checks if an AI helper model is currently on cooldown.
 * @param env The environment object containing Upstash Redis credentials.
 * @param modelName The name of the AI helper model.
 * @returns An object indicating if the model is on cooldown and the remaining time in seconds.
 */
export async function getHelperFail(env: Env, modelName: string): Promise<{ onCooldown: boolean; remainingSeconds?: number }> {
  const key = `ai_helper_cooldown:${modelName}`;

  try {
    const result = await upstashRequest(env, 'GET', key) as string | null;

    if (result) {
      const expiryTimestamp = parseInt(result, 10);
      const currentTime = Math.floor(Date.now() / 1000);
      const remainingSeconds = expiryTimestamp - currentTime;

      if (remainingSeconds > 0) {
        return { onCooldown: true, remainingSeconds };
      } else {
        // Cooldown expired - delete the key
        await upstashRequest(env, 'DEL', key);
        return { onCooldown: false };
      }
    } else {
      return { onCooldown: false };
    }
  } catch (error) {
    console.error(`Error checking cooldown for AI helper "${modelName}":`, error);
    return { onCooldown: false };
  }
}

/**
 * Retrieves a value from Redis.
 * @param env The environment object containing Upstash Redis credentials.
 * @param key The key to retrieve.
 * @returns The value associated with the key, or null if not found or on error.
 */
export async function getRedis(env: Env, key: string): Promise<string | null> {
  try {
    const result = await upstashRequest(env, 'GET', key) as string | null;
    return result;
  } catch (error) {
    console.error(`Redis GET error for key "${key}":`, error);
    return null;
  }
}

/**
 * Sets a key-value pair in Redis with an expiration time.
 * @param env The environment object containing Upstash Redis credentials.
 * @param key The key to set.
 * @param value The value to set.
 * @param ttlSeconds The time-to-live in seconds.
 */
export async function setRedis(env: Env, key: string, value: string, ttlSeconds: number): Promise<void> {
  try {
    await upstashRequest(env, 'SET', key, value, 'EX', ttlSeconds);
  } catch (error) {
    console.error(`Redis SET error for key "${key}" with value "${value}" and TTL ${ttlSeconds}s:`, error);
  }
}

/**
 * Deletes a key from Redis.
 * @param env The environment object containing Upstash Redis credentials.
 * @param key The key to delete.
 */
export async function delRedis(env: Env, key: string): Promise<void> {
  try {
    await upstashRequest(env, 'DEL', key);
  } catch (error) {
    console.error(`Redis DEL error for key "${key}":`, error);
  }
}
