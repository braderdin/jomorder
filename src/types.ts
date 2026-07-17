// Start: JomOrder Fasa 3 - Core Type Definitions
// Fasal 4 (Separation of Concerns) + Fasal 11 (Env Bindings aligned to wrangler.toml)
// Standard JomOrder secret names (selaras dengan wrangler.toml variables & secrets)

// Cloudflare Runtime Types (minimal declare untuk compile tanpa workers-types)
declare abstract class R2Bucket {
  put(key: string, value: BodyInit): Promise<unknown>;
  get(key: string): Promise<unknown>;
  delete(key: string): Promise<void>;
}
declare abstract class KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Cloudflare Worker Environment Bindings (single source of truth = wrangler.toml) */
export interface Env {
  // Telegram Integration (Fasal 6 + Fasal 10)
  TELEGRAM_BOT_TOKEN: string; // Secret: bot API token
  X_TELEGRAM_BOT_API_SECRET_TOKEN: string; // Secret: validates X-Telegram-Bot-Api-Secret-Token header

  // Supabase Multi-Tenant DB (Fasal 7 Strategy 1 RLS)
  SUPABASE_URL: string; // Variable: project URL
  SUPABASE_ANON_KEY: string; // Variable: public anon key
  SUPABASE_SERVICE_ROLE_KEY: string; // Secret: service role (server-side only)

  // Upstash Redis State Engine (Fasal 7 Strategy 2 + Strategy 3 cart buffer)
  UPSTASH_REDIS_REST_URL: string; // Variable: REST endpoint
  UPSTASH_REDIS_REST_TOKEN: string; // Secret: REST auth token

  // Optional R2 Storage (Fasal 8 media optimization)
  R2_BUCKET?: R2Bucket;

  // Optional KV fallback state (Fasal 7 Strategy 2)
  MERCHANT_STATE?: KVNamespace;

  // Start: Phase 21 - Fail-Open Rate Limit Toggle (Fasal 7 Strategy 2 resilience)
  // Bila 'true', rate-limiter benarkan lintas jika Upstash Redis gagal.
  RATE_LIMIT_FAIL_OPEN?: string | boolean; // Variable/Secret: fail-open pipeline
  // End: Phase 21 - Fail-Open Rate Limit Toggle

  // Start: Fasa 9 - Environment Hardening (align 1:1 dengan wrangler.toml + .dev.vars)
  // Hapus hardcoded config state.
  ADMIN_TELEGRAM_ID: string; // Variable: admin gateway Telegram ID (Fasa 8 approval)
  R2_PUBLIC_URL: string; // Variable: public R2 CDN base URL (Fasal 8 media)
  // End: Fasa 9 - Environment Hardening

  // Start: Phase 28 - Public Redis Caching Grid config (Fasal 11 alignment)
  // PUBLIC_STATS_TTL=60 -> sepadan dengan cache window analytics.ts.
  PUBLIC_STATS_TTL?: string | number; // Variable: public stats cache lifespan (saat)
  // End: Phase 28 - Public Redis Caching Grid config
}

/** Safe public cache payload (Phase 28 - elak compilation drift). */
export interface PublicStatsCache {
  total_shops: number;
  total_orders: number;
  total_gmv_rm: number;
  status: 'OK' | 'CACHED' | 'DEGRADED';
  cached_at?: string; // ISO timestamp bila payload di-cache
}

/** Telegram Incoming Update Payload (subset untuk Fasa 3) */
export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  location?: TelegramLocation;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
}

export interface TelegramLocation {
  latitude: number;
  longitude: number;
}

/** Multi-Tenant Merchant State Engine (Fasal 7 Strategy 2) */
export type MerchantStep =
  | 'idle'
  | 'awaiting_shop_name'
  | 'awaiting_shop_location'
  | 'awaiting_location'
  | 'browsing_menu'
  | 'awaiting_order_confirm';

export interface MerchantState {
  merchant_telegram_id: number;
  shop_name?: string;
  step: MerchantStep;
  cart_buffer?: Record<string, unknown>; // Fasal 7 Strategy 3 JSONB
  last_active: string; // ISO timestamp untuk 1-hour timeout
}

/** Telegram API Response wrapper */
export interface TelegramApiResponse {
  ok: boolean;
  result?: unknown;
  description?: string;
}

// Start: Phase 29 - Invoice & Analytics Type Schemas (Fasal 4 SOA single source)
// Re-eksport kontrak Invoice dari engine (services/invoice) supaya semua modul
// share schema tunggal tanpa duplikasi. Type-only import elak cycle runtime.
export type { Invoice, InvoiceLineItem, InvoiceQueryBoundary } from './services/invoice';

/** Sempadan query analitik pilihan (digunakan invoice + analytics layer). */
export interface AnalyticsQueryBoundary {
  since?: string; // ISO timestamp bawah
  until?: string; // ISO timestamp atas
  had?: number; // had baris
}
// End: Phase 29 - Invoice & Analytics Type Schemas

// End: JomOrder Fasa 3 - Core Type Definitions
