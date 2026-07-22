// Start: Phase 31 - /start & /mula Command Controller (LOOP 1 File 1)
// Fasal 4 (SOA) + Fasal 6 (mobile keyboard) + Fasal 7 Strategy 1 (RLS identity check)
// Arahan: kenal pasti identiti user (customer vs merchant) lalu render interface sesuai.
// Phase 38: deep-link payload slicing isolation (ref=xxx) -> Redis state bind.
import { Env, TelegramUser } from '../types';
import { sendMessage, escapeMarkdownV2, customerMenuKeyboard, merchantMenuKeyboard, navGrid, merchantReplyKeyboard, customerReplyKeyboard } from '../telegram';
import { checkMerchantExists } from '../db';
import { setState } from '../redis';
import { handleHelpCategory } from './help';
import { setNav } from './navigation';
import { handleCustomerGui } from './customer_gui';
import { handleMerchantGui } from './merchant_gui';
import { i18n } from '../services/i18n';
import { sendPhoto } from '../telegram';
import { getFounderShop, getFounderMenu } from '../db';

// Start: Phase 55 - Main Menu Navigation Grid (3-col + BACK + BM/EN)
function startQuickActionKeyboard(): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } {
  return navGrid();
}
// End: Phase 55 - Main Menu Navigation Grid

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
    if (typeof tgId === 'number') await setNav(env, tgId, 'merchant_main');
    await handleAdaptiveWelcome(env, chatId, user);
    return;
  }

  // Default: Customer interface
  if (typeof tgId === 'number') await setNav(env, tgId, 'customer_main');
  // Phase 59: i18n hook (locale BM default; EN toggle via nav:lang akan datang).
  void i18n('welcome', 'BM');
  await handleAdaptiveWelcome(env, chatId, user);
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

// Start: Phase 60 - Founder Demo Shop View (MDEC GLOW wow, lihat dari bot)
function founderViewKeyboard(): { inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> } {
  return {
    inline_keyboard: [
      [{ text: '🌐 Lihat Portal Demo', url: 'https://jomorder-portal.vercel.app/' }],
      [
        { text: '⬅️ Kembali', callback_data: 'nav:customer' },
      ],
    ],
  };
}

/**
 * Papar kedai contoh pengasas terus dalam bot (dummy, tiada order sebenar).
 * Soft-fail: jika DB gagal, hantar mesej fallback.
 */
export async function handleFounderView(env: Env, chatId: number): Promise<void> {
  try {
    const shop = await getFounderShop(env);
    const menu = await getFounderMenu(env);
    if (!shop) {
      await sendMessage(env, chatId, '⚠️ Kedai contoh sedang disediakan. Sila cuba sebentar lagi.', founderViewKeyboard());
      return;
    }
    const lines: string[] = [];
    lines.push('🏆 *KEDAI CONTOH PENGASAS*');
    lines.push('');
    lines.push('🍴 *' + shop.nama_kedai + '*');
    lines.push('Status: ' + (shop.status_kedai === 'DILULUSKAN' ? '✅ Diluluskan' : shop.status_kedai));
    lines.push('');
    lines.push('📋 *Menu Demo:*');
    if (menu.length === 0) {
      lines.push('  (menu dimuatkan tidak lama lagi)');
    } else {
      menu.slice(0, 8).forEach((m) => {
        lines.push('  • ' + m.nama_hidangan + ' — RM ' + Number(m.harga).toFixed(2));
      });
    }
    lines.push('');
    lines.push('Ini kedai demo untuk pendaftar MDEC GLOW. Daftar kedai anda sendiri dengan /daftar!');
    await sendMessage(env, chatId, escapeMarkdownV2(lines.join('\n')), founderViewKeyboard());
  } catch {
    await sendMessage(env, chatId, '⚠️ Kedai contoh tidak tersedia buat sementara.', founderViewKeyboard());
  }
}
// End: Phase 60 - Founder Demo Shop View

// Start: Phase 38 - Deep-Link Handler (startapp=xxx)
/**
 * handleStartDeepLink
 * Tangani /start dengan payload deep-link (contoh: ?startapp=menu).
 * Router ke GUI yang sesuai berdasarkan payload.
 */
export async function handleStartDeepLink(
  env: Env,
  chatId: number,
  user: TelegramUser | undefined,
  payload: string
): Promise<void> {
  const tgId = user?.id ?? chatId;
  if (payload.startsWith('menu')) {
    await handleCustomerGui(env, chatId, tgId);
    return;
  }
  if (payload.startsWith('app')) {
    await handleCustomerGui(env, chatId, tgId);
    return;
  }
  // Fallback: papar welcome standard
  await handleAdaptiveWelcome(env, chatId, user);
}
// End: Phase 38 - Deep-Link Handler

// End: Phase 31 - /start & /mula Command Controller
