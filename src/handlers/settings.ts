// Start: Phase 51 - /tetapan Command Controller (account preferences)
// Fasal 4 (SOA) + Fasal 6 (mobile grid) + Fasal 7 Strategy 2 (state isolation).
// Papar panel tetapan akaun: tukar bahasa BM/EN, toggle notifikasi pesanan.
import { Env } from '../types';
import { sendMessage, escapeMarkdownV2, inlineKeyboard, navGrid } from '../telegram';
import { getState, setState } from '../redis';
import { uploadMerchantAsset } from '../services/storage';
import { validateOptimizedSize } from '../services/image_optimize';

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
    [
      { text: '📤 Muat Naik QR DuitNow', callback_data: 'upload_qr' },
      { text: '📍 Zon Operasi', callback_data: 'merchant_zon' },
    ],
    [
      { text: '🏪 Menu Kedai', callback_data: 'merchant_menu' },
    ],
    [
      { text: '⬅️ Kembali', callback_data: 'nav:main' },
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
  if (!action.startsWith('set_locale:') && action !== 'set_notif' && action !== 'upload_qr' && action !== 'merchant_zon') return false;

  try {
    const st = await getState(env, tgId);
    const base = st || { merchant_telegram_id: tgId, step: 'idle', last_active: new Date().toISOString() };
    const next = { ...base } as Record<string, unknown>;
    if (action.startsWith('set_locale:')) {
      next.locale = action.slice('set_locale:'.length);
    } else if (action === 'set_notif') {
      const cur = (st as unknown as { notif_pesanan?: boolean }).notif_pesanan !== false;
      next.notif_pesanan = !cur;
    } else if (action === 'upload_qr') {
      // Buka terus flow muat naik QR tanpa suruh taip command (no-command UX).
      next.step = 'awaiting_qr_upload';
      await setState(env, next as never);
      // Start: Phase 62 - BACK nested ke merchant GUI bukan nav:main
      const kb = inlineKeyboard([[ { text: '⬅️ Kembali', callback_data: 'back:merchant' } ]]);
      // End: Phase 62 - BACK nested
      await sendMessage(env, cbChatId, escapeMarkdownV2('📤 MUAT NAIK QR DUITNOW\\n\\nHantar gambar QR ke chat ini. Sistem mampat ke WebP (<150KB) & simpan ke R2.'), kb);
      return true;
    } else if (action === 'merchant_zon') {
      // Buka terus flow zon operasi tanpa suruh taip command.
      next.step = 'awaiting_zon_operasi';
      await setState(env, next as never);
      // Start: Phase 62 - BACK nested ke merchant GUI
      const kb = inlineKeyboard([[ { text: '⬅️ Kembali', callback_data: 'back:merchant' } ]]);
      // End: Phase 62 - BACK nested
      await sendMessage(env, cbChatId, escapeMarkdownV2('📍 ZON OPERASI\\n\\nHantar radius penghantaran (km) ke chat ini.\\nContoh: 10'), kb);
      return true;
    }
    await setState(env, next as never);
  } catch {
    // soft-fail
  }

  await handleTetapan(env, cbChatId, tgId);
  return true;
}
// Start: Phase 57 - QR DuitNow Upload ke R2
// Bila user hantar photo dgn step='awaiting_qr_upload', fetch bytes,
// validate <150KB, upload ke R2, simpan URL ke state. BM error messages.
export async function handleUploadQr(
  env: Env,
  chatId: number,
  tgId: number,
  fileBytes: Uint8Array
): Promise<void> {
  const sizeCheck = validateOptimizedSize(fileBytes);
  if (!sizeCheck.ok) {
    await sendMessage(env, chatId, `⚠️ ${sizeCheck.reason}. Sila compress gambar ke <150KB (format WebP).`, undefined);
    return;
  }
  const res = await uploadMerchantAsset(env, tgId, 'duitnow_qr', fileBytes);
  if (!res.success || !res.url) {
    const msg = res.error ? `⚠️ Gagal muat naik: ${res.error}` : '⚠️ Gagal muat naik QR.';
    await sendMessage(env, chatId, msg, undefined);
    return;
  }
  // Simpan URL ke state (merge, bukan overwrite).
  const st = await getState(env, tgId);
  const next = { ...st, merchant_telegram_id: tgId, duitnow_qr_url: res.url, last_active: new Date().toISOString() } as never;
  await setState(env, next);
  const kb = inlineKeyboard([[ { text: '⬅️ Kembali', callback_data: 'nav:main' } ]]);
  await sendMessage(env, chatId, `✅ QR DuitNow berjaya dimuat naik!\n\nURL: ${res.url}`, kb);
}
// End: Phase 57 - QR DuitNow Upload ke R2

// End: Phase 51 - /tetapan Command Controller
