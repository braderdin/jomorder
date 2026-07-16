// Start: JomOrder Fasa 3 - Core Worker Entry Point
// Fasal 10 (Webhook Guard) + Fasal 4 (SOA)
import { Env, TelegramUpdate } from './types';
import { parseUpdate, sendMessage, merchantMenuKeyboard, escapeMarkdownV2 } from './telegram';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Start: Webhook Guard (Fasal 10)
    if (request.method !== 'POST') {
      // Smoke Test Harmonization: GET ping → 200 PASS (bukan deadlock)
      if (request.method === 'GET') {
        return new Response(
          JSON.stringify({ status: 'PASS', service: 'JomOrder', mode: 'webhook-ready' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      // Method lain → 405
      return new Response('Method Not Allowed', { status: 405 });
    }

    const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (!secret || secret !== env.TELEGRAM_SECRET_TOKEN) {
      return new Response('Forbidden', { status: 403 });
    }
    // End: Webhook Guard

    // Start: Update Router
    const body = await request.text();
    const update: TelegramUpdate | null = parseUpdate(body);
    if (!update) {
      // Soft 200 untuk elak Telegram retry (Fasal 7 Strategy 4)
      return new Response('OK', { status: 200 });
    }

    if (update.message?.text) {
      const chatId = update.message.chat.id;
      const safe = escapeMarkdownV2('Selamat datang ke JomOrder! 🤖');
      await sendMessage(env, chatId, safe, merchantMenuKeyboard());
    }
    // End: Update Router

    return new Response('OK', { status: 200 });
  },
};

// End: JomOrder Fasa 3 - Core Worker Entry Point