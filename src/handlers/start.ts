// Start: Phase 31 - /start & /mula Command Controller (LOOP 1 File 1)
// Fasal 4 (SOA) + Fasal 6 (mobile keyboard) + Fasal 7 Strategy 1 (RLS identity check)
// Arahan: kenal pasti identiti user (customer vs merchant) lalu render interface sesuai.
// Phase 38: deep-link payload slicing isolation (ref=xxx) -> Redis state bind.
import { Env, TelegramUser } from '../types';
import { sendMessage, escapeMarkdownV2, customerMenuKeyboard, merchantMenuKeyboard } from '../telegram';
import { checkMerchantExists } from '../db';
import { setState } from '../redis';

/**
 * Controller untuk arahan '/start' dan '/mula'.
 * Logik:
 *  1. Semak sama ada Telegram ID wujud dalam senarai_kedai (merchant).
 *  2. Jika merchant -> papar Merchant Control Dashboard keyboard + mesej peranan.
 *  3. Jika customer -> papar Customer Main Menu keyboard + mesej alu-aluan.
 *  4. Phase 38: slice deep-link ref param (start?ref=SHOPID) selamat ke Redis
 *     tanpa bocor session boundary ke chat lain.
 * Soft-fail: jika DB gagal, anggap customer (fail-open) supaya bot tak tersekat.
 */
export async function handleStart(env: Env, chatId: number, user: TelegramUser | undefined, rawText?: string): Promise<void> {
  const tgId = user?.id;
  const firstName = user?.first_name || 'Pengguna';

  // Start: Phase 38 - Deep-link payload slicing isolation
  // Extract ref=SHOPID dari "/start ref=SHOPID" atau "/start?ref=SHOPID".
  // Simpan ke Redis state scoped STRICTLY ke tgId ini (tiada cross-session leak).
  let deepRef: string | null = null;
  if (rawText) {
    const m = rawText.match(/(?:^|\s)(?:ref=)?([A-Za-z0-9_-]{6,40})$/);
    if (m && m[1] && !m[1].startsWith('/')) {
      deepRef = m[1];
      try {
        await setState(env, {
          merchant_telegram_id: tgId as number,
          step: 'idle',
          deep_link_ref: deepRef,
          last_active: new Date().toISOString(),
        } as never);
      } catch { /* soft-fail (Fasal 7 Strategy 4) */ }
    }
  }
  // End: Phase 38 - Deep-link payload slicing isolation

  let isMerchant = false;
  if (typeof tgId === 'number') {
    try {
      isMerchant = await checkMerchantExists(env, tgId);
    } catch {
      isMerchant = false; // Soft-fail (Fasal 7 Strategy 4)
    }
  }

  if (isMerchant) {
    const text =
      escapeMarkdownV2('💼 SELAMAT DATANG KE PAPAN PEMERINTAH PERNIAGAAN\\n\\n') +
      escapeMarkdownV2(`Hai ${firstName}, kedai anda telah dikesan secara selamat\\. Gunakan butang di bawah untuk mengurus operasi:\\n`) +
      escapeMarkdownV2('• 🟢 Buka/Tutup Kedai\\n') +
      escapeMarkdownV2('• 📦 Semak Pesanan\\n') +
      escapeMarkdownV2('• 📊 Laporan Jualan\\n') +
      escapeMarkdownV2('• 💡 Taip /urus untuk buka papan pemerintah penuh\\.');
    await sendMessage(env, chatId, text, merchantMenuKeyboard());
    return;
  }

  // Default: Customer interface
  const text =
    escapeMarkdownV2('🍔 SELAMAT DATANG KE JomOrder\\n\\n') +
    escapeMarkdownV2(`Hai ${firstName}, cari kedai makanan berdekatan dan buat pesanan dengan pantas\\. Gunakan butang di bawah:\\n`) +
    escapeMarkdownV2('• 🍔 Lihat Menu\\n') +
    escapeMarkdownV2('• 🛒 Troli\\n') +
    escapeMarkdownV2('• 📍 Kedai Berdekatan\\n') +
    escapeMarkdownV2('• ❓ Taip /help untuk panduan penuh\\.');
  await sendMessage(env, chatId, text, customerMenuKeyboard());
}

// End: Phase 31 - /start & /mula Command Controller