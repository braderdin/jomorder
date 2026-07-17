// Start: JomOrder Fasa 9 - Modular Customer Handler (File 3)
// Fasal 4 (SOA) + Fasal 7 Strategy 3 (cart buffer) + Fasal 6 (escape/keyboard)
// Pindahan dari src/handlers.ts: geolocation match, checkout payload, pay_now trigger.
import { Env } from '../types';
import {
  sendMessage,
  escapeMarkdownV2,
  customerMenuKeyboard,
  merchantMenuKeyboard,
  answerCallbackQuery,
} from '../telegram';
import { ambilKedaiBerhampiran, commitOrderPayload, updateOrderState, getMenuByKedaiId } from '../db';
import { getState, setState } from '../redis';
import { getSubscriptionStatus, sendExpiryAlert } from '../subscription';
import { isSearchRestricted } from '../orders';
import { generateDuitNowQrText, buildPaymentReceiptLayout } from '../services/payment';
import { notifyMerchantNewOrder } from '../services/notifications';
import { validateCoupon, applyDiscount, CampaignDiscount } from '../services/discounts';

/** Struktur cart buffer pelanggan (Strategy 3 JSONB). */
interface CartBuffer {
  kedaiId: string;
  items: Array<{ item_id: string; nama: string; kuantiti: number; harga_seunit: number }>;
  total: number;
  deliveryLat: number;
  deliveryLng: number;
  appliedCoupon?: { kod: string; jenis: 'PERCENT' | 'AMOUNT'; nilai: number };
  discountedTotal?: number;
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
  let orderId = Number(parts[1]);
  const kedaiId = parts[2] || '';
  const customerId = Number(parts[3] || cb.from.id);

  // Fasa 11: Jika order belum di-commit semasa checkout, commit sekarang (commit point).
  if (!orderId || orderId === 0) {
    const state = await getState(env, customerId);
    const buffer = (state?.cart_buffer ?? null) as CartBuffer | null;
    if (buffer && buffer.items && buffer.items.length > 0) {
      const committed = await commitOrderPayload(env, {
        kedaiId: buffer.kedaiId,
        customerTelegramId: customerId,
        items: buffer.items.map((it) => ({
          item_id: it.item_id,
          nama: it.nama,
          kuantiti: it.kuantiti,
          harga_seunit: it.harga_seunit,
        })),
        totalAmount: buffer.discountedTotal ?? buffer.total,
        kaedahPembayaran: 'DUITNOW',
      });
      orderId = committed ?? 0;
    }
  }

  const ok = await updateOrderState(env, orderId, kedaiId, { status_pembayaran: 'TELAH_BAYAR' });
  if (ok) {
    // Fasa 11: Dispatch live notification alert ke peniaga (Real-time Engine).
    const state = await getState(env, customerId);
    const buffer = (state?.cart_buffer ?? null) as CartBuffer | null;
    await notifyMerchantNewOrder(env, {
      orderId,
      orderRef: `JO-${customerId}-${orderId}`,
      customerName: String(customerId),
       itemCount: buffer?.items?.length ?? 0,
       totalAmount: buffer?.discountedTotal ?? buffer?.total ?? 0,
       merchantTelegramId: Number(kedaiId),
    });
    await sendMessage(
      env,
      cbChatId,
      escapeMarkdownV2(`✅ Terima kasih! Pembayaran untuk pesanan #${orderId} disahkan.`),
      customerMenuKeyboard()
    );
  } else {
    await sendMessage(env, cbChatId, escapeMarkdownV2('⚠️ Gagal sahkan bayaran. Cuba lagi.'), customerMenuKeyboard());
  }
  return true;
}

/**
 * handleApplyCoupon
 * Benarkan pembeli apply kod kupon ke cart buffer secara dinamik.
 * Validasi terhadap kedai_id cart (Fasal 7 Strategy 1) + status aktif + tarikh luput.
 * Simpan appliedCoupon + discountedTotal ke cart buffer (Strategy 3).
 */
export async function handleApplyCoupon(
  env: Env,
  chatId: number,
  tgId: number,
  kodKupon: string
): Promise<void> {
  const state = await getState(env, tgId);
  const buffer = (state?.cart_buffer ?? null) as CartBuffer | null;
  if (!buffer || !buffer.items || buffer.items.length === 0) {
    await sendMessage(env, chatId, escapeMarkdownV2('🛒 Cart anda kosong. Sila pilih menu dulu.'), customerMenuKeyboard());
    return;
  }
  const kupon = await validateCoupon(env, kodKupon, buffer.kedaiId);
  if (!kupon) {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Kod kupon tidak sah, tidak aktif, atau sudah tamat tempoh.'), customerMenuKeyboard());
    return;
  }
  const finalTotal = applyDiscount(kupon, buffer.total);
  const nextBuffer: CartBuffer = {
    ...buffer,
    appliedCoupon: { kod: kupon.kod_kupon, jenis: kupon.jenis_diskaun, nilai: kupon.nilai_diskaun },
    discountedTotal: finalTotal,
  };
  await setState(env, { ...state, cart_buffer: nextBuffer } as never);
  const jimat = (buffer.total - finalTotal).toFixed(2);
  await sendMessage(
    env,
    chatId,
    escapeMarkdownV2(`🎟️ Kupon ${kupon.kod_kupon} diterima! Jimat RM${jimat}. Jumlah baharu: RM${finalTotal.toFixed(2)}. Tekan 💳 Bayar Sekarang untuk teruskan.`),
    customerMenuKeyboard()
  );
}

/**
 * handleCheckout
 * Papar semakan cart (Fasal 7 Strategy 3), apply kupon jika ada, jana teks
 * DuitNow QR dengan jumlah berdiskaun, beri butang "Saya Dah Bayar" (pay_now).
 */
export async function handleCheckout(env: Env, chatId: number, tgId: number): Promise<void> {
  const state = await getState(env, tgId);
  const buffer = (state?.cart_buffer ?? null) as CartBuffer | null;
  if (!buffer || !buffer.items || buffer.items.length === 0) {
    await sendMessage(env, chatId, escapeMarkdownV2('🛒 Cart anda kosong. Sila pilih menu dulu.'), customerMenuKeyboard());
    return;
  }

  // Start: Fasa 14 - Apply coupon (dari buffer atau validasi semula)
  let appliedCoupon: CampaignDiscount | null = null;
  if (buffer.appliedCoupon) {
    appliedCoupon = await validateCoupon(env, buffer.appliedCoupon.kod, buffer.kedaiId);
  }
  const finalTotal = appliedCoupon ? applyDiscount(appliedCoupon, buffer.total) : (buffer.discountedTotal ?? buffer.total);
  // End: Fasa 14 - Apply coupon

  // 1. Papar semakan cart (refleksi jumlah_harga berdiskaun)
  const verifyLines = buffer.items
    .map((it) => `${escapeMarkdownV2(it.nama)} x${it.kuantiti} = RM${(it.kuantiti * it.harga_seunit).toFixed(2)}`)
    .join('\n');
  let verifyHeader = escapeMarkdownV2('🧾 SEMAKAN PESANAN:\\n') + verifyLines;
  if (appliedCoupon) {
    const diskaunTxt = appliedCoupon.jenis_diskaun === 'PERCENT' ? `${appliedCoupon.nilai_diskaun}%` : `RM${appliedCoupon.nilai_diskaun}`;
    verifyHeader += escapeMarkdownV2(`\\nKupon ${appliedCoupon.kod_kupon} \\(-${diskaunTxt}\\)`);
  }
  verifyHeader += escapeMarkdownV2(`\\nJUMLAH: RM${finalTotal.toFixed(2)}`);
  await sendMessage(env, chatId, verifyHeader, customerMenuKeyboard());

  // 2. Commit cart buffer ke rekod_pesanan formal (Fasal 7 Strategy 3 commit point)
  const orderId = await commitOrderPayload(env, {
    kedaiId: buffer.kedaiId,
    customerTelegramId: tgId,
    items: buffer.items.map((it) => ({
      item_id: it.item_id,
      nama: it.nama,
      kuantiti: it.kuantiti,
      harga_seunit: it.harga_seunit,
    })),
    totalAmount: finalTotal,
    kaedahPembayaran: 'DUITNOW',
  });
  const committedId = orderId ?? 0;

  // 3. Jana teks DuitNow QR & papar skrin bayaran (jumlah berdiskaun)
  const qrText = generateDuitNowQrText(buffer.kedaiId, finalTotal, `JO-${committedId}`);
  const receipt = buildPaymentReceiptLayout({
    orderId: `JO-${committedId}`,
    merchantName: buffer.kedaiId,
    customerName: String(tgId),
    items: buffer.items.map((it) => ({ name: it.nama, qty: it.kuantiti, price: it.harga_seunit })),
    totalAmount: finalTotal,
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

// Start: Phase 24 - Dynamic Menu Browsing & Interactive Cart Populatio
// Fasal 6 (mobile keyboard max 2 btn/row) + Fasal 7 Strategy 3 (cart buffer).
// handleViewShopMenu: papar menu tersedia dengan inline "Tambah" button.
// handleAddToCart: increment item ke cart_buffer Redis (state engine).

/**
 * Papar menu kedai kepada pelanggan dengan inline keyboard tambah item.
 * Setiap item = 1 baris 1 butang (selamat <=2 btn/row, Fasal 6).
 * callback_data: add_to_cart:ITEM_ID:KEDAI_ID
 */
export async function handleViewShopMenu(
  env: Env,
  chatId: number,
  tgId: number,
  kedaiId: string
): Promise<boolean> {
  const menu = await getMenuByKedaiId(env, kedaiId);
  if (menu.length === 0) {
    await sendMessage(
      env,
      chatId,
      escapeMarkdownV2('🍽️ Maaf, tiada hidangan tersedia buat masa ini.'),
      customerMenuKeyboard()
    );
    return true;
  }

  const lines = menu
    .map((m) => `${escapeMarkdownV2(m.nama_hidangan)} \\- RM${m.harga.toFixed(2)}`)
    .join('\n');

  const keyboard = menu.map((m) => {
    const shortName = m.nama_hidangan.length > 24 ? m.nama_hidangan.slice(0, 24) + '...' : m.nama_hidangan;
    return [
      {
        text: `➕ ${shortName}`,
        callback_data: `add_to_cart:${m.id}:${kedaiId}`,
      },
    ];
  });

  // Start: Phase 25 - Lihat Troli inline row (max 1 btn/row, Fasal 6 mobile density)
  keyboard.push([{ text: '🛒 Lihat Troli', callback_data: `view_cart:${kedaiId}` }]);
  // End: Phase 25 - Lihat Troli inline row

  await sendMessage(
    env,
    chatId,
    escapeMarkdownV2('📋 SILA PILIH HIDANGAN:\\n') + lines,
    { inline_keyboard: keyboard }
  );
  return true;
}

/**
 * Tambah item ke cart buffer pelanggan (Fasal 7 Strategy 3).
 * Increment kuantiti jika item wujud, else push baru. Rewrite ke Redis.
 */
export async function handleAddToCart(
  env: Env,
  chatId: number,
  tgId: number,
  itemId: string,
  kedaiId: string,
  queryId?: string
): Promise<boolean> {
  const menu = await getMenuByKedaiId(env, kedaiId);
  const item = menu.find((m) => String(m.id) === itemId);
  if (!item) {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Item tidak dijumpai dalam menu.'), customerMenuKeyboard());
    return true;
  }

  const state = await getState(env, tgId);
  const buffer = (state?.cart_buffer ?? null) as CartBuffer | null;
  const items = buffer?.items ? [...buffer.items] : [];

  const existing = items.find((it) => it.item_id === itemId);
  if (existing) {
    existing.kuantiti += 1;
  } else {
    items.push({
      item_id: itemId,
      nama: item.nama_hidangan,
      kuantiti: 1,
      harga_seunit: item.harga,
    });
  }

  const total = items.reduce((s, it) => s + it.kuantiti * it.harga_seunit, 0);
  const nextBuffer: CartBuffer = {
    kedaiId,
    items,
    total,
    deliveryLat: buffer?.deliveryLat ?? 0,
    deliveryLng: buffer?.deliveryLng ?? 0,
    appliedCoupon: buffer?.appliedCoupon,
    discountedTotal: buffer?.discountedTotal,
  };

  if (state) {
    await setState(env, { ...state, cart_buffer: nextBuffer } as never);
  } else {
    await setState(env, {
      merchant_telegram_id: tgId,
      step: 'browsing_menu',
      cart_buffer: nextBuffer,
      last_active: new Date().toISOString(),
    } as never);
  }

  // Start: Phase 25 - Dismiss Telegram button spinner segera selepas cache update
  if (queryId) {
    await answerCallbackQuery(env, queryId, `✅ Ditambah ke troli`, false);
  }
  // End: Phase 25 - Dismiss Telegram button spinner

  const added = items.find((it) => it.item_id === itemId);
  await sendMessage(
    env,
    chatId,
    escapeMarkdownV2(`✅ ${item.nama_hidangan} ditambah ke troli (x${added?.kuantiti ?? 1}). Jumlah: RM${total.toFixed(2)}.`),
    customerMenuKeyboard()
  );
  return true;
}
// End: Phase 24 - Dynamic Menu Browsing & Interactive Cart Populatio

// End: JomOrder Fasa 9 - Modular Customer Handler (File 3)
