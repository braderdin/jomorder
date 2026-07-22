// Start: JomOrder Fasa 3 - Core Type Definitions
// Fasal 4 (Separation of Concerns) + Fasal 11 (Env Bindings aligned to wrangler.toml)
// Standard JomOrder secret names (selaras dengan wrangler.toml variables & secrets)

// Cloudflare Runtime Types (minimal declare untuk compile tanpa workers-types)
// Cloudflare Runtime Types (deklarasi minimum untuk kompilasi tanpa workers-types)
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
// Start: Phase 39 - TELEGRAM_BOT_TOKEN Binding Harmonization (Fasal 11 + Fasal 4)
// Nama binding WAJIB sepadan 1:1 dengan secret wrangler.toml + .dev.vars.
// Sebarang 'implicit any' dihapuskan; token diiktiraf sebagai string wajib supaya
// kompilasi telegram.ts lulus tanpa hanyutan (tiada optional chaining yang terputus).
TELEGRAM_BOT_TOKEN: string; // Secret: bot API token (canonical, non-optional)
// End: Phase 39 - TELEGRAM_BOT_TOKEN Binding Harmonization
  X_TELEGRAM_BOT_API_SECRET_TOKEN: string; // Secret: validates X-Telegram-Bot-Api-Secret-Token header

  // Supabase Multi-Tenant DB (Fasal 7 Strategy 1 RLS)
  SUPABASE_URL: string; // Pemboleh ubah: URL projek
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
  // Apabila 'true', rate-limiter membenarkan laluan jika Upstash Redis gagal.
  RATE_LIMIT_FAIL_OPEN?: string | boolean; // Variable/Secret: fail-open pipeline
  // End: Phase 21 - Fail-Open Rate Limit Toggle

  // Start: Fasa 9 - Environment Hardening (align 1:1 dengan wrangler.toml + .dev.vars)
  // Hapus hardcoded config state.
  ADMIN_TELEGRAM_ID: string; // Variable: admin gateway Telegram ID (Fasa 8 approval)
  R2_PUBLIC_URL: string; // Variable: public R2 CDN base URL (Fasal 8 media)
  // End: Fasa 9 - Environment Hardening

  // Start: Phase 28 - Public Redis Caching Grid config (Fasal 11 alignment)
  // PUBLIC_STATS_TTL=60 -> sepadan dengan cache window analytics.ts.
  PUBLIC_STATS_TTL?: string | number; // Pemboleh ubah: jangka hayat cache statistik awam (saat)
  // End: Phase 28 - Public Redis Caching Grid config

  // Start: Phase 64 - Cloudflare Images API (real WebP re-encode, Fasal 8)
  CLOUDFLARE_ACCOUNT_ID: string; // Variable: CF account hash (Images API)
  CF_IMAGES_API_TOKEN: string; // Secret: CF Images API token (Bearer)
  // End: Phase 64 - Cloudflare Images API

  // Start: Phase 68 - AI Helper Engine bindings (Fasal 18)
  BASE_URL: string; // Variable: OpenAI-compatible proxy URL (worker)
  OPENAI_API_KEY: string; // Secret: kunci dummy (kunci sebenar di worker proxy)
  // MODEL_AI_HELPER01..20 dinamik dari .env.local / wrangler vars
  MODEL_AI_HELPER01?: string;
  MODEL_AI_HELPER02?: string;
  MODEL_AI_HELPER03?: string;
  MODEL_AI_HELPER04?: string;
  MODEL_AI_HELPER05?: string;
  MODEL_AI_HELPER06?: string;
  MODEL_AI_HELPER07?: string;
  MODEL_AI_HELPER08?: string;
  MODEL_AI_HELPER09?: string;
  MODEL_AI_HELPER10?: string;
  MODEL_AI_HELPER11?: string;
  MODEL_AI_HELPER12?: string;
  MODEL_AI_HELPER13?: string;
  MODEL_AI_HELPER14?: string;
  MODEL_AI_HELPER15?: string;
  MODEL_AI_HELPER16?: string;
  MODEL_AI_HELPER17?: string;
  MODEL_AI_HELPER18?: string;
  MODEL_AI_HELPER19?: string;
  MODEL_AI_HELPER20?: string;
  // End: Phase 68 - AI Helper Engine bindings
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
  photo?: Array<{ file_id: string; width: number; height: number }>;
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
  | 'awaiting_menu_item'
  | 'awaiting_order_confirm'
  | 'awaiting_qr_upload';

export interface MerchantState {
  merchant_telegram_id: number;
  shop_name?: string;
  step: MerchantStep;
  cart_buffer?: Record<string, unknown>; // Fasal 7 Strategy 3 JSONB
  minigame?: MinigameState; // Phase 57: spin-wheel state (persist tanpa overwrite)
  locale?: 'BM' | 'EN'; // Phase 60: user language preference (i18n)
  last_active: string; // ISO timestamp untuk 1-hour timeout
} 

// Start: Phase 57 - Minigame State (persisted in MerchantState.minigame)
export interface MinigameState {
  last_spin_at?: string; // ISO timestamp pusingan terakhir
  free_spins?: number; // baki pusingan percuma
  total_spins?: number; // kiraan kumulatif
}
// End: Phase 57 - Minigame State

/** Telegram API Response wrapper */
export interface TelegramApiResponse {
  ok: boolean;
  result?: unknown;
  description?: string;
}

// Start: Phase 29 - Invoice & Analytics Type Schemas (Fasal 4 SOA single source)
// Re-eksport kontrak Invoice dari engine (services/invoice) supaya semua modul
// berkongsi skema tunggal tanpa duplikasi. Import jenis sahaja mengelakkan kitaran runtime.
export type { Invoice, InvoiceLineItem, InvoiceQueryBoundary } from './services/invoice';

/** Sempadan query analitik pilihan (digunakan invoice + analytics layer). */
export interface AnalyticsQueryBoundary {
  since?: string; // ISO timestamp bawah
  until?: string; // ISO timestamp atas
  had?: number; // had baris
}
// End: Phase 29 - Invoice & Analytics Type Schemas

/** Kanonikal Order Lifecycle Status (Phase 30 - interactive merchant buttons). */
export type OrderStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'COMPLETED'
  | 'REJECTED';

/** Payload map untuk routing lifecycle callback (Fasal 6 inline buttons). */
export interface OrderStatusPayload {
  orderId: string;
  merchantTelegramId: number;
  status: OrderStatus;
}

// Start: Phase 31 - Bot Command Registry (Fasal 4 SOA command tree matrix)
/** Nama perintah kanonikal yang diaktifkan sepenuhnya dalam Fasa 31. */
export type BotCommandName =
  | '/start'
  | '/mula'
  | '/help'
  | '/bantuan'
  | '/menu'
  | '/urus'
  | '/dashboard';
 
/** Peranan sasaran setiap perintah (pengasingan multi-tenant Fasa 7 S1). */
export type BotCommandRole = 'customer' | 'merchant' | 'both';

/** Registri statik memetakan perintah kepada sub-handler khusus (LOOP 1-2 modul). */
export interface BotCommandRegistry {
  command: BotCommandName;
  description: string;
  role: BotCommandRole;
  handler: 'handleStart' | 'handleHelp' | 'handleShopMenu' | 'handleMerchantDashboard';
}
 
/** Senarai registri perintah bot (rujukan tunggal router handlers.ts). */
export const BOT_COMMAND_MATRIX: BotCommandRegistry[] = [
  { command: '/start', description: 'Mula & pilih peranan', role: 'both', handler: 'handleStart' },
  { command: '/mula', description: 'Mula (BM) & pilih peranan', role: 'both', handler: 'handleStart' },
  { command: '/help', description: 'Papar panduan interaktif', role: 'both', handler: 'handleHelp' },
  { command: '/bantuan', description: 'Papar panduan (BM)', role: 'both', handler: 'handleHelp' },
  { command: '/menu', description: 'Senarai kedai aktif', role: 'customer', handler: 'handleShopMenu' },
  { command: '/urus', description: 'Papan pemerintah peniaga', role: 'merchant', handler: 'handleMerchantDashboard' },
  { command: '/dashboard', description: 'Papan pemerintah (alias)', role: 'merchant', handler: 'handleMerchantDashboard' },
];
 
/** Lanjutan transisi state untuk pokok perintah interaktif (Fasa 7 Strategi 2). */
export type InteractiveCommandStep =
  | 'idle'
  | 'dashboard_view'
  | 'dashboard_toggle_pending'
  | 'help_view';

/** State mesin arahan interaktif disimpan bersama MerchantState. */
/** State mesin perintah interaktif disimpan bersama MerchantState. */
export interface CommandSessionState {
  telegram_id: number;
  step: InteractiveCommandStep;
  last_active: string; // ISO timestamp untuk 1-hour timeout reset
}
// End: Phase 31 - Bot Command Registry

// Start: Phase 32 - Native Menu & Session Cache Type Specs (Schema Integrity)
/** Payload tunggal untuk Telegram setMyCommands API. */
export interface TelegramBotCommand {
  command: string; // mesti bermula dengan '/'
  description: string; // max ~32 aksara (BM)
}

/** Response wrapper spesifik setMyCommands. */
export interface SetMyCommandsResponse {
  ok: boolean;
  description?: string;
}

/** Skema cache Redis untuk CommandSessionState (selari session_cache.ts). */
export interface CachedCommandSession {
  telegram_id: number;
  step: InteractiveCommandStep;
  last_active: string; // ISO timestamp
  ttl_seconds: number; // 3600 (1-jam)
}

/** Peranan perintah untuk panduan menu natif (customer/merchant/admin). */
export type CommandRole = 'customer' | 'merchant' | 'admin' | 'both';

/** Registry 30-command natif BM (satu sumber benar untuk telegram_setup.ts). */
// Start: Phase 53 - 30 Command Master Sync (Fasal 4 SOA single source of truth)
// Exact 30 UNIQUE commands, 1:1 with DISTRIBUTOR_COMMAND_MAP + BOT_COMMANDS.
export const NATIVE_COMMAND_LIST: TelegramBotCommand[] = [
  { command: '/start', description: 'Mula & pilih peranan' },
  { command: '/bantuan', description: 'Panduan interaktif bot' },
  { command: '/menu', description: 'Senarai kedai aktif' },
  { command: '/menu_kedai', description: 'Lihat menu kedai' },
  { command: '/urus_kedai', description: 'Urus kedai saya' },
  { command: '/daftar', description: 'Daftar kedai baharu' },
  { command: '/tambah_menu', description: 'Tambah item menu' },
  { command: '/senarai_menu', description: 'Senarai menu kedai' },
  { command: '/cari_makan', description: 'Cari kedai berdekatan' },
  { command: '/troli', description: 'Lihat troli pesanan' },
  { command: '/pesanan_saya', description: 'Senarai pesanan aktif' },
  { command: '/senarai_pesanan', description: 'Senarai pesanan saya' },
  { command: '/cipta_kupon', description: 'Cipta kupon diskaun' },
  { command: '/senarai_kupon', description: 'Senarai kupon aktif' },
  { command: '/padam_kupon', description: 'Padam kupon diskaun' },
  { command: '/promo', description: 'Lihat promosi aktif' },
  { command: '/invois', description: 'Jana invois digital' },
  { command: '/laporan_jualan', description: 'Laporan jualan kedai' },
  { command: '/tetapan', description: 'Tetapan akaun peniaga' },
  { command: '/set_lokasi', description: 'Tetapkan koordinat kedai' },
  { command: '/sejarah_pesanan', description: 'Sejarah pesanan saya' },
  { command: '/batalkan_pesanan', description: 'Batal pesanan tertunda' },
  { command: '/profil', description: 'Profil & langganan saya' },
  { command: '/naiktaraf', description: 'Naik taraf pelan premium' },
  { command: '/zon_operasi', description: 'Senarai zon operasi' },
  { command: '/cart_kosong', description: 'Kosongkan troli pesanan' },
  { command: '/bantuan_lokasi', description: 'Panduan ikut lokasi' },
  { command: '/admin_stats', description: 'Statistik pentadbir' },
  { command: '/senarai_pendaftaran', description: 'Senarai peniaga berdaftar' },
  { command: '/pengumuman', description: 'Pengumuman pentadbir' },
  { command: '/status', description: 'Semak status bot & akaun' },
];
// End: Phase 53 - 30 Command Master Sync

// Start: Phase 33 - Coupon Inline Callback Type Specs (Fasal 6 interactive grid)
/** Prefix callback natif untuk tindakan interaktif (router handlers.ts). */
export type CallbackActionPrefix =
  | 'del_coupon'
  | 'toggle_status'
  | 'view_invoice'
  | 'accept_order'
  | 'ready_order'
  | 'reject_order'
  | 'view_shop'
  | 'add_to_cart'
  | 'view_cart'
  | 'merchant_report'
  | 'merchant_orders'
  | 'merchant_settings'
  | 'open_nearby'
  | 'open_cart';

/** Payload callback pemadaman kupon (del_coupon:<KOD>). */
export interface CouponDeleteCallback {
  action: 'del_coupon';
  kod: string;
}
// End: Phase 33 - Coupon Inline Callback Type Specs

// Start: Phase 35 - Network Telemetry Stats Schema (Fasal 7 Strategy 4 resilience)
/** Statistiks kesihatan rangkaian untuk endpoint pemantauan (sentinel.ts). */
export interface NetworkTelemetryStats {
  ts: string; // ISO timestamp bila sampel diambil
  worker_region?: string; // Rantau Cloudflare (contoh: "ap-southeast-1")
  upstream_latency_ms: number; // Kelewatan ke Supabase/Upstash (ms)
  db_status: 'OK' | 'DEGRADED' | 'DOWN';
  redis_status: 'OK' | 'DEGRADED' | 'DOWN';
  telegram_status: 'OK' | 'DEGRADED' | 'DOWN';
  drift_sustained: boolean; // True jika connection drift berterusan > ambang
  error_rate_pct: number; // Peratusan kegagalan permintaan (0-100)
  active_connections: number; // Bilangan sambungan aktif semasa
}

/** Payload amaran yang dihantar ke ADMIN_TELEGRAM_ID bila drift berterusan. */
// Payload amaran yang dihantar ke ADMIN_TELEGRAM_ID apabila hanyutan berterusan.
// Start: Phase 36 - Telemetry <-> Analytics Schema Synchronization
// Selaraskan dengan sistem analytics (services/analytics SaasMetrics/PublicStats)
// supaya sentinel boleh lampirkan snapshot metrik platform ke dalam alert.
export interface TelemetryAlertPayload {
  level: 'WARN' | 'CRIT';
  stats: NetworkTelemetryStats;
  message: string; // Teks BM selamat (esc MongoDB/Telegram special chars)
  component?: string; // Sumber telemetry (contoh: 'sentinel', 'dbFetch')
  analytics_snapshot?: {
    active_merchants?: number; // selari SaasMetrics.total_active_merchants
    premium_stores?: number; // selari SaasMetrics.total_premium_stores
    mrr_rm?: number; // selari SaasMetrics.mrr_projection_rm
    total_orders?: number; // selari PublicStats.total_orders
  };
}
// End: Phase 36 - Telemetry <-> Analytics Schema Synchronization
// End: Phase 35 - Network Telemetry Stats Schema

// Start: Phase 39 - Webhook Force-Register Config Contract (Fasal 10 + Fasal 11)
/** Konfigurasi untuk force-setWebhook telegram (bin/force-webhook-register.sh). */
export interface WebhookRegisterConfig {
  botToken: string; // TELEGRAM_BOT_TOKEN (dari .dev.vars / secret)
  webhookUrl: string; // URL penuh worker https (Fasal 10 endpoint)
  secretToken: string; // X_TELEGRAM_BOT_API_SECRET_TOKEN (Fasal 10 guard)
  dropPendingUpdates?: boolean; // Bersihkan queue lama semasa reconnect
  maxConnections?: number; // 1-100 (default 40)
}
// End: Phase 39 - Webhook Force-Register Config Contract

// End: JomOrder Fasa 3 - Core Type Definitions
