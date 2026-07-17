// Start: JomOrder Fasa 9 - Modular Customer Handler (File 3)
// Fasal 4 (SOA) + Fasal 7 Strategy 3 (cart buffer) + Fasal 6 (escape/keyboard)
// Pindahan dari src/handlers.ts: geolocation match, checkout payload, pay_now trigger.
import { Env } from '../types';
import {
  sendMessage,
  escapeMarkdownV2,
  customerMenuKeyboard,
  merchantMenuKeyboard,
} from '../telegram';
import { ambilKedaiBerhampiran, commitOrderPayload, updateOrderState } from '../db';
import { getState } from '../redis';
import { getSubscriptionStatus, sendExpiryAlert } from '../subscription';
import { isSearchRestricted } from '../orders';
import { generateDuitNowQrText, buildPaymentReceiptLayout } from '../services/payment';

/** Struktur cart buffer pelanggan (Strategy 3 JSONB). */
interface CartBuffer {
  kedaiId: string;
  items: Array<{ item_id: string; nama: string; kuantiti: number; harga_seunit: number }>;
  total: number;
  deliveryLat: number;
  deliveryLng: number;
}

/**
 * handleCustomerLocation
 * Padanan geolokasi: RPC ambil_kedai_berhampiran auto-exclude TAMAT langganan.
 * Return true jika lokasi diuruskan.
 */
export async function handleCustomerLocation(
  env: Env,
  chatId: number,
  latitude: number,
  longitude: number
): Promise<boolean> {
  const kedai = await ambilKedaiBerhampiran(env, latitude, longitude);
  if (kedai.length === 0) {
    await sendMessage(env, chatId, escapeMarkdownV2('Tiada kedai berdekatan dalam radius 10km 🍽️'));
    return true;
  }
  const senarai = kedai
    .map((k, i) => `${i + 1}\\. ${escapeMarkdownV2(k.nama_kedai)} \\(${k.jarak_km.toFixed(1)}km\\)`)
    .join('\n');
  await sendMessage(env, chatId, escapeMarkdownV2('📍 Kedai Berdekatan:\\n') + senarai, customerMenuKeyboard());
  return true;
}

/**
 * handleCustomerNearby
 * Carian kedai berdekatan (butang 📍). Guard lapisan ke-2 halang merchant TAMAT.
 * Return true jika diuruskan.
 */
export async function handleCustomerNearby(
  env: Env,
  chatId: number,
  tgId: number
): Promise<boolean> {
  const subStatus = await getSubscriptionStatus(env, tgId);
  if (isSearchRestricted(subStatus)) {
    await sendExpiryAlert(env, chatId, subStatus, 'Kedai Anda');
    await sendMessage(
      env,
      chatId,
      escapeMarkdownV2('🚫 Carian pelanggan baharu disekat \\(langganan tamat\\)\\. Sila perbaharui\\.'),
      merchantMenuKeyboard()
    );
    return true;
  }
  await sendMessage(
    env,
    chatId,
    escapeMarkdownV2('Sila hantar 📍 lokasi anda untuk cari kedai berdekatan 🔎'),
    customerMenuKeyboard()
  );
  return true;
}

/**
 * handlePayNow
 * Pelanggan sahkan bayaran DuitNow QR (callback pay_now:). Trigger alert ke peniaga.
 * Return true jika diuruskan.
 */
export async function handlePayNow(
  env: Env,
  cb: { from: { id: number }; id: string },
  cbChatId: number,
  data: string
): Promise<boolean> {
  if (!data.startsWith('pay_now:')) return false;
  const parts = data.split(':');
  const orderId = Number(parts[1]);
  const kedaiId = parts[2] || '';
  const customerId = Number(parts[3] || cb.from.id);
  const ok = await updateOrderState(env, orderId, kedaiId, { status_pembayaran: 'TELAH_BAYAR' });
  if (ok) {
    await sendMessage(
      env,
      Number(kedaiId),
      escapeMarkdownV2(`🔔 PESANAN #${orderId} TELAH DIBAYAR! Sila sediakan makanan.`),
      merchantMenuKeyboard()
    );
    await sendMessage(
      env,
      cbChatId,
      escapeMarkdownV2(`✅ Terima kasih! Pembayaran RM untuk pesanan #${orderId} disahkan.`),
      customerMenuKeyboard()
    );
  } else {
    await sendMessage(env, cbChatId, escapeMarkdownV2('⚠️ Gagal sahkan bayaran. Cuba lagi.'), customerMenuKeyboard());
  }
  return true;
}

/**
 * handleCheckout
 * Papar semakan cart (Fasal 7 Strategy 3), jana teks DuitNow QR, beri butang
 * "Saya Dah Bayar" (callback pay_now) untuk sahkan pembayaran.
 */
export async function handleCheckout(env: Env, chatId: number, tgId: number): Promise<void> {
  const state = await getState(env, tgId);
  const buffer = (state?.cart_buffer ?? null) as CartBuffer | null;
  if (!buffer || !buffer.items || buffer.items.length === 0) {
    await sendMessage(env, chatId, escapeMarkdownV2('🛒 Cart anda kosong. Sila pilih menu dulu.'), customerMenuKeyboard());
    return;
  }

  // 1. Papar semakan cart
  const verifyLines = buffer.items
    .map((it) => `${escapeMarkdownV2(it.nama)} x${it.kuantiti} = RM${(it.kuantiti * it.harga_seunit).toFixed(2)}`)
    .join('\n');
  await sendMessage(
    env,
    chatId,
    escapeMarkdownV2('🧾 SEMAKAN PESANAN:\\n') + verifyLines + escapeMarkdownV2(`\\nJUMLAH: RM${buffer.total.toFixed(2)}`),
    customerMenuKeyboard()
  );

  // 2. Commit cart buffer ke rekod_pesanan formal (Fasal 7 Strategy 3 commit point)
  const orderId = await commitOrderPayload(env, {
    kedaiId: buffer.kedaiId,
    customerTelegramId: tgId,
    customerName: String(tgId),
    items: buffer.items.map((it) => ({
      item_id: it.item_id,
      nama: it.nama,
      kuantiti: it.kuantiti,
      harga_seunit: it.harga_seunit,
    })),
    totalAmount: buffer.total,
    deliveryLat: buffer.deliveryLat,
    deliveryLng: buffer.deliveryLng,
    orderRef: `JO-${tgId}-${Date.now()}`,
  });
  const committedId = orderId ?? 0;

  // 3. Jana teks DuitNow QR & papar skrin bayaran
  const qrText = generateDuitNowQrText(buffer.kedaiId, buffer.total, `JO-${committedId}`);
  const receipt = buildPaymentReceiptLayout({
    orderId: `JO-${committedId}`,
    merchantName: buffer.kedaiId,
    customerName: String(tgId),
    items: buffer.items.map((it) => ({ name: it.nama, qty: it.kuantiti, price: it.harga_seunit })),
    totalAmount: buffer.total,
    deliveryLat: buffer.deliveryLat,
    deliveryLng: buffer.deliveryLng,
  });
  await sendMessage(
    env,
    chatId,
    escapeMarkdownV2('📲 BAYAR MELALUI DUITNOW QR:\\n') + escapeMarkdownV2(qrText) + '\n\n' + receipt,
    {
      inline_keyboard: [[{ text: '✅ Saya Dah Bayar', callback_data: `pay_now:${committedId}:${buffer.kedaiId}:${tgId}` }]],
    }
  );
}
// End: JomOrder Fasa 9 - Modular Customer Handler (File 3)