// Start: JomOrder Phase 29 - Merchant Invoice Controller (File 5)
// Fasal 6 (MarkdownV2 escape + inline grid) + Fasal 7 Strategy 1 (tenant isolation).
// Fasal 4 (SOA) - modul khusus kendali command '/invois' dan inline 'view_invoice:'.
import { Env, TelegramCallbackQuery } from '../types';
import { sendMessage, escapeMarkdownV2, answerCallbackQuery } from '../telegram';
import { buildMerchantInvoice, renderInvoiceMarkdownV2, InvoiceQueryBoundary } from '../services/invoice';

/** Parse suffix 'view_invoice:{since}' kepada sempadan query. */
function parseBoundaryFromData(data: string): InvoiceQueryBoundary {
  const rest = data.slice('view_invoice:'.length).trim();
  if (!rest || rest === 'all') return {};
  // Format sokongan: ISO timestamp terus, atau '30d'/'7d' offset.
  if (/^\d{4}-\d{2}-\d{2}/.test(rest)) {
    return { since: rest };
  }
  const m = rest.match(/^(\d+)d$/);
  if (m) {
    const days = parseInt(m[1], 10);
    const since = new Date(Date.now() - days * 86400000).toISOString();
    return { since };
  }
  return {};
}

/**
 * Kendali teks command '/invois' dari peniaga.
 * Jana + hantar invois digital MarkdownV2 untuk kedai peniaga.
 */
export async function handleMerchantInvoiceText(
  env: Env,
  chatId: number,
  tgId: number,
  _text: string
): Promise<void> {
  const inv = await buildMerchantInvoice(env, String(tgId), {});
  if (!inv) {
    await sendMessage(
      env,
      chatId,
      escapeMarkdownV2('⚠️ Tiada kedai berdaftar untuk akaun Telegram ini. Daftar kedai dahulu.')
    );
    return;
  }
  const md = renderInvoiceMarkdownV2(inv);
  await sendMessage(env, chatId, md);
}

/**
 * Kendali inline callback 'view_invoice:'.
 * Return true jika berjaya dikendali (route habis).
 */
export async function handleInvoiceCallback(
  env: Env,
  cb: TelegramCallbackQuery,
  chatId: number,
  data: string
): Promise<boolean> {
  if (!data.startsWith('view_invoice:')) return false;
  const tgId = cb.from?.id;
  if (!tgId) return false;
  const boundary = parseBoundaryFromData(data);
  const inv = await buildMerchantInvoice(env, String(tgId), boundary);
  // Dismiss spinner segera (Fasal 6 UX).
  await answerCallbackQuery(env, cb.id, 'Menyediakan invois...');
  if (!inv) {
    await sendMessage(
      env,
      chatId,
      escapeMarkdownV2('⚠️ Tiada kedai berdaftar untuk akaun Telegram ini. Daftar kedai dahulu.')
    );
    return true;
  }
  const md = renderInvoiceMarkdownV2(inv);
  await sendMessage(env, chatId, md);
  return true;
}

// End: JomOrder Phase 29 - Merchant Invoice Controller (File 5)