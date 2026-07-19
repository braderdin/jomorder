// Start: Phase 51 - /tetapan Command Controller (account preferences)
// Fasal 4 (SOA) + Fasal 6 (mobile grid) + Fasal 7 Strategy 2 (state isolation).
// Papar panel tetapan akaun: tukar bahasa BM/EN, toggle notifikasi pesanan.
import { Env } from '../types';
import { sendMessage, escapeMarkdownV2, inlineKeyboard } from '../telegram';
import { getState, setState } from '../redis';

/**
 * handleTetapan
 * Papar panel tetapan akaun pelanggan/peniaga dengan toggle BM/EN dan
 * notifikasi pesanan. Simpan pref ke state engine (Redis, TTL 1 jam).
 * Soft-fail: jika state gagal baca, papar default BM + notif ON.
 */
export async function handleTetapan(env: Env, chatId: number, tgId: number): Promise<void> {
  let locale = 'ms';
  let notif = true;
  try {
    const st = await getState(env, tgId);
    if (st) {
      locale = (st as unknown as { locale?: string }).locale || 'ms';
      notif = (st as unknown as { notif_pesanan?: boolean }).notif_pesanan !== false;
    }
  } catch {
    // soft-fail: kekal default
  }

  const text =
    escapeMarkdownV2('⚙️ TETAPAN AKAUN\\n\\n') +
    escapeMarkdownV2(`Bahasa: ${locale === 'ms' ? 'Bahasa Melayu' : 'English'}\\n`) +
    escapeMarkdownV2(`Notifikasi Pesanan: ${notif ? 'HIDUP' : 'MATI'}\\n\\n`) +
    escapeMarkdownV2('Pilih untuk tukar:');

  const buttons = inlineKeyboard([
    [
      { text: locale === 'ms' ? '🇲🇾 BM (aktif)' : '🇲🇾 BM', callback_data: 'set_locale:ms' },
      { text: locale === 'en' ? '🇬🇧 EN (aktif)' : '🇬🇧 EN', callback_data: 'set_locale:en' },
    ],
    [
      { text: notif ? '🔔 Notif: HIDUP' : '🔕 Notif: MATI', callback_data: 'set_notif' },
    ],
  ]);

  await sendMessage(env, chatId, text, buttons);
}

/**
 * handleTetapanCallback
 * Process toggle dari panel tetapan (set_locale: / set_notif).
 * Return true jika callback diuruskan.
 */
export async function handleTetapanCallback(
  env: Env,
  cbChatId: number,
  tgId: number,
  action: string
): Promise<boolean> {
  if (!action.startsWith('set_locale:') && action !== 'set_notif') return false;

  try {
    const st = await getState(env, tgId);
    const base = st || { merchant_telegram_id: tgId, step: 'idle', last_active: new Date().toISOString() };
    const next = { ...base } as Record<string, unknown>;
    if (action.startsWith('set_locale:')) {
      next.locale = action.slice('set_locale:'.length);
    } else if (action === 'set_notif') {
      const cur = (st as unknown as { notif_pesanan?: boolean }).notif_pesanan !== false;
      next.notif_pesanan = !cur;
    }
    await setState(env, next as never);
  } catch {
    // soft-fail
  }

  await handleTetapan(env, cbChatId, tgId);
  return true;
}
// End: Phase 51 - /tetapan Command Controller