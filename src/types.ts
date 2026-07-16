// Start: JomOrder Fasa 3 - Core Type Definitions
// Fasal 4 (Separation of Concerns) + Fasal 11 (Env Bindings)
// Standard JomOrder secret names (tiada .dev.vars dikesan, guna standard)

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

/** Cloudflare Worker Environment Bindings */
export interface Env {
  // Telegram Integration
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_SECRET_TOKEN: string; // Validates X-Telegram-Bot-Api-Secret-Token

  // Supabase Multi-Tenant DB
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;

  // Optional R2 Storage (Fasal 8)
  R2_BUCKET?: R2Bucket;

  // Optional KV / Redis State Engine (Fasal 7 Strategy 2)
  MERCHANT_STATE?: KVNamespace;
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

// End: JomOrder Fasa 3 - Core Type Definitions