// Start: Phase 31 - /help & /bantuan Command Controller (LOOP 1 File 2)
// Fasa 4 (SOA) + Fasa 6 (panduan HTML + barisan operator inline)
// Perintah: memaparkan panduan interaktif HTML dengan butang dinamik ke barisan operator.
import { Env, TelegramUser, NATIVE_COMMAND_LIST } from '../types';

const TELEGRAM_API = 'https://api.telegram.org/bot';
 
/** 
 * Hantar mesej berformat HTML (parse_mode=HTML) dengan papan kekunci inline.
 * Dipisahkan dari sendMessage MarkdownV2 standard supaya panduan kekal kaya
 * tanpa perlu escape setiap aksara MarkdownV2 (Fasa 6).
 */ 
async function sendHtmlMessage(
  env: Env,
  chatId: number,
  htmlText: string,
  replyMarkup?: object
): Promise<void> {
  const url = `${TELEGRAM_API}${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text: htmlText,
    parse_mode: 'HTML',
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // Soft-fail (Fasa 7 Strategi 4): jangan biarkan panduan gagal secara keras
  }
}
 
/** 
 * Controller untuk perintah '/help' dan '/bantuan'.
 * Memaparkan dokumen panduan pengguna berformat HTML dengan butang inline yang
 * terus menghubungkan ke barisan operator sokongan (Fasa 6 mobile grid).
 */ 
export async function handleHelp(env: Env, chatId: number, _user: TelegramUser | undefined): Promise<void> {
  const customerCommands = NATIVE_COMMAND_LIST.filter(cmd => cmd.role === 'customer' || cmd.role === 'both');
  const merchantCommands = NATIVE_COMMAND_LIST.filter(cmd => cmd.role === 'merchant' || cmd.role === 'both');
  const adminCommands = NATIVE_COMMAND_LIST.filter(cmd => cmd.role === 'admin' || cmd.role === 'both');

  const html =
    '<b>📖 PANDUAN JomOrder Modern-Siber</b>\n\n' +
    'Pilih peranan anda untuk panduan lengkap:\\n\\n' +
    `👨‍🍳 <b>Peniaga (${merchantCommands.length}):</b> ${merchantCommands.map(c => c.command).join(' · ')}\n\n` +
    `🛒 <b>Pelanggan (${customerCommands.length}):</b> ${customerCommands.map(c => c.command).join(' · ')}\n\n` +
    `⚙️ <b>Pentadbir (${adminCommands.length}):</b> ${adminCommands.map(c => c.command).join(' · ')}\n\n` +
    `✅ <b>JUMLAH ${NATIVE_COMMAND_LIST.length} PERINTAH AKTIF</b>\n\n` +
    '🚀 <b>Cara membuat pesanan:</b> tekan 📍 Kedai Berdekatan → pilih kedai → tambah ke troli → 💳 Bayar Sekarang.\n\n' +
    'Ada masalah? Hubungi barisan operator kami di bawah 👇';


 
  const inline = {
    inline_keyboard: [
      [{ text: '🏪 Panduan Peniaga', callback_data: 'help_merchant' }, { text: '🛒 Panduan Pelanggan', callback_data: 'help_customer' }],
      [{ text: '⚙️ Pentadbir', callback_data: 'help_admin' }, { text: '💬 Operator', url: 'https://t.me/JomOrderSupport' }],
      [{ text: '📍 Cari Kedai', callback_data: 'open_nearby' }, { text: '🛒 Troli', callback_data: 'open_cart' }],
    ],
  };

  await sendHtmlMessage(env, chatId, html, inline);
}

// Start: Phase 47 - Category-Specific Help Deep-Link Router
/** 
 * handleHelpCategory
 * Memaparkan panduan mendalam mengikut kategori (peniaga/pelanggan/pentadbir).
 * Dipanggil dari deep-link start payload (help_xxx) atau callback help_xxx.
 */ 
export async function handleHelpCategory(
  env: Env,
  chatId: number,
  category: 'peniaga' | 'pelanggan' | 'pentadbir',
  locale: 'ms' | 'en' = 'ms'
): Promise<void> {
  let html = '<b>📖 PANDUAN JomOrder</b>\n\n';
  if (locale === 'en') {
    if (category === 'peniaga') {
      const commands = NATIVE_COMMAND_LIST.filter(cmd => cmd.role === 'merchant' || cmd.role === 'both');
      html +=
        '👨‍🍳 <b>MERCHANT GUIDE</b>\n\n' +
        commands.map(c => `• <b>${c.command}</b> — ${c.description}`).join('\n') + '\n\n' +
        'Use the 📍 Share Location button to set shop location.';
    } else if (category === 'pelanggan') {
      const commands = NATIVE_COMMAND_LIST.filter(cmd => cmd.role === 'customer' || cmd.role === 'both');
      html +=
        '🛒 <b>CUSTOMER GUIDE</b>\n\n' +
        commands.map(c => `• <b>${c.command}</b> — ${c.description}`).join('\n') + '\n\n' +
        'To order: 📍 Nearby Shops → choose → cart → 💳 Pay.';
    } else {
      const commands = NATIVE_COMMAND_LIST.filter(cmd => cmd.role === 'admin' || cmd.role === 'both');
      html +=
        '⚙️ <b>ADMIN GUIDE</b>\n\n' +
        commands.map(c => `• <b>${c.command}</b> — ${c.description}`).join('\n') + '\n\n' +
        'Access restricted to Chip Besar only.';
    }
  } else {
    if (category === 'peniaga') {
      const commands = NATIVE_COMMAND_LIST.filter(cmd => cmd.role === 'merchant' || cmd.role === 'both');
      html +=
        '👨‍🍳 <b>PANDUAN PENIAGA</b>\n\n' +
        commands.map(c => `• <b>${c.command}</b> — ${c.description}`).join('\n') + '\n\n' +
        'Gunakan butang 📍 Kongsi Lokasi untuk menetapkan lokasi kedai.';
    } else if (category === 'pelanggan') {
      const commands = NATIVE_COMMAND_LIST.filter(cmd => cmd.role === 'customer' || cmd.role === 'both');
      html +=
        '🛒 <b>PANDUAN PELANGGAN</b>\n\n' +
        commands.map(c => `• <b>${c.command}</b> — ${c.description}`).join('\n') + '\n\n' +
        'Buat pesanan: 📍 Kedai Berdekatan → pilih → troli → 💳 Bayar.';
    } else {
      const commands = NATIVE_COMMAND_LIST.filter(cmd => cmd.role === 'admin' || cmd.role === 'both');
      html +=
        '⚙️ <b>PANDUAN PENTADBIR</b>\n\n' +
        commands.map(c => `• <b>${c.command}</b> — ${c.description}`).join('\n') + '\n\n' +
        'Akses terhad kepada Chip Besar sahaja.';
    }
  }
  const otherLocale = locale === 'en' ? 'ms' : 'en';
  const toggleLabel = locale === 'en' ? '🌐 BM' : '🌐 EN';
  const inline = {
    inline_keyboard: [
      [{ text: toggleLabel, callback_data: `help_locale:${category}:${otherLocale}` }],
      [{ text: '⬅️ Kembali', callback_data: 'nav:main' }],
    ],
  };
  await sendHtmlMessage(env, chatId, html, inline);
}

/**
 * handleHelpLocaleToggle
 * Menerima callback help_locale:<category>:<locale> -> memaparkan semula kategori
 * dalam locale baharu (BM <-> EN) tanpa regression (lalai 'ms').
 */ 
export async function handleHelpLocaleToggle(
  env: Env,
  chatId: number,
  category: 'peniaga' | 'pelanggan' | 'pentadbir',
  locale: 'ms' | 'en'
): Promise<void> {
  await handleHelpCategory(env, chatId, category, locale);
}
// End: Phase 47 - Category-Specific Help Deep-Link Router

// Start: Phase 52 - /bantuan_lokasi (Location Sharing Guide)
/** 
 * handleBantuanLokasi
 * Panduan kongsi lokasi untuk carian kedai berdekatan + menetapkan lokasi kedai.
 * Dipanggil dari /bantuan_lokasi (pelanggan dan peniaga).
 */ 
export async function handleBantuanLokasi(env: Env, chatId: number): Promise<void> {
  const html =
    '<b>📍 PANDUAN KONGSI LOKASI</b>\n\n' +
    '🔎 <b>Pelanggan</b>\n' +
    '• Tekan butang 📍 <b>Kedai Berdekatan</b> atau taip /cari_makan\n' +
    '• Hantar lokasi anda (attachment 📎 → Location)\n' +
    '• Kami mencari restoran dalam radius 10km (Haversine)\n\n' +
    '🏪 <b>Peniaga</b>\n' +
    '• Taip /set_lokasi untuk membuka aliran koordinat\n' +
    '• Kongsi lokasi kedai supaya pelanggan menemui anda\n' +
    '• Atau taip manual: /set_lokasi 3.1390 101.6869\n\n' +
    'Lokasi disimpan dengan selamat mengikut RLS kedai anda sahaja.';
  const inline = {
    inline_keyboard: [
      [{ text: '📍 Cari Kedai', callback_data: 'open_nearby' }, { text: '🛒 Troli', callback_data: 'open_cart' }],
      [{ text: '⬅️ Kembali', callback_data: 'nav:main' }],
    ],
  };
  await sendHtmlMessage(env, chatId, html, inline);
}
// End: Phase 52 - /bantuan_lokasi

// End: Phase 31 - /help & /bantuan Command Controller
