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
  sendPhoto,
  navGrid,
} from '../telegram';
import { ambilKedaiBerhampiran, commitOrderPayload, updateOrderState, getMenuByKedaiId, getMerchantProfileSafe } from '../db';
import { getState, setState } from '../redis';
import { getSubscriptionStatus, sendExpiryAlert } from '../subscription';
import { isSearchRestricted, canCancelOrder } from '../orders';
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
  appliedCoupon?: { kod: string; jenis: 'PERATUS' | 'TANAH'; nilai: number };
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
    .map((k: { nama_kedai: string; jarak_km: number }, i: number) => `${i + 1}\\. ${escapeMarkdownV2(k.nama_kedai)} \\(${k.jarak_km.toFixed(1)}km\\)`)
    .join('\n');
  await sendMessage(env, chatId, escapeMarkdownV2('📍 Kedai Berdekatan:\\n') + senarai, navGrid());
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
// Start: Phase 36 - 4-Layer Premium Subscription Fallback (AKTIF/HAMPIR_TAMAT/PREMIUM/TAMAT)
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

  // 4-layer fallback: TAMAT disekat (graceful), 3 layer lain dibenarkan terus.
  const subStatus = await getSubscriptionStatus(env, customerId);
  if (subStatus === 'TAMAT') {
    await answerCallbackQuery(env, cb.id, 'Langganan tamat. Sila perbaharui.', true);
    await sendMessage(
      env,
      cbChatId,
      escapeMarkdownV2('🚫 Pembayaran disekat \\(langganan tamat\\)\\. Sila perbaharui langganan PREMIUM untuk teruskan.'),
      customerMenuKeyboard()
    );
    return true;
  }
// End: Phase 36 - 4-Layer Premium Subscription Fallback

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
      appliedCoupon: { kod: kupon.kod_kupon, jenis: kupon.jenis_diskaun as 'PERATUS' | 'TANAH', nilai: kupon.nilai_diskaun },
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
    const diskaunTxt = appliedCoupon.jenis_diskaun === 'PERATUS' ? `${appliedCoupon.nilai_diskaun}%` : `RM${appliedCoupon.nilai_diskaun}`;
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
  const qrText = generateDuitNowQrText(buffer.kedaiId, finalTotal, `JO-${committedId}`, buffer.kedaiId);
  const receipt = buildPaymentReceiptLayout({
    orderId: `JO-${committedId}`,
    merchantName: buffer.kedaiId,
    customerName: String(tgId),
    items: buffer.items.map((it) => ({ name: it.nama, qty: it.kuantiti, price: it.harga_seunit })),
    totalAmount: finalTotal,
    deliveryLat: buffer.deliveryLat,
    deliveryLng: buffer.deliveryLng,
  });
  // Start: Phase 51 - Real QR image display (fetch duitnow_qr_url from shop)
  // Jika kedai ada muat naik QR DuitNow ke R2, papar imej sebenar juga.
  let qrImageUrl: string | null = null;
  try {
    const shopRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/senarai_kedai?id=eq.${encodeURIComponent(buffer.kedaiId)}&select=duitnow_qr_url`,
      { method: 'GET', headers: supabaseHeaders(env) }
    );
    if (shopRes.ok) {
      const shopRows = (await shopRes.json()) as Array<{ duitnow_qr_url?: string }>;
      if (Array.isArray(shopRows) && shopRows[0]?.duitnow_qr_url) {
        qrImageUrl = shopRows[0].duitnow_qr_url;
      }
    }
  } catch {
    // soft-fail: terus guna teks QR
  }
  // End: Phase 51 - Real QR image display

  await sendMessage(
    env,
    chatId,
    escapeMarkdownV2('📲 BAYAR MELALUI DUITNOW QR:\\n') + escapeMarkdownV2(qrText) + '\n\n' + receipt,
    {
      inline_keyboard: [[{ text: '✅ Saya Dah Bayar', callback_data: `pay_now:${committedId}:${buffer.kedaiId}:${tgId}` }]],
    }
  );
  if (qrImageUrl) {
    await sendPhoto(env, chatId, qrImageUrl, `📷 *Imbas QR DuitNow ini untuk bayar RM${finalTotal.toFixed(2)}*`);
  }
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
// Start: Phase 37 - Customer Archive & Order Cancellation (22-command matrix)
/**
 * handleSejarahPesanan
 * Papar rekod pesanan pelanggan yang sudah COMPLETED atau REJECTED.
 * Diikat ke pelanggan_telegram_id (Fasal 7 Strategy 1 RLS).
 */
export async function handleSejarahPesanan(
  env: Env,
  chatId: number,
  tgId: number,
  page = 1
): Promise<void> {
  try {
    // Start: Phase 48 - Pagination (10 per page, offset = (page-1)*10)
    const PAGE_SIZE = 10;
    const offset = (page - 1) * PAGE_SIZE;
    // End: Phase 48 - Pagination
    const url =
      `${env.SUPABASE_URL}/rest/v1/rekod_pesanan` +
      `?pelanggan_telegram_id=eq.${tgId}` +
      `&status_penghantaran=in.(COMPLETED,REJECTED)` +
      `&select=id,jumlah_harga,status_pembayaran,status_penghantaran,created_at` +
      `&order=created_at.desc&limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(url, { method: 'GET', headers: supabaseHeaders(env) });
    if (!res.ok) {
      await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Gagal ambil sejarah pesanan.'), customerMenuKeyboard());
      return;
    }
    const rows = (await res.json()) as Array<{
      id: number;
      jumlah_harga?: number;
      status_pembayaran?: string;
      status_penghantaran?: string;
      created_at?: string;
    }>;
    if (!Array.isArray(rows) || rows.length === 0) {
      await sendMessage(env, chatId, escapeMarkdownV2(page > 1 ? '📭 Tiada lagi sejarah pesanan.' : '📭 Tiada sejarah pesanan lengkap/ditolak.'), customerMenuKeyboard());
      return;
    }
    // Start: Phase 38 - Restrict archive view to TERMINAL states only (completed/rejected)
    const filtered = rows.filter((r) => {
      const s = (r.status_penghantaran || '').toUpperCase();
      return s === 'COMPLETED' || s === 'REJECTED';
    });
    if (filtered.length === 0) {
      await sendMessage(env, chatId, escapeMarkdownV2(page > 1 ? '📭 Tiada lagi sejarah pesanan.' : '📭 Tiada sejarah pesanan lengkap/ditolak.'), customerMenuKeyboard());
      return;
    }
    const lines = filtered
      .map((r) => {
        const tarikh = (r.created_at || '').slice(0, 10);
        return `#${r.id} \\- RM${(Number(r.jumlah_harga) || 0).toFixed(2)} \\[${r.status_penghantaran}\\] ${tarikh}`;
      })
      .join('\n');
    // End: Phase 38 - Restrict archive view

    // Start: Phase 48 - Next page inline button (if full page returned)
    const replyMarkup = filtered.length >= PAGE_SIZE
      ? { inline_keyboard: [[{ text: '➡️ Laman Seterusnya', callback_data: `sejarah_page:${page + 1}` }]] }
      : undefined;
    // End: Phase 48 - Next page inline button
    await sendMessage(
      env,
      chatId,
      escapeMarkdownV2(`📜 SEJARAH PESANAN \\(Laman ${page}\\):\\n`) + lines,
      replyMarkup ?? customerMenuKeyboard()
    );
  } catch {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Ralat baca sejarah pesanan.'), customerMenuKeyboard());
  }
}

/**
 * handleBatalkanPesanan
 * Benarkan batal pesanan HANYA jika status_penghantaran == PENDING.
 * Validasi mutasi melalui canCancelOrder() di orders.ts (Fasal 7 Strategy 4).
 * Format: /batalkan_pesanan <ID>
 */
export async function handleBatalkanPesanan(
  env: Env,
  chatId: number,
  tgId: number,
  rawCmd: string
): Promise<void> {
  const parts = rawCmd.split(/\s+/);
  const orderId = Number(parts[1]);
  if (!orderId || Number.isNaN(orderId)) {
    await sendMessage(env, chatId, escapeMarkdownV2('Format: /batalkan_pesanan <ID_PESANAN>'), customerMenuKeyboard());
    return;
  }
  try {
    const url = `${env.SUPABASE_URL}/rest/v1/rekod_pesanan?id=eq.${orderId}&pelanggan_telegram_id=eq.${tgId}&select=status_penghantaran,kedai_id`;
    const res = await fetch(url, { method: 'GET', headers: supabaseHeaders(env) });
    if (!res.ok) {
      await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Gagal semak pesanan.'), customerMenuKeyboard());
      return;
    }
    const rows = (await res.json()) as Array<{ status_penghantaran?: string; kedai_id?: string }>;
    if (!Array.isArray(rows) || rows.length === 0) {
      await sendMessage(env, chatId, escapeMarkdownV2('❌ Pesanan tidak dijumpai dalam akaun anda.'), customerMenuKeyboard());
      return;
    }
    const status = (rows[0].status_penghantaran || 'PENDING') as 'PENDING' | 'COMPLETED';
    if (!canCancelOrder(status)) {
      await sendMessage(env, chatId, escapeMarkdownV2('⛔ Pesanan tidak boleh dibatalkan (sudah diproses).'), customerMenuKeyboard());
      return;
    }
    const patchUrl = `${env.SUPABASE_URL}/rest/v1/rekod_pesanan?id=eq.${orderId}&pelanggan_telegram_id=eq.${tgId}`;
    const patch = await fetch(patchUrl, {
      method: 'PATCH',
      headers: { ...supabaseHeaders(env), Prefer: 'return=minimal' },
      body: JSON.stringify({ status_penghantaran: 'REJECTED', status_pembayaran: 'DIBATALKAN' }),
    });
    if (patch.ok) {
      await sendMessage(env, chatId, escapeMarkdownV2(`✅ Pesanan #${orderId} berjaya dibatalkan.`), customerMenuKeyboard());
    } else {
      await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Gagal batalkan pesanan.'), customerMenuKeyboard());
    }
  } catch {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Ralat batalkan pesanan.'), customerMenuKeyboard());
  }
}

/** Header Supabase service_role (customer module RLS-bypass read). */
function supabaseHeaders(env: Env): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}
// End: Phase 37 - Customer Archive & Order Cancellation

// End: Phase 24 - Dynamic Menu Browsing & Interactive Cart Populatio

// Start: Phase 41 - 22 Command BM Activation (handleProfil export)
/**
 * handleProfil
 * Papar profil pelanggan: status langganan + kedai berdaftar (jika peniaga).
 * Gabung db getMerchantProfileSafe + subscription status (Fasal 4 SOA).
 * Null-shield: kalau tiada kedai, papar status pelanggan biasa.
 */
export async function handleProfil(
  env: Env,
  chatId: number,
  tgId: number
): Promise<void> {
  const subStatus = await getSubscriptionStatus(env, tgId);
  const profile = await getMerchantProfileSafe(env, tgId);
  const isMerchant = Boolean(profile);
  const plan = (subStatus as string) || 'PERCUMA';
  let text = escapeMarkdownV2('👤 PROFIL JOMORDER\\n\\n');
  text += escapeMarkdownV2(`ID Telegram: ${tgId}\\n`);
  text += escapeMarkdownV2(`Peranan: ${isMerchant ? 'Peniaga' : 'Pelanggan'}\\n`);
  text += escapeMarkdownV2(`Pelan: ${plan}\\n`);
  if (isMerchant && profile) {
    text += escapeMarkdownV2(`Kedai: ${profile.nama_kedai}\\n`);
    text += escapeMarkdownV2(`Status Kedai: ${profile.status_kedai}\\n`);
  }
  text += escapeMarkdownV2('\\nGuna /naiktaraf untuk tingkatkan pelan anda ⭐');
  await sendMessage(env, chatId, text);
}
// End: Phase 41 - 22 Command BM Activation (handleProfil export)

// End: JomOrder Fasa 9 - Modular Customer Handler (File 3)
