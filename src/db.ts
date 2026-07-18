// Start: JomOrder Fasa 4 - Supabase Data Layer (Fail 1)
// Fasal 7 Strategy 1 (RLS isolation via service_role) + Fasal 4 (SOA) + Fasal 11 (env binding)
// Pure TypeScript fetch-based PostgREST client (no external dep = free tier footprint)
import { Env } from './types';
import {
  getSubscriptionCache,
  setSubscriptionCache,
} from './redis';
import { normalizeLangganan, LanggananStatus } from './subscription';

/** Standard Supabase auth headers menggunakan service_role (server-side only) */
function supabaseHeaders(env: Env): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

export interface KedaiBerhampiran {
  id: string;
  nama_kedai: string;
  latitude_kedai: number;
  longitude_kedai: number;
  jarak_km: number;
}

// Start: Phase 38 - Null-Shield DB Lookup Guard (anti Edge crash)
/**
 * safeRows
 * Jamin hasil query sentiasa array (bukan null/undefined) supaya Edge runtime
 * tidak terhenti bila PostgREST return payload aneh. Fasal 7 Strategy 4.
 */
export function safeRows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

/**
 * getShopByIdSafe
 * Lookup kedai ikat kedai_id; return objek typed atau null (bukan throw).
 * Digunakan oleh handler untuk elak null-pointer dereference (Phase 38).
 */
export async function getShopByIdSafe(
  env: Env,
  kedaiId: string
): Promise<{ id: string; nama_kedai: string; status_kedai: string } | null> {
  const url = `${env.SUPABASE_URL}/rest/v1/senarai_kedai?id=eq.${encodeURIComponent(kedaiId)}&select=id,nama_kedai,status_kedai&limit=1`;
  try {
    const res = await fetch(url, { method: 'GET', headers: supabaseHeaders(env) });
    if (!res.ok) return null;
    const rows = safeRows<{ id: string; nama_kedai: string; status_kedai: string }>(await res.json());
    return rows.length > 0 ? rows[0] : null;
  } catch {
    return null;
  }
}
// Start: Phase 39 - Multi-Tenant Shop Lookup Hardening (Fasal 7 Strategy 1 RLS)
/**
 * getShopByMerchantSafe
 * Cari kedai ikat terus ke merchant_telegram_id (RLS boundary). Return null
 * jika tiada / gagal. Menjamin caller tidak terkena null-pointer crash bila
 * peniaga belum daftar kedai (Phase 39 hardening).
 */
export async function getShopByMerchantSafe(
  env: Env,
  telegramId: number
): Promise<{ id: string; nama_kedai: string; status_kedai: string; status_langganan?: string } | null> {
  const url = `${env.SUPABASE_URL}/rest/v1/senarai_kedai?merchant_telegram_id=eq.${telegramId}&select=id,nama_kedai,status_kedai,status_langganan&limit=1`;
  try {
    const res = await fetch(url, { method: 'GET', headers: supabaseHeaders(env) });
    if (!res.ok) return null;
    const rows = safeRows<{ id: string; nama_kedai: string; status_kedai: string; status_langganan?: string }>(await res.json());
    return rows.length > 0 ? rows[0] : null;
  } catch {
    return null;
  }
}

/**
 * getShopByIdSafe fortekan: pastikan result di-normalize dan tak pernah throw.
 * (Wrapper sedia ada dipertingkat dengan safeRows guard tambahan.)
 */
export async function getShopByIdSafeHardened(
  env: Env,
  kedaiId: string
): Promise<{ id: string; nama_kedai: string; status_kedai: string } | null> {
  const result = await getShopByIdSafe(env, kedaiId);
  if (!result) return null;
  return {
    id: result.id || kedaiId,
    nama_kedai: result.nama_kedai || 'KEDAI_TIDAK_DIKETAHUI',
    status_kedai: result.status_kedai || 'TUTUP',
  };
}
// End: Phase 39 - Multi-Tenant Shop Lookup Hardening

// End: Phase 38 - Null-Shield DB Lookup Guard

// Start: Phase 36 - Telemetry Audit Wiring (secure DB transactional fetch wrapper)
/**
 * Rekod kesihatan telemetry ke jadual audit_telemetry_health (migration 010).
 * Fail-open: sebarang ralat tulis audit ditelan supaya tidak crash runtime.
 */
export interface TelemetryAuditRecord {
  component: string;
  status?: string;
  latency_ms?: number;
  error_rate_pct?: number;
  drift_sustained?: boolean;
  merchant_telegram_id?: string;
  detail_json?: Record<string, unknown>;
}

export async function auditTelemetryHealth(env: Env, rec: TelemetryAuditRecord): Promise<void> {
  const url = `${env.SUPABASE_URL}/rest/v1/audit_telemetry_health`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: supabaseHeaders(env),
      body: JSON.stringify({
        component: rec.component,
        status: rec.status ?? 'OK',
        latency_ms: rec.latency_ms ?? 0,
        error_rate_pct: rec.error_rate_pct ?? 0,
        drift_sustained: rec.drift_sustained ?? false,
        merchant_telegram_id: rec.merchant_telegram_id ?? null,
        detail_json: rec.detail_json ?? {},
      }),
    });
  } catch {
    // swallow - telemetry audit bukan kritikal
  }
}

/**
 * Wrapper fetch transaksi DB berpusat: ukur latency, tangkap kegagalan,
 * dan tulis audit telemetry secara asinkron (fail-open).
 */
export async function dbFetch(
  env: Env,
  url: string,
  init: RequestInit,
  component: string,
  merchantId?: string
): Promise<Response | null> {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { ...init, headers: { ...supabaseHeaders(env), ...(init.headers || {}) } });
    const latency = Date.now() - t0;
    await auditTelemetryHealth(env, {
      component,
      status: res.ok ? 'OK' : 'FAIL',
      latency_ms: latency,
      merchant_telegram_id: merchantId,
      detail_json: { status: res.status },
    });
    return res;
  } catch (e) {
    const latency = Date.now() - t0;
    await auditTelemetryHealth(env, {
      component,
      status: 'ERROR',
      latency_ms: latency,
      merchant_telegram_id: merchantId,
      detail_json: { error: String(e) },
    });
    return null;
  }
}
// End: Phase 36 - Telemetry Audit Wiring

/**
 * Trigger Fasa 2 RPC: ambil_kedai_berhampiran (Haversine geo-query).
 * Selamat: dibalut try/catch, return [] jika gagal (Fasal 7 Strategy 4 soft-fail).
 */
export async function ambilKedaiBerhampiran(
  env: Env,
  pelangganLat: number,
  pelangganLong: number,
  radiusKm = 10
): Promise<KedaiBerhampiran[]> {
  const url = `${env.SUPABASE_URL}/rest/v1/rpc/ambil_kedai_berhampiran`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: supabaseHeaders(env),
      body: JSON.stringify({
        pelanggan_lat: pelangganLat,
        pelanggan_long: pelangganLong,
        radius_km: radiusKm,
      }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as KedaiBerhampiran[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Semak sama ada Telegram ID peniaga wujud dalam senarai_kedai.
 * RLS di bypass melalui service_role; query diikat ke merchant_telegram_id (Fasal 7 Strategy 1).
 * NOTE: Kolum merchant_telegram_id ditambah ke schema.sql (migration Fasa 4).
 */
export async function checkMerchantExists(
  env: Env,
  telegramId: number
): Promise<boolean> {
  const url = `${env.SUPABASE_URL}/rest/v1/senarai_kedai?merchant_telegram_id=eq.${telegramId}&select=id&limit=1`;
  try {
    const res = await fetch(url, { method: 'GET', headers: supabaseHeaders(env) });
    if (!res.ok) return false;
    const rows = (await res.json()) as Array<{ id: string }>;
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

/** Rekod permulaan peniaga baharu ke senarai_kedai (onboarding Langkah A).
 * Lat/long diambil dari native Telegram location semasa Langkah B (Fasal 7 Strategy 2).
 * Optional: jika tiada, default 0 (fallback soft-fail). */
export async function daftarKedaiPermulaan(
  env: Env,
  telegramId: number,
  namaKedai: string,
  lat?: number,
  lng?: number
): Promise<boolean> {
  const url = `${env.SUPABASE_URL}/rest/v1/senarai_kedai`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...supabaseHeaders(env), Prefer: 'return=minimal' },
      body: JSON.stringify({
        merchant_telegram_id: String(telegramId),
        nama_kedai: namaKedai,
        nama_pemilik: 'PEMILIK_BAHARU',
        emel_pemilik: `${telegramId}@jomorder.local`,
        no_telefon_sim: String(telegramId),
        latitude_kedai: typeof lat === 'number' ? lat : 0,
        longitude_kedai: typeof lng === 'number' ? lng : 0,
        status_kedai: 'MENUNGGU_PENGESAHAN',
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Start: Fasa 5 - Subscription Cache + Order Lifecycle Persistence
// Fasal 7 Strategy 1 (RLS) + Strategy 2 (Redis fast-path shield).

/**
 * Dapatkan status langganan dengan Redis cache-first pattern.
 * Setiap mesej masuk periksa Redis dulu (sub:{id}) sebelum tembak Supabase
 * untuk lindungi free-tier quota dari traffic spike (Fasal 7 Strategy 2).
 * Soft-fail: cache miss / DB fail -> 'AKTIF' (fail-open).
 */
export async function getLanggananStatusCached(
  env: Env,
  telegramId: number
): Promise<LanggananStatus> {
  const cached = await getSubscriptionCache(env, telegramId);
  if (cached) return normalizeLangganan(cached);

  const url = `${env.SUPABASE_URL}/rest/v1/senarai_kedai?merchant_telegram_id=eq.${telegramId}&select=status_langganan&limit=1`;
  try {
    const res = await fetch(url, { method: 'GET', headers: supabaseHeaders(env) });
    if (!res.ok) return 'AKTIF';
    const rows = (await res.json()) as Array<{ status_langganan?: string }>;
    if (!Array.isArray(rows) || rows.length === 0) return 'AKTIF';
    const status = normalizeLangganan(rows[0].status_langganan);
    await setSubscriptionCache(env, telegramId, status);
    return status;
  } catch {
    return 'AKTIF';
  }
}

/**
 * Kemaskini status_penghantaran pesanan ke DB (PENDING->MEMASAK->DELIVERY->COMPLETED).
 * Diikat ke kedai_id untuk pengasingan multi-tenant (Fasal 7 Strategy 1).
 * @returns true jika PATCH berjaya
 */
export async function updateStatusPenghantaran(
  env: Env,
  orderId: number,
  kedaiId: string,
  status: string
): Promise<boolean> {
  const url = `${env.SUPABASE_URL}/rest/v1/rekod_pesanan?id=eq.${orderId}&kedai_id=eq.${kedaiId}`;
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { ...supabaseHeaders(env), Prefer: 'return=minimal' },
      body: JSON.stringify({ status_penghantaran: status }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Start: Fasa 15 - Premium Upsell (Merchant Migration to PREMIUM tier)
// Fasal 7 Strategy 1 (RLS via merchant_telegram_id) + Strategy 2 (instant cache refresh).
// Naik taraf status_langganan kedai ke 'PREMIUM' dan terus segar-sembuh cache Redis
// supaya baca seterusnya tidak perlu tembak Supabase (free-tier shield kekal).
export async function upgradeMerchantToPremium(
  env: Env,
  telegramId: number
): Promise<boolean> {
  const url = `${env.SUPABASE_URL}/rest/v1/senarai_kedai?merchant_telegram_id=eq.${telegramId}`;
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { ...supabaseHeaders(env), Prefer: 'return=minimal' },
      body: JSON.stringify({ status_langganan: 'PREMIUM' }),
    });
    if (!res.ok) return false;
    // Segar-sembuh cache langganan serentak (Fasal 7 Strategy 2).
    await setSubscriptionCache(env, telegramId, 'PREMIUM');
    return true;
  } catch {
    return false; // Soft-fail (Fasal 7 Strategy 4)
  }
}
// End: Fasa 15 - Premium Upsell

// End: Fasa 5 - Subscription Cache + Order Lifecycle Persistence

// Start: Fasa 6 - Full Order State Machine Persistence
// Fasal 7 Strategy 1 (RLS via kedai_id binding) + Fasal 4 (SOA).
// `updateOrderState` commit penuh status_pembayaran + status_penghantaran
// dalam satu PATCH atomik (simulasi transaction) bagi elak race-condition
// bila admin override / pelanggan bayar serentak.

/** Payload state mesin pesanan (Strategy 3 commit point). */
export interface OrderStatePayload {
  status_pembayaran?: string;
  status_penghantaran?: string;
  bukti_resit_url?: string;
}

/**
 * Persist penuh state mesin pesanan ke rekod_pesanan.
 * Query diikat ke kedai_id (multi-tenant isolation, Fasal 7 Strategy 1).
 * @returns true jika PATCH berjaya
 */
export async function updateOrderState(
  env: Env,
  orderId: number,
  kedaiId: string,
  payload: OrderStatePayload
): Promise<boolean> {
  const url = `${env.SUPABASE_URL}/rest/v1/rekod_pesanan?id=eq.${orderId}&kedai_id=eq.${kedaiId}`;
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { ...supabaseHeaders(env), Prefer: 'return=minimal' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false; // Soft-fail (Fasal 7 Strategy 4)
  }
}

// End: Fasa 6 - Full Order State Machine Persistence

// Start: Fasa 7 - Order Commit Transaction (Checkout Lifecycle)
// Fasal 7 Strategy 3 (Cart Buffering commit) + Strategy 1 (RLS kedai_id binding).
// `commitOrderPayload` compile buffer JSONB pelanggan menjadi rekod_pesanan formal
// HANYA semasa pengesahan pesanan + pembayaran eksplisit (commit point tunggal).

/** Item final dalam cart pelanggan (Strategy 3 JSONB buffer). */
export interface BuyerCartItem {
  item_id: string;
  nama: string;
  kuantiti: number;
  harga_seunit: number;
}

/** Payload pesanan final sebelum di-INSERT ke rekod_pesanan. */
// Start: RC4 - Drift closed (align with schema.sql rekod_pesanan columns)
export interface CommitOrderInput {
  kedaiId: string;
  customerTelegramId: number;
  items: BuyerCartItem[];
  totalAmount: number;
  kaedahPembayaran: string;
}
// End: RC4 - Drift closed

/**
 * Insert rekod pesanan formal ke rekod_pesanan (commit point).
 * Diikat ke kedai_id untuk pengasingan multi-tenant (Fasal 7 Strategy 1).
 * @returns orderId (number) jika berjaya, atau null jika gagal (soft-fail).
 */
export async function commitOrderPayload(
  env: Env,
  input: CommitOrderInput
): Promise<number | null> {
  const url = `${env.SUPABASE_URL}/rest/v1/rekod_pesanan`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...supabaseHeaders(env), Prefer: 'return=representation' },
      body: JSON.stringify({
        kedai_id: input.kedaiId,
        pelanggan_telegram_id: String(input.customerTelegramId),
        butiran_pesanan: input.items, // JSONB buffer (Strategy 3)
        jumlah_harga: input.totalAmount,
        kaedah_pembayaran: input.kaedahPembayaran,
        status_pembayaran: 'MENUNGGU_BAYARAN',
        status_penghantaran: 'PENDING',
        bukti_resit_url: null,
        created_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ id: number }>;
    if (Array.isArray(rows) && rows.length > 0) return rows[0].id;
    return null;
  } catch {
    return null; // Soft-fail (Fasal 7 Strategy 4)
  }
}

// Start: Phase 24 - Dynamic Menu Browsing (Multi-Tenant Menu Query Ingestion)
// Fasal 7 Strategy 1 (kedai_id binding) + Strategy 4 (soft-fail timeout).
// Query PostgREST ke menu_makanan, filter kedai_id + status_tersedia=true.
// Return [] kosong jika connection timeout / gagal (soft-fail).

/** Item menu tersedia untuk paparan pelanggan. */
export interface MenuMakananItem {
  id: number;
  nama_hidangan: string;
  harga: number;
}

/**
 * Ambil senarai hidangan tersedia untuk satu kedai.
 * Diikat ke kedai_id untuk pengasingan multi-tenant (Fasal 7 Strategy 1).
 * Soft-fail: return [] jika fetch gagal / timeout.
 */
export async function getMenuByKedaiId(
  env: Env,
  kedaiId: string
): Promise<MenuMakananItem[]> {
  const url = `${env.SUPABASE_URL}/rest/v1/menu_makanan?kedai_id=eq.${encodeURIComponent(
    kedaiId
  )}&status_tersedia=eq.true&select=id,nama_hidangan,harga&order=nama_hidangan.asc`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: supabaseHeaders(env),
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{
      id: number;
      nama_hidangan: string;
      harga: number;
    }>;
    if (!Array.isArray(rows)) return [];
    return rows.map((r) => ({
      id: r.id,
      nama_hidangan: r.nama_hidangan,
      harga: typeof r.harga === 'number' ? r.harga : Number(r.harga) || 0,
    }));
  } catch {
    return []; // Soft-fail (Fasal 7 Strategy 4)
  }
}
// Start: Phase 37 - Merchant Catalog & Location Data Layers (Fasal 7 Strategy 1 RLS)
/**
 * Togol status_tersedia item menu (true<->false) ikat kedai_id (RLS isolation).
 * Rekod semasa diambil dulu, kemudian PATCH nilai songsang. Soft-fail: false.
 */
export async function toggleMenuAvailability(
  env: Env,
  menuItemId: number,
  kedaiId: string
): Promise<boolean> {
  const getUrl = `${env.SUPABASE_URL}/rest/v1/menu_makanan?id=eq.${menuItemId}&kedai_id=eq.${encodeURIComponent(kedaiId)}&select=status_tersedia&limit=1`;
  try {
    const getRes = await fetch(getUrl, { method: 'GET', headers: supabaseHeaders(env) });
    if (!getRes.ok) return false;
    const rows = (await getRes.json()) as Array<{ status_tersedia?: boolean }>;
    if (!Array.isArray(rows) || rows.length === 0) return false;
    const current = rows[0].status_tersedia ?? false;
    const patchRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/menu_makanan?id=eq.${menuItemId}&kedai_id=eq.${encodeURIComponent(kedaiId)}`,
      {
        method: 'PATCH',
        headers: { ...supabaseHeaders(env), Prefer: 'return=minimal' },
        body: JSON.stringify({ status_tersedia: !current }),
      }
    );
    return patchRes.ok;
  } catch {
    return false; // Soft-fail (Fasal 7 Strategy 4)
  }
}

/**
 * Kemaskini koordinat kedai (lat/long) ikat merchant_telegram_id (RLS isolation).
 * Digunakan oleh handleSetLokasi selepas peniaga hantar 📍 native location.
 */
export async function updateMerchantCoordinates(
  env: Env,
  tgId: number,
  latitude: number,
  longitude: number
): Promise<boolean> {
  const url = `${env.SUPABASE_URL}/rest/v1/senarai_kedai?merchant_telegram_id=eq.${tgId}`;
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { ...supabaseHeaders(env), Prefer: 'return=minimal' },
      body: JSON.stringify({ latitude_kedai: latitude, longitude_kedai: longitude }),
    });
    return res.ok;
  } catch {
    return false; // Soft-fail (Fasal 7 Strategy 4)
  }
}
// Start: Phase 38 - Inventory Stock Recovery on Cancel (Fasal 7 Strategy 1 RLS)
/**
 * restoreInventoryOnCancel
 * Pulihkan status_tersedia=true untuk item menu yang dibatalkan dari pesanan
 * PENDING (supaya peniaga tidak kehilangan stok). Diikat kedai_id (RLS isolation).
 * Soft-fail: return false jika mana-mana PATCH gagal (tidak crash caller).
 */
export async function restoreInventoryOnCancel(
  env: Env,
  kedaiId: string,
  items: Array<{ item_id: string; kuantiti: number }>
): Promise<boolean> {
  let allOk = true;
  for (const it of items) {
    const url = `${env.SUPABASE_URL}/rest/v1/menu_makanan?id=eq.${encodeURIComponent(it.item_id)}&kedai_id=eq.${encodeURIComponent(kedaiId)}`;
    try {
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { ...supabaseHeaders(env), Prefer: 'return=minimal' },
        body: JSON.stringify({ status_tersedia: true }),
      });
      if (!res.ok) allOk = false;
    } catch {
      allOk = false;
    }
  }
  return allOk;
}
// End: Phase 38 - Inventory Stock Recovery on Cancel

// End: Phase 37 - Merchant Catalog & Location Data Layers

// End: Phase 24 - Dynamic Menu Browsing

// End: Fasa 7 - Order Commit Transaction (Checkout Lifecycle)

// End: JomOrder Fasa 4 - Supabase Data Layer (Fail 1)
