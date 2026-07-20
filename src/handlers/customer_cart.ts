// Start: Phase 39 - Modular Cart Inspection Engine (File 5)
// Fasal 4 (SOA) + Fasal 7 Strategy 3 (cart buffer Redis) + Fasal 6 (escape/keyboard).
// handleViewCart: parse JSONB cart buffer dari Upstash, kira total, papar breakdown mobile.
// Phase 39: guarantee answerCallbackQuery triggered in milliseconds for ALL cart triggers.
import { Env } from '../types';
import { sendMessage, escapeMarkdownV2, customerMenuKeyboard, customerCommandGrid, inlineKeyboard, answerCallbackQuery, customerReplyKeyboard } from '../telegram';
import { getState, setState } from '../redis';
import { reorderKeyboard } from '../services/ui_helpers';
import { i18n } from '../services/i18n';

/**
 * dismissSpinnerFast
 * Helper awam untuk dismiss loading spinner dalam milisaat apabila mana-mana
 * cart callback ditekan (add_to_cart / view_cart / checkout). Mencegah
 * client spinner tergantung (Fasal 6 UX + Fasal 7 S4 resilience).
 */
export async function dismissSpinnerFast(env: Env, queryId?: string, text?: string): Promise<void> {
  if (!queryId) return;
  try {
    await answerCallbackQuery(env, queryId, text, false);
  } catch {
    // Silent fail: spinner dismiss tidak boleh block flow utama.
  }
}

/** Struktur cart buffer pelanggan (selari dengan customer.ts CartBuffer). */
interface CartItem {
  item_id: string;
  nama: string;
  kuantiti: number;
  harga_seunit: number;
}
interface CartBuffer {
  kedaiId: string;
  items: CartItem[];
  total: number;
  discountedTotal?: number;
  checkout_locked?: boolean;
}

/**
 * handleViewCart
 * Ekstrak cart buffer aktif pelanggan dari Redis, kira item + jumlah keseluruhan,
 * format teks breakdown MarkdownV2 (escape), attach inline button checkout gateway.
 */
export async function handleViewCart(
  env: Env,
  chatId: number,
  tgId: number,
  queryId?: string
): Promise<boolean> {
  // Start: Phase 39 - Spinner Dismissal First (millisecond guarantee)
  // Jangan tunggu Redis getState: tutup loading screen DULU dalam milisaat
  // supaya client tidak tergantung walaupun Upstash perlahan (Fasal 7 S4).
  await dismissSpinnerFast(env, queryId);
  // End: Phase 39 - Spinner Dismissal First

  const state = await getState(env, tgId);
  const buffer = (state?.cart_buffer ?? null) as CartBuffer | null;
  const locale = (state?.locale === 'EN' ? 'EN' : 'BM') as 'BM' | 'EN';

  // Start: Phase 39 - Dismiss spinner redundan selamat (idempotent guard)
  // Panggilan kedua tidak berbahaya; pastikan spinner pasti tertutup.
  await dismissSpinnerFast(env, queryId);
  // End: Phase 39 - Dismiss spinner redundan

  if (!buffer || !buffer.items || buffer.items.length === 0) {
    await sendMessage(
      env,
      chatId,
      escapeMarkdownV2(i18n('cart_empty', locale) + '\\n\\n') +
      escapeMarkdownV2('Jom makan dulu? Pilih kedai berdekatan dan tambah menu ke troli! 🍔'),
      inlineKeyboard([
        [{ text: '🏪 Cari Kedai', callback_data: 'open_nearby' }],
        [{ text: '🎟️ Promo', callback_data: 'open_promo' }],
        [{ text: '⬅️ Kembali', callback_data: 'nav:main' }],
      ]),
      customerReplyKeyboard()
    );
    return true;
  }

  const lines = buffer.items
    .map(
      (it) =>
        `${escapeMarkdownV2(it.nama)} x${it.kuantiti} = RM${(it.kuantiti * it.harga_seunit).toFixed(2)}`
    )
    .join('\n');

  const itemTotal = buffer.items.reduce((s, it) => s + it.kuantiti * it.harga_seunit, 0);
  const grandTotal = buffer.discountedTotal ?? buffer.total ?? itemTotal;

  const header =
    escapeMarkdownV2('╔════════════════════╗\\n') +
    escapeMarkdownV2('   🛒 TROLI ANDA\\n') +
    escapeMarkdownV2('╚════════════════════╝\\n\\n') +
    lines +
    escapeMarkdownV2(`\\n\\n💰 JUMLAH: RM${grandTotal.toFixed(2)}\\n`) +
    escapeMarkdownV2('Terima kasih atas pesanan anda! 🇲🇾');

  // Start: Phase 38 - Cart Checkout Lock (elak duplicate checkout concurrent)
  // Jika flag checkout_locked aktif, halang double-submit dengan button berbeza.
  let keyboard;
  if (buffer.checkout_locked === true) {
    keyboard = inlineKeyboard([
      [{ text: '⏳ Sedang Diproses', callback_data: 'checkout_blocked' }],
      [{ text: '🍔 Tambah Lagi', callback_data: 'browse_more' }],
    ]);
  } else {
    // Kunci segera supaya request concurrent tidak spawn checkout berganda.
    const nextBuffer: CartBuffer = { ...buffer, checkout_locked: true };
    if (state) {
      await setState(env, { ...state, cart_buffer: nextBuffer } as never);
    }
    keyboard = inlineKeyboard([
      [{ text: '💳 Bayar Sekarang', callback_data: 'checkout_now' }],
      [{ text: '🍔 Tambah Lagi', callback_data: 'browse_more' }],
      [{ text: '🧹 Kosongkan', callback_data: 'cart_clear' }],
      [{ text: '⬅️ Kembali', callback_data: 'back:customer' }],
    ]);
  }
  // End: Phase 38 - Cart Checkout Lock

  // Start: Phase 58 - Quick Reorder hint (pelanggan boleh pesan sama lagi)
  // Simpan cart snapshot ke state untuk reorder pantas (1-tap).
  if (state) {
    try {
      await setState(env, { ...state, last_cart_snapshot: buffer } as never);
    } catch { /* soft-fail */ }
  }
  // End: Phase 58 - Quick Reorder hint

  await sendMessage(env, chatId, header, keyboard);
  return true;
}
// Start: Phase 40 - Cart Flush on Order Termination (reliable clear)
/**
 * flushCustomerCart
 * Kosongkan cart buffer pelanggan dengan SELAMAT semasa isyarat terminasi pesanan
 * (batal/pembayaran gagal/tamat sesi). Ganti cart_buffer dengan array kosong
 *而不是 padam state penuh supaya state lain (lat/lng/onboarding) kekal utuh.
 * Fail-open: jika Redis gagal, biarkan (Fasal 7 S4).
 * @returns true jika flush berjaya disahkan.
 */
export async function flushCustomerCart(env: Env, tgId: number): Promise<boolean> {
  try {
    const state = await getState(env, tgId);
    if (!state) return true; // tiada state = tiada cart untuk flush
    const cleared = { ...state, cart_buffer: { kedaiId: '', items: [], total: 0 } } as never;
    await setState(env, cleared);
    return true;
  } catch {
    return false;
  }
}

/**
 * flushCustomerCartQuiet
 * Variasi senyap untuk hook terminasi serentak (contoh: /batalkan_pesanan) di
 * mana kita tidak mahu spam mesej. Return void.
 */
export async function flushCustomerCartQuiet(env: Env, tgId: number): Promise<void> {
  await flushCustomerCart(env, tgId);
}

// Start: Phase 52 - /cart_kosong (Manual customer cart clear)
/**
 * handleCartKosong
 * Perintah pelanggan kosongkan troli secara manual (explicit user action).
 * Papar pengesahan ringkas + keyboard menu pelanggan. Soft-fail selamat.
 */
export async function handleCartKosong(env: Env, chatId: number, tgId: number): Promise<void> {
  const ok = await flushCustomerCart(env, tgId);
  if (!ok) {
    await sendMessage(
      env,
      chatId,
      escapeMarkdownV2('⚠️ Gagal mengosongkan troli. Cuba sebentar lagi.')
    );
    return;
  }
  await sendMessage(
    env,
    chatId,
    escapeMarkdownV2('🧹 Troli anda telah dikosongkan.\\n\\n') +
      escapeMarkdownV2('Nak pesan lagi? Tekan butang di bawah. 🍔'),
    customerCommandGrid()
  );
}
// End: Phase 52 - /cart_kosong

// End: Phase 40 - Cart Flush on Order Termination

// End: Phase 25 - Modular Cart Inspection Engine (File 5)
