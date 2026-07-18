// Start: Phase 31 - /urus & /dashboard Command Controller (LOOP 2 File 4)
// Fasal 4 (SOA) + Fasal 6 (mobile grid) + Fasal 7 Strategy 1 (RLS merchant binding)
// Arahan: papan pemerintah peniaga - toggle status operasi, semak jualan, query.
import { Env } from '../types';
import { sendMessage, escapeMarkdownV2, inlineKeyboard } from '../telegram';
import { getCommandSession, setCommandSession, touchCommandSession } from '../services/session_cache';

/** Baris status kedai minimum. */
interface KedaiStatus {
  id: string;
  nama_kedai: string;
  status_kedai: string;
}

/**
 * Tarik rekod kedai peniaga berdasarkan merchant_telegram_id (RLS, Fasal 7 S1).
 * Soft-fail: return null jika fetch gagal.
 */
async function fetchKedaiPeniaga(env: Env, tgId: number): Promise<KedaiStatus | null> {
  const url = `${env.SUPABASE_URL}/rest/v1/senarai_kedai?merchant_telegram_id=eq.${tgId}&select=id,nama_kedai,status_kedai&limit=1`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<KedaiStatus>;
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows[0];
  } catch {
    return null; // Soft-fail
  }
}

/**
 * Kira jumlah pesanan hari ini untuk kedai (Fasal 7 Strategy 1 binding).
 * Soft-fail: return 0 jika fetch gagal.
 */
async function countPesananHariIni(env: Env, kedaiId: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const url = `${env.SUPABASE_URL}/rest/v1/rekod_pesanan?kedai_id=eq.${encodeURIComponent(kedaiId)}&created_at=gte.${today}T00:00:00.000Z&select=id`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!res.ok) return 0;
    const rows = (await res.json()) as Array<{ id: number }>;
    return Array.isArray(rows) ? rows.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Controller untuk arahan '/urus' dan '/dashboard'.
 * Papar pilihan: toggle status operasi, semak ringkasan jualan, query param.
 */
export async function handleMerchantDashboard(env: Env, chatId: number, tgId: number): Promise<void> {
  // Phase 33: ambil command session state dari cache dulu (Fasal 7 Strategy 2)
  // elak derive semula state & kurangkan query berulang ke Supabase.
  const sess = await getCommandSession(env, tgId);

  const kedai = await fetchKedaiPeniaga(env, tgId);
  if (!kedai) {
    await sendMessage(
      env,
      chatId,
      escapeMarkdownV2('⚠️ Kedai tidak dikesan. Taip /start untuk daftar kedai anda.')
    );
    return;
  }

  const isBuka = kedai.status_kedai === 'BUKA' || kedai.status_kedai === 'AKTIF';
  const pesananHariIni = await countPesananHariIni(env, kedai.id);

  // Start: Phase 36 - Anti Circular Re-Render Guard (Fasal 7 S2 cache)
  // Elak setCommandSession berulang setiap buka dashboard (punca glitch
  // re-render bulat). Hanya tulis session jika tiada, dan sentuh TTL.
  if (!sess) {
    await setCommandSession(env, {
      telegram_id: tgId,
      step: 'dashboard_view',
      last_active: new Date().toISOString(),
    });
  } else {
    await touchCommandSession(env, tgId);
  }
  // End: Phase 36 - Anti Circular Re-Render Guard

  const statusLabel = isBuka ? '🟢 BUKA' : '🔴 TUTUP';
  const toggleLabel = isBuka ? '🔴 Tutup Kedai' : '🟢 Buka Kedai';

  const text =
    escapeMarkdownV2('💼 PAPAN PEMERINTAH PERNIAGAAN\\n\\n') +
    escapeMarkdownV2(`Kedai: ${kedai.nama_kedai}\\n`) +
    escapeMarkdownV2(`Status: ${statusLabel}\\n`) +
    escapeMarkdownV2(`Pesanan Hari Ini: ${pesananHariIni}\\n\\n`) +
    escapeMarkdownV2('Pilih tindakan di bawah:');

  const buttons = inlineKeyboard([
    [{ text: toggleLabel, callback_data: `toggle_status:${kedai.id}` }, { text: '📊 Laporan', callback_data: 'merchant_report' }],
    [{ text: '📦 Pesanan', callback_data: 'merchant_orders' }, { text: '⚙️ Tetapan', callback_data: 'merchant_settings' }],
    [{ text: '➕ Menu', callback_data: 'merchant_menu' }, { text: '📈 Analitik', callback_data: 'merchant_analytics' }],
  ]);

  await sendMessage(env, chatId, text, buttons);
}

// End: Phase 31 - /urus & /dashboard Command Controller