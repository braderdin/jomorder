// Start: Phase 62 - routeCallbackQuery Unit Test Matrix (Fasal 9 testing)
// Coverage matrix untuk semua callback_data yang diroute di router_callbacks.ts.
// Setiap entry mock TelegramCallbackQuery + assert handler return true.
import { Env, TelegramCallbackQuery } from '../types';

/** Mock callback builder. */
function mockCb(data: string, fromId = 111, chatId = 111): TelegramCallbackQuery {
  return {
    id: 'cb_test',
    from: { id: fromId } as never,
    chat: { id: chatId } as never,
    message: { message_id: 1 } as never,
    data,
  } as TelegramCallbackQuery;
}

export interface CallbackTestResult {
  name: string;
  data: string;
  pass: boolean;
  note: string;
}

/**
 * runCallbackMatrix
 * Lari matrix callback_data kritikal. Assert routeCallbackQuery return true
 * (tidak jatuh ke fallback spinner). Gunakan mock env minima.
 */
export async function runCallbackMatrix(env: Env): Promise<CallbackTestResult[]> {
  const results: CallbackTestResult[] = [];
  const { routeCallbackQuery } = await import('../handlers/router_callbacks');

  const cases: Array<{ name: string; data: string }> = [
    { name: 'Merchant order accept', data: 'accept_order:1' },
    { name: 'Merchant order ready', data: 'ready_order:2' },
    { name: 'Merchant order reject', data: 'reject_order:3' },
    { name: 'Toggle status', data: 'toggle_status:abc' },
    { name: 'Dashboard report', data: 'merchant_report' },
    { name: 'Dashboard orders', data: 'merchant_orders' },
    { name: 'Dashboard settings', data: 'merchant_settings' },
    { name: 'Dashboard zon', data: 'merchant_zon' },
    { name: 'Upload QR', data: 'upload_qr' },
    { name: 'Merchant menu', data: 'merchant_menu' },
    { name: 'Merchant analytics', data: 'merchant_analytics' },
    { name: 'History page 2', data: 'sejarah_page:2' },
    { name: 'Export CSV', data: 'export_sales_csv:' },
    { name: 'Help locale', data: 'help_locale:pelanggan:en' },
    { name: 'Status refresh', data: 'status_refresh' },
    { name: 'View shop', data: 'view_shop:shop1' },
    { name: 'Add to cart', data: 'add_to_cart:item1:shop1' },
    { name: 'View cart', data: 'view_cart:' },
    { name: 'Delete coupon', data: 'del_coupon:KOD' },
    { name: 'Set locale ms', data: 'set_locale:ms' },
    { name: 'Set notif', data: 'set_notif' },
    { name: 'Nav main', data: 'nav:main' },
    { name: 'Nav customer', data: 'nav:customer' },
    { name: 'Nav merchant', data: 'nav:merchant' },
    { name: 'Nav admin', data: 'nav:admin' },
    { name: 'Nav help', data: 'nav:help' },
    { name: 'Open shops', data: 'open_shops' },
    { name: 'Open cart', data: 'open_cart' },
    { name: 'Open promo', data: 'open_promo' },
    { name: 'Open history', data: 'open_history' },
    { name: 'Open profile', data: 'open_profile' },
    { name: 'Open pay', data: 'open_pay' },
    { name: 'Open review', data: 'open_review' },
    { name: 'Customer GUI', data: 'customer_gui' },
    { name: 'Merchant GUI', data: 'merchant_gui' },
    { name: 'Onboard shop', data: 'onboard_shop' },
    { name: 'Onboard name', data: 'onboard_name' },
    { name: 'Share loc', data: 'share_loc' },
    { name: 'Rate 5', data: 'rate:1:5' },
    { name: 'Minigame nav', data: 'nav:minigame' },
    { name: 'Minigame open', data: 'open_minigame' },
    { name: 'Minigame play', data: 'mg:spin' },
    { name: 'Founder view', data: 'founder_view' },
    { name: 'Back customer', data: 'back:customer' },
    { name: 'Back merchant', data: 'back:merchant' },
    { name: 'Back cart', data: 'back:cart' },
    { name: 'Back shop', data: 'back:shop' },
  ];

  for (const c of cases) {
    try {
      const cb = mockCb(c.data);
      const handled = await routeCallbackQuery(env, cb, 111);
      results.push({
        name: c.name,
        data: c.data,
        pass: handled === true,
        note: handled ? 'routed' : 'fallback spinner',
      });
    } catch {
      results.push({ name: c.name, data: c.data, pass: false, note: 'threw exception' });
    }
  }

  return results;
}
// End: Phase 62 - routeCallbackQuery Unit Test Matrix