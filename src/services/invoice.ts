// Start: JomOrder Phase 29 - Digital Invoice Engine (File 3)
// Fasal 6 (MarkdownV2 escape) + Fasal 7 Strategy 1 (RLS bypass service_role)
// Fasal 4 (SOA) - modul khusus bagi penjanaan invois digital Telegram.
// Engine ini tarik metadata pesanan histori dari Supabase dan struktur
// penyata MarkdownV2 yang di-escape sepenuhnya (anti-Telegram parse crash).

import { Env } from '../types';
import { escapeMarkdownV2 } from '../telegram';

/** Satu item dalam butiran_pesanan JSONB (kontrak longgar). */
export interface InvoiceLineItem {
  nama: string;
  kuantiti: number;
  harga_seunit: number;
  subtotal: number;
}

/** Rekod invois terkumpul untuk satu kedai/peniaga. */
export interface Invoice {
  merchant_telegram_id: string;
  nama_kedai: string;
  tempoh_mula: string | null;
  tempoh_tamat: string | null;
  jumlah_pesanan: number;
  jumlah_billing_rm: number;
  baris: InvoiceLineItem[];
  ringkasan_status: {
    dibayar: number;
    belum_bayar: number;
    dihantar: number;
    pending: number;
  };
}

/** Sempadan query analitik pilihan (Phase 29 + LOOP 4 types). */
export interface InvoiceQueryBoundary {
  since?: string; // ISO timestamp bawah
  until?: string; // ISO timestamp atas
  had?: number; // had baris (default 50)
}

/** Header auth service_role (server-side, bypass RLS). */
function svcHeaders(env: Env): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

/** Phase 34: AbortSignal timeout shield (8s) elak sequence timeout dropout. */
function withTimeout(ms = 8000): { signal: AbortSignal } {
  return { signal: AbortSignal.timeout(ms) };
}

/**
 * Selesaikan kedai_id daripada merchant_telegram_id (tenant isolation).
 * Soft-fail: return null jika tiada kedai berdaftar.
 */
async function resolveKedaiId(env: Env, merchantTgId: string): Promise<{ id: string; nama: string } | null> {
  const url = `${env.SUPABASE_URL}/rest/v1/senarai_kedai?select=id,nama_kedai&merchant_telegram_id=eq.${encodeURIComponent(merchantTgId)}&limit=1`;
  try {
    const res = await fetch(url, { ...svcHeaders(env), ...withTimeout() });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ id: string; nama_kedai: string }>;
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return { id: rows[0].id, nama: rows[0].nama_kedai };
  } catch {
    return null; // Fasal 7 Strategy 4 soft-fail
  }
}

/**
 * Tarik rekod_pesanan untuk kedai dalam sempadan masa (jika ada).
 * Indeks migrated oleh 005_invoice_tracker.sql pecutkan carian timestamp.
 */
async function fetchOrders(
  env: Env,
  kedaiId: string,
  boundary: InvoiceQueryBoundary
): Promise<Array<Record<string, unknown>> | null> {
  const limit = boundary.had && boundary.had > 0 ? Math.min(boundary.had, 200) : 50;
  let q = `${env.SUPABASE_URL}/rest/v1/rekod_pesanan?select=id,butiran_pesanan,jumlah_harga,kaedah_pembayaran,status_pembayaran,status_penghantaran,created_at&kedai_id=eq.${encodeURIComponent(kedaiId)}&order=created_at.desc&limit=${limit}`;
  if (boundary.since) q += `&created_at=gte.${encodeURIComponent(boundary.since)}`;
  if (boundary.until) q += `&created_at=lte.${encodeURIComponent(boundary.until)}`;
  try {
    const res = await fetch(q, { ...svcHeaders(env), ...withTimeout() });
    if (!res.ok) return null;
    return (await res.json()) as Array<Record<string, unknown>>;
  } catch {
    return null; // soft-fail
  }
}

/** Ekstrak item baris daripada butiran_pesanan JSONB secara selamat. */
function parseLineItems(butiran: unknown): InvoiceLineItem[] {
  if (!butiran || typeof butiran !== 'object') return [];
  const b = butiran as Record<string, unknown>;
  const raw = Array.isArray(b.items) ? b.items : Array.isArray(b.butiran) ? b.butiran : [];
  return raw.map((it: unknown) => {
    const o = (it ?? {}) as Record<string, unknown>;
    const kuantiti = Number(o.kuantiti ?? o.qty ?? 1) || 1;
    const harga = Number(o.harga_seunit ?? o.harga ?? 0) || 0;
    const nama = String(o.nama ?? o.item ?? 'Item');
    return {
      nama,
      kuantiti,
      harga_seunit: Math.round(harga * 100) / 100,
      subtotal: Math.round(kuantiti * harga * 100) / 100,
    };
  });
}

/**
 * Jana invois penuh untuk peniaga dalam sempadan masa.
 * Return null jika kedai tidak dijumpai atau tarik gagal.
 */
export async function buildMerchantInvoice(
  env: Env,
  merchantTgId: string,
  boundary: InvoiceQueryBoundary = {}
): Promise<Invoice | null> {
  const kedai = await resolveKedaiId(env, merchantTgId);
  if (!kedai) return null;
  const orders = await fetchOrders(env, kedai.id, boundary);
  if (!orders) return null;

  const baris: InvoiceLineItem[] = [];
  let jumlahBilling = 0;
  let dibayar = 0;
  let belumBayar = 0;
  let dihantar = 0;
  let pending = 0;

  for (const o of orders) {
    const statusBayar = String(o.status_pembayaran ?? 'UNPAID').toUpperCase();
    const statusHantar = String(o.status_penghantaran ?? 'PENDING').toUpperCase();
    if (statusBayar === 'PAID') dibayar++;
    else belumBayar++;
    if (statusHantar === 'DELIVERED' || statusHantar === 'DIHANTAR') dihantar++;
    else pending++;

    const amt = Number(o.jumlah_harga ?? 0) || 0;
    jumlahBilling += amt;
    baris.push(...parseLineItems(o.butiran_pesanan));
  }

  return {
    merchant_telegram_id: merchantTgId,
    nama_kedai: kedai.nama,
    tempoh_mula: boundary.since ?? null,
    tempoh_tamat: boundary.until ?? null,
    jumlah_pesanan: orders.length,
    jumlah_billing_rm: Math.round(jumlahBilling * 100) / 100,
    baris,
    ringkasan_status: { dibayar, belum_bayar: belumBayar, dihantar, pending },
  };
}

/**
 * Render Invoice kepada string MarkdownV2 Telegram yang di-escape.
 * Format: header, ringkasan billing, breakdown perkhidmatan, status transaksi.
 */
export function renderInvoiceMarkdownV2(inv: Invoice): string {
  const e = escapeMarkdownV2;
  const lines: string[] = [];
  lines.push(`*🧾 INVOIS DIGITAL JOMORDER*`);
  lines.push('');
  lines.push(`${e('Kedai')}: ${e(inv.nama_kedai)}`);
  const m = inv.merchant_telegram_id;
  lines.push(`${e('Peniaga ID')}: ${e(m)}`);
  if (inv.tempoh_mula || inv.tempoh_tamat) {
    const p = [inv.tempoh_mula ? e(inv.tempoh_mula) : e('-'), inv.tempoh_tamat ? e(inv.tempoh_tamat) : e('-')].join(' ' + e('hingga') + ' ');
    lines.push(`${e('Tempoh')}: ${p}`);
  }
  lines.push('');
  lines.push(`${e('JUMLAH BILLING')}: RM${e(inv.jumlah_billing_rm.toFixed(2))}`);
  lines.push(`${e('Jumlah Pesanan')}: ${e(String(inv.jumlah_pesanan))}`);
  lines.push('');
  lines.push(`${e('RINGKASAN TRANSAKSI')}:`);
  lines.push(`${e('Dibayar')}: ${e(String(inv.ringkasan_status.dibayar))}  ${e('Belum Bayar')}: ${e(String(inv.ringkasan_status.belum_bayar))}`);
  lines.push(`${e('Dihantar')}: ${e(String(inv.ringkasan_status.dihantar))}  ${e('Pending')}: ${e(String(inv.ringkasan_status.pending))}`);
  lines.push('');
  lines.push(`${e('BREAKDOWN PERKHIDMATAN')}:`);
  if (inv.baris.length === 0) {
    lines.push(e('(Tiada item direkod)'));
  } else {
    inv.baris.slice(0, 25).forEach((it, idx) => {
      const row = `${idx + 1}\\. ${e(it.nama)} x${e(String(it.kuantiti))} @ RM${e(it.harga_seunit.toFixed(2))} = RM${e(it.subtotal.toFixed(2))}`;
      lines.push(row);
    });
    if (inv.baris.length > 25) {
      lines.push(e(`... +${inv.baris.length - 25} item lagi`));
    }
  }
  lines.push('');
  lines.push(e('Terima kasih menggunakan JomOrder Modern-Siber.'));
  return lines.join('\n');
}

// End: JomOrder Phase 29 - Digital Invoice Engine (File 3)