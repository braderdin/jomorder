// Start: Phase 31 - /start & /mula Command Controller (LOOP 1 File 1)
// Fasal 4 (SOA) + Fasal 6 (mobile keyboard) + Fasal 7 Strategy 1 (RLS identity check)
// Arahan: kenal pasti identiti user (customer vs merchant) lalu render interface sesuai.
// Phase 38: deep-link payload slicing isolation (ref=xxx) -> Redis state bind.
import { Env, TelegramUser } from '../types';
import { sendMessage, escapeMarkdownV2, customerMenuKeyboard, merchantMenuKeyboard } from '../telegram';
import { checkMerchantExists } from '../db';
import { setState } from '../redis';
import { handleHelpCategory } from './help';

// Start: Phase 45 - Rich Start Inline Keyboard (Fasal 6 mobile 2-3 btn/row)
function startQuickActionKeyboard(): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } {
  return {
    inline_keyboard: [
      [{ text: '🍜 Cari Makan', callback_data: 'open_nearby' }, { text: '🛒 Troli', callback_data: 'open_cart' }],
      [{ text: '🏪 Daftar Kedai', callback_data: 'merchant_settings' }, { text: '📊 Status', callback_data: 'merchant_report' }],
      [{ text: '❓ Bantuan', callback_data: 'help_menu' }],
    ],
  };
}
// End: Phase 45 - Rich Start Inline Keyboard

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

  // Start: Phase 47 - Help Deep-Link Router (start?help_xxx)
  // Jika payload mengandungi help_peniaga/help_pelanggan/help_pentadbir,
  // route terus ke panduan kategori tanpa semak peranan.
  if (rawText && rawText.includes('help_')) {
    if (rawText.includes('help_peniaga')) {
      await handleHelpCategory(env, chatId, 'peniaga');
      return;
    }
    if (rawText.includes('help_pelanggan')) {
      await handleHelpCategory(env, chatId, 'pelanggan');
      return;
    }
    if (rawText.includes('help_pentadbir')) {
      await handleHelpCategory(env, chatId, 'pentadbir');
      return;
    }
  }
  // End: Phase 47 - Help Deep-Link Router

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
      escapeMarkdownV2('╔══════════════════════╗\\n') +
      escapeMarkdownV2('   💼 JomOrder Modern-Siber\\n') +
      escapeMarkdownV2('╚══════════════════════╝\\n\\n') +
      escapeMarkdownV2(`🤝 Hai ${firstName}, papan pemerintah kedai anda sedia!\\n`) +
      escapeMarkdownV2('Urus niaga F&B dengan pantas:\\n\\n') +
      escapeMarkdownV2('🟢 *Buka/Tutup* kedai sepantas 1 tap\\n') +
      escapeMarkdownV2('📦 *Semak* pesanan masuk\\n') +
      escapeMarkdownV2('📊 *Laporan* jualan + CSV\\n') +
      escapeMarkdownV2('🎟️ *Cipta* kupon diskaun\\n\\n') +
      escapeMarkdownV2('Taip /urus untuk buka papan penuh\\. Selamat berniaga! 🇲🇾');
    await sendMessage(env, chatId, text, merchantMenuKeyboard());
    return;
  }

  // Default: Customer interface
  const text =
    escapeMarkdownV2('╔══════════════════════╗\\n') +
    escapeMarkdownV2('   🍔 JomOrder Modern-Siber\\n') +
    escapeMarkdownV2('╚════════════════════╝\\n\\n') +
    escapeMarkdownV2(`👋 Hai ${firstName}, selamat datang ke keluarga JomOrder!\\n`) +
    escapeMarkdownV2('Cari makanan sedap berdekatan anda:\\n\\n') +
    escapeMarkdownV2('📍 *Kedai Berdekatan* — cari restoran berhampiran\\n') +
    escapeMarkdownV2('🛒 *Troli* — semak pesanan anda\\n') +
    escapeMarkdownV2('🎟️ *Kupon* — guna kod diskaun\\n') +
    escapeMarkdownV2('📖 *Sejarah* — lihat pesanan lampau\\n\\n') +
    escapeMarkdownV2('Tekan butang di bawah untuk mula. Selamat menjamu selera! 🇲🇾');
  await sendMessage(env, chatId, text, startQuickActionKeyboard());
}

// End: Phase 31 - /start & /mula Command Controller