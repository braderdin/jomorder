// Start: Phase 49 - Marketing Coupon Handlers (Unified kempen_diskaun)
// Fasal4 (SOA) + Fasal 6 (BM UI, escape MarkdownV2) + Fasal 7 S1 (RLS bind kedai_id).
// Semua kupon kini guna jadual kempen_diskaun (single source of truth, selari discounts.ts).
// Setiap fungsi self-contained, soft-fail (Fasal 7 Strategy 4), tidak throw ke caller.
import { Env } from '../types';
import { sendMessage, escapeMarkdownV2, inlineKeyboard } from '../telegram';

const SUPABASE_REST = (env: Env) => `${env.SUPABASE_URL}/rest/v1`;

/** Header Supabase guna service role (server-side merchant write). */
function svcHeaders(env: Env): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

/** Dapatkan kedai_id dari merchant_telegram_id (RLS bind Fasal 7 S1). */
async function getKedaiId(env: Env, tgId: number): Promise<string | null> {
  const url = `${SUPABASE_REST(env)}/senarai_kedai?merchant_telegram_id=eq.${tgId}&select=id&limit=1`;
  try {
    const res = await fetch(url, { method: 'GET', headers: svcHeaders(env) });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ id: string }>;
    return Array.isArray(rows) && rows.length > 0 ? rows[0].id : null;
  } catch {
    return null;
  }
}

/**
 * /cipta_kupon <KOD> <DISKAUN%> [TAMAT_HARI] [MIN_RM]
 * Cipta rekod kupon diskaun terikat ke kedai merchant semasa (kempen_diskaun).
 * Sokong tamat_tempoh (TAMAT_HARI) supaya scheduler sweep boleh matikan auto.
 */
export async function handleCreateCoupon(
  env: Env,
  chatId: number,
  tgId: number,
  text: string
): Promise<void> {
  try {
    const parts = text.trim().split(/\s+/);
    if (parts.length < 3) {
      await sendMessage(
        env,
        chatId,
        escapeMarkdownV2('⚠️ Format: /cipta_kupon <KOD> <DISKAUN%> [TAMAT_HARI] [MIN_RM]\nContoh: /cipta_kupon JOM10 10 30')
      );
      return;
    }
    const kod = parts[1].toUpperCase();
    const diskaun = Number(parts[2]);
    const tamatHari = parts[3] ? Number(parts[3]) : 0;
    const minRm = parts[4] ? Number(parts[4]) : 0;
    if (!kod || Number.isNaN(diskaun) || diskaun <= 0 || diskaun > 100) {
      await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Diskaun mesti nombor 1-100. Sila cuba lagi.'));
      return;
    }
    const kedaiId = await getKedaiId(env, tgId);
    if (!kedaiId) {
      await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Kedai tidak dijumpai. Daftar kedai dulu.'));
      return;
    }
    const tamatPano = tamatHari > 0
      ? new Date(Date.now() + tamatHari * 86_400_000).toISOString()
      : null;
    const res = await fetch(`${SUPABASE_REST(env)}/kempen_diskaun`, {
      method: 'POST',
      headers: { ...svcHeaders(env), Prefer: 'return=minimal' },
      body: JSON.stringify({
        kedai_id: kedaiId,
        kod_kupon: kod,
        jenis_diskaun: 'PERCENT',
        nilai_diskaun: diskaun,
        tamat_pano: tamatPano,
        status_aktif: true,
      }),
    });
    if (!res.ok) {
      await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Gagal cipta kupon. Kod mungkin wujud.'));
      return;
    }
    await sendMessage(
      env,
      chatId,
      escapeMarkdownV2(`✅ Kupon ${kod} dicipta!\\nDiskaun: ${diskaun}%\\nTamat: ${tamatHari > 0 ? tamatHari + ' hari' : 'Tiada'}`)
    );
  } catch {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Ralat sistem. Cuba sebentar lagi.'));
  }
}

/** /senarai_kupon - papar kupon aktif milik merchant dari kempen_diskaun (inline grid max 2/row). */
export async function handleListCoupons(env: Env, chatId: number, tgId: number): Promise<void> {
  try {
    const kedaiId = await getKedaiId(env, tgId);
    if (!kedaiId) {
      await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Kedai tidak dijumpai. Daftar kedai dulu.'));
      return;
    }
    const url = `${SUPABASE_REST(env)}/kempen_diskaun?kedai_id=eq.${encodeURIComponent(kedaiId)}&select=kod_kupon,status_aktif`;
    const res = await fetch(url, { method: 'GET', headers: svcHeaders(env) });
    if (!res.ok) {
      await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Gagal ambil senarai kupon.'));
      return;
    }
    const rows = (await res.json()) as Array<{
      kod_kupon: string;
      status_aktif: boolean;
    }>;
    if (!Array.isArray(rows) || rows.length === 0) {
      await sendMessage(env, chatId, escapeMarkdownV2('📭 Tiada kupon aktif. Taip /cipta_kupon untuk mula.'));
      return;
    }
    const lines = rows
      .map((r) => `🎟️ ${escapeMarkdownV2(r.kod_kupon)} \\- ${r.status_aktif ? '✅ Aktif' : '⛔ Dimatikan'}`)
      .join('\\n');
    const buttons = rows.map((r) => [{ text: `🗑️ ${r.kod_kupon}`, callback_data: `del_coupon:${r.kod_kupon}` }]);
    await sendMessage(
      env,
      chatId,
      escapeMarkdownV2('🎟️ KUPON AKTIF:\\n') + lines,
      inlineKeyboard(buttons)
    );
  } catch {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Ralat sistem. Cuba sebentar lagi.'));
  }
}

/** Snapshot kupon sebelum padam (rollback buffer) -> audit_kupon_padam. */
async function snapshotCouponForAudit(env: Env, tgId: number, kod: string): Promise<void> {
  try {
    const kedaiId = await getKedaiId(env, tgId);
    if (!kedaiId) return;
    const getUrl = `${SUPABASE_REST(env)}/kempen_diskaun?kod_kupon=eq.${encodeURIComponent(kod)}&kedai_id=eq.${encodeURIComponent(kedaiId)}&select=*`;
    const snap = await fetch(getUrl, { method: 'GET', headers: svcHeaders(env) });
    if (!snap.ok) return; // Soft-fail: audit bukan blocker.
    const rows = (await snap.json()) as Array<Record<string, unknown>>;
    const payload = Array.isArray(rows) && rows.length > 0 ? rows[0] : { kod, kedai_id: kedaiId };
    const txRef = `del_${Date.now()}_${tgId}`;
    await fetch(`${SUPABASE_REST(env)}/audit_kupon_padam`, {
      method: 'POST',
      headers: { ...svcHeaders(env), Prefer: 'return=minimal' },
      body: JSON.stringify({
        kod,
        merchant_telegram_id: String(tgId),
        snapshot_json: payload,
        transaction_ref: txRef,
        dipadam_pada: new Date().toISOString(),
      }),
    });
  } catch {
    // Soft-fail (Fasal 7 Strategy 4): audit gagal tidak blok pemadaman.
  }
}

/** Teras padam kupon (RLS isolation manual) - dikongsi command & inline callback. */
async function deleteCouponCore(env: Env, chatId: number, tgId: number, kod: string): Promise<void> {
  try {
    // Phase 34: Rollback buffer - snapshot dulu sebelum DELETE.
    await snapshotCouponForAudit(env, tgId, kod);
    const kedaiId = await getKedaiId(env, tgId);
    if (!kedaiId) {
      await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Kedai tidak dijumpai.'));
      return;
    }
    const url = `${SUPABASE_REST(env)}/kempen_diskaun?kod_kupon=eq.${encodeURIComponent(kod)}&kedai_id=eq.${encodeURIComponent(kedaiId)}`;
    const res = await fetch(url, { method: 'DELETE', headers: svcHeaders(env) });
    if (!res.ok) {
      await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Gagal padam kupon.'));
      return;
    }
    await sendMessage(env, chatId, escapeMarkdownV2(`🗑️ Kupon ${kod} dipadam.`));
  } catch {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Ralat sistem. Cuba sebentar lagi.'));
  }
}

/** /padam_kupon <KOD> - padam kupon terikat ke merchant (RLS isolation manual). */
export async function handleDeleteCoupon(
  env: Env,
  chatId: number,
  tgId: number,
  text: string
): Promise<void> {
  const kod = (text.trim().split(/\s+/)[1] || '').toUpperCase();
  if (!kod) {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Format: /padam_kupon <KOD>'));
    return;
  }
  await deleteCouponCore(env, chatId, tgId, kod);
}

/**
 * handleDeleteCouponInline - terima callback 'del_coupon:<KOD>' terus dari inline button.
 * Process inline text request dan prepare backend cleanup bersih tanpa orphan reference
 * (Fasal 7 Strategy 1: isolate merchant_telegram_id -> kedai_id).
 */
export async function handleDeleteCouponInline(
  env: Env,
  chatId: number,
  tgId: number,
  kod: string
): Promise<void> {
  const clean = (kod || '').trim().toUpperCase();
  if (!clean) {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Kod kupon tidak sah.'));
    return;
  }
  // Backend cleanup: tiada cache JSONB kupon setempat; DELETE terus terikat kedai.
  await deleteCouponCore(env, chatId, tgId, clean);
}

// Start: Phase 52 - /promo (Customer active coupon discovery)
/**
 * handlePromo
 * Pelanggan lihat senarai kupon aktif (status_aktif='AKTIF' dan belum tamat).
 * Papar grid kod + diskaun. Soft-fail: mesej neutral jika tiada/retait.
 */
export async function handlePromo(env: Env, chatId: number): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const url =
    `${SUPABASE_REST(env)}/kempen_diskaun?status_aktif=eq.AKTIF&tamat_pada=gte.${today}T00:00:00.000Z` +
    `&select=kod_kupon,peratus_diskaun,min_pesanan_rm,kedai_id&limit=20`;
  try {
    const res = await fetch(url, { method: 'GET', headers: svcHeaders(env) });
    if (!res.ok) {
      await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Gagal ambil promosi. Cuba sebentar lagi.'));
      return;
    }
    const rows = (await res.json()) as Array<{
      kod_kupon: string;
      peratus_diskaun: number;
      min_pesanan_rm?: number;
    }>;
    if (!Array.isArray(rows) || rows.length === 0) {
      await sendMessage(env, chatId, escapeMarkdownV2('🎟️ Tiada promosi aktif buat masa ini. Lawat lagi nanti!'));
      return;
    }
    const lines = rows
      .map((r) => {
        const min = r.min_pesanan_rm ? ` (min RM${r.min_pesanan_rm})` : '';
        return `🎟️ ${escapeMarkdownV2(r.kod_kupon)} — ${r.peratus_diskaun}%${min}`;
      })
      .join('\n');
    const text =
      escapeMarkdownV2('🔥 PROMOSI AKTIF\\n\\n') +
      lines +
      escapeMarkdownV2('\\n\\nGuna kod semasa buat pesanan. Selamat menjamu selera! 🇲🇾');
    await sendMessage(env, chatId, text);
  } catch {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Ralat sistem. Cuba sebentar lagi.'));
  }
}
// End: Phase 52 - /promo
// End: Phase 49 - Marketing Coupon Handlers (Unified kempen_diskaun)
