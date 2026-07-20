// Start: Phase 70 - Customer Archive Module (pecahan dari customer.ts Fasal 4 SOA)
// Fasal 7 Strategy 1 (RLS bind pelanggan_telegram_id) + Phase 37/48 (pagination).
// Mengandungi handleSejarahPesanan + handleBatalkanPesanan.
import { Env } from '../types';
import { sendMessage, escapeMarkdownV2, customerMenuKeyboard } from '../telegram';
import { supabaseHeaders } from './customer';

/**
 * handleSejarahPesanan
 * Papar rekod pesanan pelanggan yang sudah COMPLETED atau REJECTED.
 * Diikat ke pelanggan_telegram_id (Fasal 7 Strategy 1 RLS).
 */
export async function handleSejarahPesanan(
  env: Env,
  chatId: number,
  tgId: number,
  page = 1
): Promise<void> {
  try {
    const PAGE_SIZE = 10;
    const offset = (page - 1) * PAGE_SIZE;
    const url =
      `${env.SUPABASE_URL}/rest/v1/rekod_pesanan` +
      `?pelanggan_telegram_id=eq.${tgId}` +
      `&status_penghantaran=in.(COMPLETED,REJECTED)` +
      `&select=id,jumlah_harga,status_pembayaran,status_penghantaran,created_at` +
      `&order=created_at.desc&limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(url, { method: 'GET', headers: supabaseHeaders(env) });
    if (!res.ok) {
      await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Gagal ambil sejarah pesanan.'), customerMenuKeyboard());
      return;
    }
    const rows = (await res.json()) as Array<{
      id: number;
      jumlah_harga?: number;
      status_pembayaran?: string;
      status_penghantaran?: string;
      created_at?: string;
    }>;
    if (!Array.isArray(rows) || rows.length === 0) {
      await sendMessage(env, chatId, escapeMarkdownV2(page > 1 ? '📭 Tiada lagi sejarah pesanan.' : '📭 Tiada sejarah pesanan lengkap/ditolak.'), customerMenuKeyboard());
      return;
    }
    const filtered = rows.filter((r) => {
      const s = (r.status_penghantaran || '').toUpperCase();
      return s === 'COMPLETED' || s === 'REJECTED';
    });
    if (filtered.length === 0) {
      await sendMessage(env, chatId, escapeMarkdownV2(page > 1 ? '📭 Tiada lagi sejarah pesanan.' : '📭 Tiada sejarah pesanan lengkap/ditolak.'), customerMenuKeyboard());
      return;
    }
    const lines = filtered
      .map((r) => {
        const tarikh = (r.created_at || '').slice(0, 10);
        return `#${r.id} \\- RM${(Number(r.jumlah_harga) || 0).toFixed(2)} \\[${r.status_penghantaran}\\] ${tarikh}`;
      })
      .join('\n');
    const replyMarkup = filtered.length >= PAGE_SIZE
      ? { inline_keyboard: [[{ text: '➡️ Laman Seterusnya', callback_data: `sejarah_page:${page + 1}` }]] }
      : undefined;
    await sendMessage(
      env,
      chatId,
      escapeMarkdownV2(`📜 SEJARAH PESANAN \\(Laman ${page}\\):\\n`) + lines,
      replyMarkup ?? customerMenuKeyboard()
    );
  } catch {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Ralat baca sejarah pesanan.'), customerMenuKeyboard());
  }
}

/**
 * handleBatalkanPesanan
 * Benarkan batal pesanan HANYA jika status_penghantaran == PENDING.
 * Validasi mutasi melalui canCancelOrder() di orders.ts (Fasal 7 Strategy 4).
 * Format: /batalkan_pesanan <ID>
 */
export async function handleBatalkanPesanan(
  env: Env,
  chatId: number,
  tgId: number,
  rawCmd: string
): Promise<void> {
  const parts = rawCmd.split(/\s+/);
  const orderId = Number(parts[1]);
  if (!orderId || Number.isNaN(orderId)) {
    await sendMessage(env, chatId, escapeMarkdownV2('Format: /batalkan_pesanan <ID_PESANAN>'), customerMenuKeyboard());
    return;
  }
  try {
    const url = `${env.SUPABASE_URL}/rest/v1/rekod_pesanan?id=eq.${orderId}&pelanggan_telegram_id=eq.${tgId}&select=status_penghantaran,kedai_id`;
    const res = await fetch(url, { method: 'GET', headers: supabaseHeaders(env) });
    if (!res.ok) {
      await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Gagal semak pesanan.'), customerMenuKeyboard());
      return;
    }
    const rows = (await res.json()) as Array<{ status_penghantaran?: string; kedai_id?: string }>;
    if (!Array.isArray(rows) || rows.length === 0) {
      await sendMessage(env, chatId, escapeMarkdownV2('❌ Pesanan tidak dijumpai dalam akaun anda.'), customerMenuKeyboard());
      return;
    }
    const status = (rows[0].status_penghantaran || 'PENDING') as 'PENDING' | 'COMPLETED';
    const { canCancelOrder } = await import('../orders');
    if (!canCancelOrder(status)) {
      await sendMessage(env, chatId, escapeMarkdownV2('⛔ Pesanan tidak boleh dibatalkan (sudah diproses).'), customerMenuKeyboard());
      return;
    }
    const patchUrl = `${env.SUPABASE_URL}/rest/v1/rekod_pesanan?id=eq.${orderId}&pelanggan_telegram_id=eq.${tgId}`;
    const patch = await fetch(patchUrl, {
      method: 'PATCH',
      headers: { ...supabaseHeaders(env), Prefer: 'return=minimal' },
      body: JSON.stringify({ status_penghantaran: 'REJECTED', status_pembayaran: 'DIBATALKAN' }),
    });
    if (patch.ok) {
      await sendMessage(env, chatId, escapeMarkdownV2(`✅ Pesanan #${orderId} berjaya dibatalkan.`), customerMenuKeyboard());
    } else {
      await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Gagal batalkan pesanan.'), customerMenuKeyboard());
    }
  } catch {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Ralat batalkan pesanan.'), customerMenuKeyboard());
  }
}
// End: Phase 70 - Customer Archive Module