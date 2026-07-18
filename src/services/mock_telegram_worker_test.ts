// Start: Phase 39 - Mock Telegram Worker Test Harness (Fasal 7 S4 + Fasal 10)
// Skrip simulasi khusus untuk semua 22 arahan bot natif + callback kritikal.
// Menggunakan raw JSON frame seolah-olah dihantar Telegram ke webhook worker.
import { Env, TelegramUpdate } from '../types';

/** Satu kes ujian simulasi masukan. */
export interface MockTestCase {
  label: string;
  update: TelegramUpdate;
}

const TEST_UID = 123456789;

function mkMessage(text: string): TelegramUpdate {
  return {
    update_id: Math.floor(Math.random() * 1e9),
    message: {
      message_id: 1,
      from: { id: TEST_UID, is_bot: false, first_name: 'Tester' },
      chat: { id: TEST_UID, type: 'private' },
      text,
    },
  };
}

function mkCallback(data: string): TelegramUpdate {
  return {
    update_id: Math.floor(Math.random() * 1e9),
    callback_query: {
      id: 'cb_' + Math.random().toString(36).slice(2),
      from: { id: TEST_UID, is_bot: false, first_name: 'Tester' },
      message: { message_id: 1, chat: { id: TEST_UID, type: 'private' } },
      data,
    },
  };
}

function mkLocation(lat: number, lng: number): TelegramUpdate {
  return {
    update_id: Math.floor(Math.random() * 1e9),
    message: {
      message_id: 1,
      from: { id: TEST_UID, is_bot: false, first_name: 'Tester' },
      chat: { id: TEST_UID, type: 'private' },
      location: { latitude: lat, longitude: lng },
    },
  };
}

/**
 * buildAll22CommandCases
 * Hasilkan senarai penuh 22 kes arahan natif (termasuk suffix @BotName)
 * + callback penting + location event untuk ujian E2E pasif.
 */
export function buildAll22CommandCases(): MockTestCase[] {
  const commands = [
    '/start',
    '/start@JomOrderBot',
    '/help',
    '/menu',
    '/urus',
    '/cari_makan',
    '/troli',
    '/pesanan_saya',
    '/cipta_kupon JOM10 10 20',
    '/senarai_kupon',
    '/padam_kupon JOM10',
    '/invois',
    '/laporan_jualan',
    '/zon_operasi',
    '/admin_stats',
    '/senarai_pendaftaran',
    '/naiktaraf',
    '/senarai_menu',
    '/set_lokasi',
    '/sejarah_pesanan',
    '/batalkan_pesanan 1',
    '/pengumuman',
  ];

  const callbacks = [
    'del_coupon:JOM10',
    'toggle_status:shop-1',
    'view_cart:shop-1',
    'add_to_cart:item-1:shop-1',
    'view_shop:shop-1',
    'pay_now:1:shop-1:123456789',
    'accept_order:1',
    'ready_order:1',
    'reject_order:1',
    'view_invoice:1',
  ];

  const cases: MockTestCase[] = [];
  for (const c of commands) {
    cases.push({ label: `cmd:${c.split(' ')[0]}`, update: mkMessage(c) });
  }
  for (const d of callbacks) {
    cases.push({ label: `cb:${d.split(':')[0]}`, update: mkCallback(d) });
  }
  // Location event untuk cari_makan + set_lokasi.
  cases.push({ label: 'loc:cari_makan', update: mkLocation(3.139, 101.6869) });
  return cases;
}

/**
 * runMockInjection
 * Serialize setiap kes ke raw JSON string (simulasi webhook frame) dan
 * jadikan array string untuk dihantar ke worker test harness.
 * Return: array { label, rawFrame }.
 */
export function runMockInjection(): Array<{ label: string; rawFrame: string }> {
  const cases = buildAll22CommandCases();
  return cases.map((c) => ({
    label: c.label,
    rawFrame: JSON.stringify(c.update),
  }));
}
// End: Phase 39 - Mock Telegram Worker Test Harness