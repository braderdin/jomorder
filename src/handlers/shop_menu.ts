// Start: Phase 31 - /menu Command Controller (LOOP 2 File 3)
// Fasal 4 (SOA) + Fasal 6 (inline carousel) + Fasal 7 Strategy 1 (RLS binding)
// Arahan: tarik entiti restoran AKTIF dari DB dan kompil ke butang inline carousel.
import { Env } from '../types';
import { sendMessage, escapeMarkdownV2, inlineKeyboard, customerReplyKeyboard } from '../telegram';

/** Entiti kedai minimum untuk paparan carousel. */
interface KedaiAktif {
  id: string;
  nama_kedai: string;
}

/**
 * Tarik senarai kedai berstatus operasi (bukan MENUNGGU_PENGESAHAN).
 * Diikat ke multi-tenant via service_role (Fasal 7 Strategy 1).
 * Soft-fail: return [] jika fetch gagal.
 */
async function fetchKedaiAktif(env: Env): Promise<KedaiAktif[]> {
  // Phase 34: Hanya kedai AKTIF (drop TUTUP), dan buang node tamat langganan.
  const url = `${env.SUPABASE_URL}/rest/v1/senarai_kedai?status_kedai=in.(AKTIF,BUKA)&select=id,nama_kedai,tamat_langganan_pada&order=nama_kedai.asc&limit=20`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{ id: string; nama_kedai: string; tamat_langganan_pada: string | null }>;
    if (!Array.isArray(rows)) return [];
    const now = Date.now();
    return rows
      .filter((r) => {
        // Phase 34: Drop node tamat langganan (expired storefront).
        if (r.tamat_langganan_pada) {
          const exp = new Date(r.tamat_langganan_pada).getTime();
          if (!isNaN(exp) && now > exp) return false;
        }
        return true;
      })
      .map((r) => ({ id: r.id, nama_kedai: r.nama_kedai }));
  } catch {
    return []; // Soft-fail (Fasal 7 Strategy 4)
  }
}

/**
 * Controller untuk arahan '/menu'.
 * Papar kedai aktif dalam grid inline (max 2 btn/row, Fasal 6 mobile grid).
 * Setiap butang memanggil callback 'view_shop:{id}' yang sedia di-routing
 * ke handleViewShopMenu (Phase 24).
 */
export async function handleShopMenu(env: Env, chatId: number): Promise<void> {
  const kedai = await fetchKedaiAktif(env);
  if (kedai.length === 0) {
    await sendMessage(
      env,
      chatId,
      escapeMarkdownV2('🍽️ Tiada kedai aktif buat masa ini. Cuba lagi sebentar.')
    );
    return;
  }

  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let i = 0; i < kedai.length; i += 2) {
    const row: Array<{ text: string; callback_data: string }> = [];
    row.push({ text: `🏪 ${kedai[i].nama_kedai}`, callback_data: `view_shop:${kedai[i].id}` });
    if (kedai[i + 1]) {
      row.push({ text: `🏪 ${kedai[i + 1].nama_kedai}`, callback_data: `view_shop:${kedai[i + 1].id}` });
    }
    rows.push(row);
  }

  rows.push([{ text: '⬅️ Kembali', callback_data: 'nav:main' }]);
  const text = escapeMarkdownV2('📋 SENARAI KEDAI AKTIF\\n\\nPilih kedai untuk lihat menu:\\n');
  await sendMessage(env, chatId, text, inlineKeyboard(rows), customerReplyKeyboard());
}

// End: Phase 31 - /menu Command Controller

// Start: Phase 51 - /menu_kedai public browse alias (customer storefront entry)
/**
 * handleMenuKedai
 * Alias untuk /menu_kedai: papar senarai kedai aktif kepada pelanggan supaya
 * mereka boleh "Lihat Menu" terus ke catalog (view_shop:{id}).
 * Delegate ke handleShopMenu (single source of truth, Fasal 4 SOA).
 */
export async function handleMenuKedai(env: Env, chatId: number): Promise<void> {
  await handleShopMenu(env, chatId);
}
// End: Phase 51 - /menu_kedai public browse alias
