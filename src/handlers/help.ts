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

// End: Phase 31 - /help & /bantuan Command Controller