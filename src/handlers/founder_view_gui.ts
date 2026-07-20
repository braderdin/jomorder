// Start: Phase 65 - Founder Demo Shop View GUI (MDEC GLOW wow factor)
// Fasal 6 (BM UI) + Fasal 8 (WebP photo). Papar kedai contoh pengasas dengan
// escape betul (MarkdownV2) + foto menu + butang portal demo + BACK.
import { Env } from '../types';
import { sendMessage, escapeMarkdownV2, sendPhoto, inlineKeyboard } from '../telegram';
import { getFounderShop, getFounderMenu } from '../db';

/**
 * founderViewKeyboard - butang portal demo + BACK.
 */
function founderViewKeyboard(): ReturnType<typeof inlineKeyboard> {
  return inlineKeyboard([
    [{ text: '🌐 Lihat Portal Demo', url: 'https://jomorder-portal.vercel.app/' } as never],
    [{ text: '⬅️ Kembali', callback_data: 'nav:main' }],
  ]);
}

/**
 * handleFounderGui
 * Papar kedai demo pengasas dengan layout menarik + foto (jika ada) + BACK.
 */
export async function handleFounderGui(env: Env, chatId: number): Promise<void> {
  try {
    const shop = await getFounderShop(env);
    const menu = await getFounderMenu(env);
    if (!shop) {
      await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Kedai contoh sedang disediakan. Cuba sebentar lagi.'), founderViewKeyboard());
      return;
    }
    const status = shop.status_kedai === 'DILULUSKAN' ? '✅ Diluluskan' : String(shop.status_kedai);
    let text = escapeMarkdownV2('🏆 KEDAI CONTOH PENGASAS\\n\\n');
    text += escapeMarkdownV2('🍴 ' + shop.nama_kedai + '\\n');
    text += escapeMarkdownV2('Status: ' + status + '\\n\\n');
    text += escapeMarkdownV2('📋 MENU DEMO:\\n');
    if (menu.length === 0) {
      text += escapeMarkdownV2('  (menu dimuatkan tidak lama lagi)\\n');
    } else {
      menu.slice(0, 8).forEach((m) => {
        text += escapeMarkdownV2('  • ' + m.nama_hidangan + ' — RM ' + Number(m.harga).toFixed(2) + '\\n');
      });
    }
    text += escapeMarkdownV2('\\nDaftar kedai ANDA sendiri dengan /daftar!');

    // Hantar foto jika ada (WebP automatik dari storage)
    const foto = (shop as unknown as { foto_url?: string }).foto_url;
    if (foto) {
      try {
        await sendPhoto(env, chatId, foto, text, founderViewKeyboard());
        return;
      } catch { /* fallback to text */ }
    }
    await sendMessage(env, chatId, text, founderViewKeyboard());
  } catch {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Kedai contoh tidak tersedia sementara.'), inlineKeyboard([[{ text: '⬅️ Kembali', callback_data: 'nav:main' }]]));
  }
}
// End: Phase 65 - Founder Demo Shop View GUI