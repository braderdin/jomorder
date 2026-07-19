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
 */
export async function handleStart(env: Env, chatId: number, user: TelegramUser | undefined, rawText?: string): Promise<void> {
  const tgId = user?.id;
  const firstName = user?.first_name || 'Pengguna';

  // Start: Phase 38 - Deep-link payload slicing isolation
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
      escapeMarkdownV2('╔═══════════════════════════╗\\n') +
      escapeMarkdownV2('   💼 JomOrder Modern-Siber\\n') +
      escapeMarkdownV2('╚═══════════════════════════╝\\n\\n') +
      escapeMarkdownV2('🤝 Hai ' + firstName + ', papan pemerintah kedai anda sedia!\\n\\n') +
      escapeMarkdownV2('Urus niaga F&B dengan pantas:\\n\\n') +
      escapeMarkdownV2('🟢 *Buka/Tutup* kedai sepantas 1 tap\\n') +
      escapeMarkdownV2('📋 *Menu Kedai* — /menu_kedai\\n') +
      escapeMarkdownV2('📦 *Semak* pesanan masuk\\n') +
      escapeMarkdownV2('📊 *Laporan* jualan + CSV\\n') +
      escapeMarkdownV2('🎟️ *Cipta* kupon diskaun\\n') +
      escapeMarkdownV2('⚙️ *Tetapan* — /tetapan (muat naik QR)\\n\\n') +
      escapeMarkdownV2('Taip /urus untuk buka papan penuh\\. Selamat berniaga! 🇲🇾');
    await sendMessage(env, chatId, text, merchantMenuKeyboard());
    return;
  }

  // Default: Customer interface
  const text =
    escapeMarkdownV2('╔═══════════════════════════╗\\n') +
    escapeMarkdownV2('   🍔 JomOrder Modern-Siber\\n') +
    escapeMarkdownV2('╚═══════════════════════════╝\\n\\n') +
    escapeMarkdownV2('👋 Hai ' + firstName + ', selamat datang ke keluarga JomOrder!\\n\\n') +
    escapeMarkdownV2('Cari makanan sedap berdekatan anda:\\n\\n') +
    escapeMarkdownV2('📍 *Kedai Berdekatan* — /cari_makan\\n') +
    escapeMarkdownV2('🏪 *Menu Kedai* — /menu_kedai\\n') +
    escapeMarkdownV2('🛒 *Troli* — semak pesanan anda\\n') +
    escapeMarkdownV2('🎟️ *Kupon* — guna kod diskaun\\n') +
    escapeMarkdownV2('📖 *Sejarah* — /sejarah_pesanan\\n\\n') +
    escapeMarkdownV2('Tekan butang di bawah untuk mula. Selamat menjamu selera! 🇲🇾');
  await sendMessage(env, chatId, text, startQuickActionKeyboard());
}

// Start: Phase 51 - Adaptive Welcome Card (role + time-aware greeting)
export async function handleAdaptiveWelcome(env: Env, chatId: number, user: TelegramUser | undefined): Promise<void> {
  const firstName = user?.first_name || 'Pengguna';
  const hour = new Date().getHours();
  let greeting = 'Selamat datang';
  if (hour < 12) greeting = 'Selamat pagi';
  else if (hour < 15) greeting = 'Selamat tengahari';
  else if (hour < 19) greeting = 'Selamat petang';
  else greeting = 'Selamat malam';

  let isMerchant = false;
  try {
    if (user?.id) isMerchant = await checkMerchantExists(env, user.id);
  } catch {
    isMerchant = false; // soft-fail
  }

  if (isMerchant) {
    const text =
      escapeMarkdownV2('🌟 ' + greeting + ', ' + firstName + '\\n') +
      escapeMarkdownV2('Papan pemerintah kedai anda:\\n') +
      escapeMarkdownV2('🟢 Buka/Tutup · 📦 Pesanan · 📊 Laporan\\n\\n') +
      escapeMarkdownV2('Taip /urus untuk teruskan. Selamat berniaga! 🇲🇾');
    await sendMessage(env, chatId, text, merchantMenuKeyboard());
  } else {
    const text =
      escapeMarkdownV2('🌟 ' + greeting + ', ' + firstName + '\\n') +
      escapeMarkdownV2('Cari makan berdekatan anda:\\n') +
      escapeMarkdownV2('📍 Kedai · 🛒 Troli · 🎟️ Kupon\\n\\n') +
      escapeMarkdownV2('Tekan butang untuk mula. Selamat menjamu selera! 🇲🇾');
    await sendMessage(env, chatId, text, startQuickActionKeyboard());
  }
}
// End: Phase 51 - Adaptive Welcome Card

// End: Phase 31 - /start & /mula Command Controller