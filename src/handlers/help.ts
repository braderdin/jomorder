// Start: Phase 31 - /help & /bantuan Command Controller (LOOP 1 File 2)
// Fasal 4 (SOA) + Fasal 6 (HTML guide + inline operator queues)
// Arahan: papar panduan interaktif HTML dengan butang dinamik ke barisan operator.
import { Env, TelegramUser } from '../types';

const TELEGRAM_API = 'https://api.telegram.org/bot';

/**
 * Hantar mesej berformat HTML (parse_mode=HTML) dengan inline keyboard.
 * Dipisah dari sendMessage MarkdownV2 standard supaya panduan kekal kaya
 * tanpa perlu escape setiap aksara MarkdownV2 (Fasal 6).
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
    // Soft-fail (Fasal 7 Strategy 4): jangan biarkan panduan gagal keras
  }
}

/**
 * Controller untuk arahan '/help' dan '/bantuan'.
 * Papar dokumen panduan user berformat HTML dengan butang inline yang
 * terus menghubungkan ke barisan operator sokongan (Fasal 6 mobile grid).
 */
export async function handleHelp(env: Env, chatId: number, _user: TelegramUser | undefined): Promise<void> {
  const html =
    '<b>📖 PANDUAN JomOrder</b>\n\n' +
    'Guna arahan berikut untuk navigasi pantas:\n\n' +
    '• <b>/start</b> — Mula & pilih peranan (Peniaga/Pelanggan)\n' +
    '• <b>/menu</b> — Lihat senarai kedai aktif berdekatan\n' +
    '• <b>/urus</b> — Papan pemerintah peniaga (buka/tutup kedai)\n' +
    '• <b>/help</b> — Papar panduan ini lagi\n\n' +
    'Untuk buat pesanan: tekan <b>📍 Kedai Berdekatan</b> → pilih kedai → tambah ke troli → <b>💳 Bayar Sekarang</b>.\n\n' +
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
 * Papar panduan mendalam mengikut kategori (peniaga/pelanggan/pentadbir).
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
    // Start: Phase 48 - English locale block (formal EN, no BM slang)
    if (category === 'peniaga') {
      html +=
        '👨‍🍳 <b>MERCHANT GUIDE</b>\n\n' +
        '• <b>/daftar</b> — Register a new shop\n' +
        '• <b>/tambah_menu</b> — Add menu item\n' +
        '• <b>/senarai_menu</b> — View & toggle menu\n' +
        '• <b>/urus_kedai</b> — Control panel\n' +
        '• <b>/laporan_jualan</b> — Sales analytics\n' +
        '• <b>/cipta_kupon</b> — Create discount (PREMIUM)\n' +
        '• <b>/naiktaraf</b> — Upgrade to PREMIUM\n\n' +
        'Use the 📍 Share Location button to set shop location.';
    } else if (category === 'pelanggan') {
      html +=
        '🛒 <b>CUSTOMER GUIDE</b>\n\n' +
        '• <b>/start</b> — Start & choose role\n' +
        '• <b>/cari_makan</b> — Find nearby shops\n' +
        '• <b>/troli</b> — View order cart\n' +
        '• <b>/pesanan_saya</b> — Active orders\n' +
        '• <b>/sejarah_pesanan</b> — Full history\n' +
        '• <b>/profil</b> — Profile & subscription\n\n' +
        'To order: 📍 Nearby Shops → choose → cart → 💳 Pay.';
    } else {
      html +=
        '⚙️ <b>ADMIN GUIDE</b>\n\n' +
        '• <b>/admin_stats</b> — SaaS metrics\n' +
        '• <b>/senarai_pendaftaran</b> — Merchant list\n' +
        '• <b>/pengumuman</b> — Platform broadcast\n' +
        '• <b>/status</b> — Bot & account status\n\n' +
        'Access restricted to Chip Besar only.';
    }
    // End: Phase 48 - English locale block
  } else {
    if (category === 'peniaga') {
      html +=
        '👨‍🍳 <b>PANDUAN PENIAGA</b>\n\n' +
        '• <b>/daftar</b> — Daftar kedai baharu\n' +
        '• <b>/tambah_menu</b> — Tambah item menu\n' +
        '• <b>/senarai_menu</b> — Lihat & togol menu\n' +
        '• <b>/urus_kedai</b> — Papan pemerintah\n' +
        '• <b>/laporan_jualan</b> — Analitik jualan\n' +
        '• <b>/cipta_kupon</b> — Cipta diskaun (PREMIUM)\n' +
        '• <b>/naiktaraf</b> — Naik taraf PREMIUM\n\n' +
        'Guna butang 📍 Kongsi Lokasi untuk set lokasi kedai.';
    } else if (category === 'pelanggan') {
      html +=
        '🛒 <b>PANDUAN PELANGGAN</b>\n\n' +
        '• <b>/start</b> — Mula & pilih peranan\n' +
        '• <b>/cari_makan</b> — Cari kedai berdekatan\n' +
        '• <b>/troli</b> — Lihat troli pesanan\n' +
        '• <b>/pesanan_saya</b> — Pesanan aktif\n' +
        '• <b>/sejarah_pesanan</b> — Sejarah lengkap\n' +
        '• <b>/profil</b> — Profil & langganan\n\n' +
        'Buat pesanan: 📍 Kedai Berdekatan → pilih → troli → 💳 Bayar.';
    } else {
      html +=
        '⚙️ <b>PANDUAN PENTADBIR</b>\n\n' +
        '• <b>/admin_stats</b> — Metrik SaaS\n' +
        '• <b>/senarai_pendaftaran</b> — Senarai peniaga\n' +
        '• <b>/pengumuman</b> — Broadcast platform\n' +
        '• <b>/status</b> — Status bot & akaun\n\n' +
        'Akses terhad kepada Chip Besar sahaja.';
    }
  }
  const inline = {
    inline_keyboard: [
      [{ text: '🔙 Kembali', callback_data: 'help_menu' }],
    ],
  };
  await sendHtmlMessage(env, chatId, html, inline);
}
// End: Phase 47 - Category-Specific Help Deep-Link Router

// End: Phase 31 - /help & /bantuan Command Controller
