// src/services/redis.ts
// Implementation for Redis-based AI helper cooldown management.
// Related to Phase 68b: src/services/redis.ts | setHelperFail + getHelperFail

// Assuming ioredis is available in the worker environment or a compatible client is used.
// For Cloudflare Workers, Upstash Redis client is typically compatible.
import Redis from 'ioredis';

// Retrieve Redis connection details from environment variables.
// These are expected to be configured in wrangler.toml and .env.local.
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

// Basic check to ensure Redis connection details are available.
if (!redisUrl || !redisToken) {
  console.error("Redis URL or Token is missing. Please ensure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set in environment variables.");
  // In a Cloudflare Worker, it might be more appropriate to throw an error or
  // handle this more robustly if Redis is critical for core functionality.
  // For this context, we log the error; a non-connecting client might be created.
}

// Initialize Redis client.
// The connection string format might vary slightly but this is a common pattern for Upstash.
const redis = new Redis(`${redisUrl}?client=ioredis&token=${redisToken}`);

/**
 * Sets an AI helper model on cooldown in Redis.
 * @param modelName The name of the AI helper model.
 * @param cooldownSeconds The duration in seconds for the cooldown period.
 */
export async function setHelperFail(modelName: string, cooldownSeconds: number): Promise<void> {
  const key = `ai_helper_cooldown:${modelName}`; // Unique key for each model's cooldown
  const currentTime = Math.floor(Date.now() / 1000);
  const expiryTimestamp = currentTime + cooldownSeconds;

  try {
    // Store the expiry timestamp (Unix epoch seconds) using SET with EX option.
    // This ensures the key automatically expires after the specified duration.
    await redis.set(key, expiryTimestamp.toString(), 'EX', cooldownSeconds);
    console.log(`AI helper "${modelName}" set on cooldown until ${new Date(expiryTimestamp * 1000).toISOString()}`);
  } catch (error) {
    console.error(`Error setting cooldown for AI helper "${modelName}":`, error);
    // In a real-world scenario, further error handling or retry logic might be needed.
  }
}

/**
 * Checks if an AI helper model is currently on cooldown.
 * @param modelName The name of the AI helper model.
 * @returns An object indicating if the model is on cooldown and the remaining time in seconds.
 */
export async function getHelperFail(modelName: string): Promise<{ onCooldown: boolean; remainingSeconds?: number }> {
  const key = `ai_helper_cooldown:${modelName}`;

  try {
    const expiryTimestampStr = await redis.get(key);

    if (expiryTimestampStr) {
      const expiryTimestamp = parseInt(expiryTimestampStr, 10);
      const currentTime = Math.floor(Date.now() / 1000);
      const remainingSeconds = expiryTimestamp - currentTime;

      // If remaining time is positive, it's still on cooldown.
      if (remainingSeconds > 0) {
        return { onCooldown: true, remainingSeconds };
      } else {
        // If remaining time is zero or negative, the cooldown has expired.
        // Proactively delete the key to clean up expired entries.
        await redis.del(key);
        return { onCooldown: false };
      }
    } else {
      // Key not found in Redis, meaning it's not on cooldown.
      return { onCooldown: false };
    }
  } catch (error) {
    console.error(`Error checking cooldown for AI helper "${modelName}":`, error);
    // In case of Redis connection errors or other issues, assume it's not on cooldown
    // to avoid blocking indefinitely. More robust error handling might be needed.
    return { onCooldown: false };
  }
}

// Note: Ensure 'ioredis' or a compatible Redis client is available in the worker environment.
// If not, a different Redis client library compatible with Cloudflare Workers might be required.

/**
 * Retrieves a value from Redis.
 * @param env The environment object containing configuration.
 * @param key The key to retrieve.
 * @returns The value associated with the key, or null if not found or on error.
 */
export async function getRedis(env: Env, key: string): Promise<string | null> {
  try {
    return await redis.get(key);
  } catch (error) {
    console.error(`Redis GET error for key "${key}":`, error);
    return null; // Assume not found/error state for non-blocking behavior
  }
}

/**
 * Sets a key-value pair in Redis with an expiration time.
 * @param env The environment object containing configuration.
 * @param key The key to set.
 * @param value The value to set.
 * @param ttlSeconds The time-to-live in seconds.
 */
export async function setRedis(env: Env, key: string, value: string, ttlSeconds: number): Promise<void> {
  try {
    await redis.set(key, value, 'EX', ttlSeconds);
  } catch (error) {
    console.error(`Redis SET error for key "${key}" with value "${value}" and TTL ${ttlSeconds}s:`, error);
    // Handle error appropriately, e.g., log, or throw if critical.
  }
}
