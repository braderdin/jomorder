// Start: JomOrder Fasa 4 - Message Router & Onboarding Logic (Fail 3)
// Fasal 7 Strategy 2 (state persist) + Strategy 1 (RLS DB check)
// Fasal 6 (escape + mobile keyboard) + Fasal 4 (SOA)
import { Env, TelegramUpdate, MerchantState } from './types';
import { sendMessage, escapeMarkdownV2, merchantMenuKeyboard, customerMenuKeyboard } from './telegram';
import { checkMerchantExists, daftarKedaiPermulaan, ambilKedaiBerhampiran, updateOrderState, commitOrderPayload } from './db';
import { setState, getState, invalidateSubscriptionCache, invalidateSubscriptionCacheBatch } from './redis';
import { getSubscriptionStatus, sendExpiryAlert, isExpired } from './subscription';
import { isSearchRestricted, transitionOrderStatus, OrderLifecycle } from './orders';
import { dispatchSubscriptionAlerts } from './services/scheduler';
import { generateDuitNowQrText, buildPaymentReceiptLayout } from './services/payment';
import { buildDecisionCaption } from './services/admin';

/** Custom keyboard: butang pendaftaran kedai (Fasal 6 max 1 btn row). */
function daftarKedaiKeyboard() {
  return {
    keyboard: [[{ text: '🏪 Daftar Kedai Saya' }]],
    resize_keyboard: true,
    one_time_keyboard: false,
  };
}

/** Routing utama untuk setiap update masuk. */
export async function handleUpdate(env: Env, update: TelegramUpdate): Promise<void> {
  // Start: Fasa 5 - Order Lifecycle callback router (PENDING->MEMASAK->DELIVERY->COMPLETED)
  // Callback data format: order_next:{orderId}:{kedaiId}:{currentStatus}
  const cb = update.callback_query;
  if (cb?.from) {
    const cbChatId = cb.message?.chat.id ?? cb.from.id;
    const data = cb.data || '';
    if (data.startsWith('order_next:')) {
      const parts = data.split(':');
      const orderId = Number(parts[1]);
      const kedaiId = parts[2] || '';
      const currentStatus = (parts[3] || 'PENDING') as OrderLifecycle;
      const subStatus = await getSubscriptionStatus(env, cb.from.id);
      const next = await transitionOrderStatus(env, orderId, kedaiId, currentStatus, subStatus);
      if (next) {
        // Fasa 6: Persist penuh state mesin pesanan ke DB (atomik via updateOrderState)
        await updateOrderState(env, orderId, kedaiId, { status_penghantaran: next });
        await sendMessage(
          env,
          cbChatId,
          escapeMarkdownV2(`✅ Pesanan #${orderId} dikemas kini: ${currentStatus} → ${next}`),
          merchantMenuKeyboard()
        );
      } else {
        await sendMessage(
          env,
          cbChatId,
          escapeMarkdownV2('⚠️ Tidak dapat kemas kini pesanan \\(sudah COMPLETED atau disekat grace-period\\)\\.'),
          merchantMenuKeyboard()
        );
      }
      return;
    }
    // Start: Fasa 7 - Payment Confirmation (DuitNow QR Checkout)
    // Callback data format: pay_now:{orderId}:{kedaiId}:{customerId}
    if (data.startsWith('pay_now:')) {
      const parts = data.split(':');
      const orderId = Number(parts[1]);
      const kedaiId = parts[2] || '';
      const customerId = Number(parts[3] || cb.from.id);
      const ok = await updateOrderState(env, orderId, kedaiId, {
        status_pembayaran: 'TELAH_BAYAR',
      });
      if (ok) {
        // Alert segera ke peniaga bila pelanggan tandakan 'PAID'
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
      return;
    }
    // End: Fasa 7 - Payment Confirmation (DuitNow QR Checkout)

    // Start: Fasa 8 - Admin Approval Gateway callback router
    // Nod payload: approve_shop:{shopId}:{merchantTgId} | reject_shop:{shopId}:{merchantTgId}
    if (data.startsWith('approve_shop:') || data.startsWith('reject_shop:')) {
      const parts = data.split(':');
      const shopId = parts[1] || '';
      const merchantTgId = Number(parts[2] || 0);
      const approved = data.startsWith('approve_shop:');

      // Switch status_kedai di Supabase (service_role bypass RLS, Fasal 7 Strategy 1)
      const patchUrl = `${env.SUPABASE_URL}/rest/v1/senarai_kedai?id=eq.${shopId}`;
      await fetch(patchUrl, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ status_kedai: approved ? 'DILULUSKAN' : 'DITOLAK' }),
      });

      // Clear Redis cache segera (Fasal 7 Strategy 2)
      if (merchantTgId) await invalidateSubscriptionCache(env, merchantTgId);

      // Answer callback (buang spinner) - inline fetch, tiada tambah file
      await fetch(
        `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: cb.id,
            text: approved ? '✅ Diluluskan' : '⛔ Ditolak',
          }),
        }
      );

      // Kapsyen ke admin + notifikasi terus ke peniaga
      await sendMessage(env, cbChatId, buildDecisionCaption(approved, shopId), merchantMenuKeyboard());
      if (merchantTgId) {
        await sendMessage(
          env,
          merchantTgId,
          escapeMarkdownV2(
            approved
              ? '🎉 Permohonan kedai ANDA DILULUSKAN! Anda kini boleh terima pesanan.'
              : '⛔ Permohonan kedai anda DITOLAK. Sila hubungi sokongan.'
          ),
          merchantMenuKeyboard()
        );
      }
      return;
    }
    // End: Fasa 8 - Admin Approval Gateway callback router

    return; // callback lain diabaikan buat masa ini
  }
  // End: Fasa 5 - Order Lifecycle callback router

  const msg = update.message;
  if (!msg?.from) return;

  const chatId = msg.chat.id;
  const tgId = msg.from.id;

  // Fasa 5: Pelanggan hantar lokasi -> RPC ambil_kedai_berhampiran auto-exclude TAMAT
  if (msg.location) {
    const kedai = await ambilKedaiBerhampiran(env, msg.location.latitude, msg.location.longitude);
    if (kedai.length === 0) {
      await sendMessage(env, chatId, escapeMarkdownV2('Tiada kedai berdekatan dalam radius 10km 🍽️'));
      return;
    }
    const senarai = kedai
      .map((k, i) => `${i + 1}\\. ${escapeMarkdownV2(k.nama_kedai)} \\(${k.jarak_km.toFixed(1)}km\\)`)
      .join('\n');
    await sendMessage(env, chatId, escapeMarkdownV2('📍 Kedai Berdekatan:\\n') + senarai, customerMenuKeyboard());
    return;
  }

  const text = (msg.text || '').trim();

  // Langkah A: 💼 Menu Peniaga
  if (text === '💼 Menu Peniaga') {
    // Fasa 5: Semak langganan & amarankan jika TAMAT / HAMPIR_TAMAT
    const subStatus = await getSubscriptionStatus(env, tgId);
    if (subStatus !== 'AKTIF') {
      await sendExpiryAlert(env, chatId, subStatus, 'Kedai Anda');
    }
    const state: MerchantState = {
      merchant_telegram_id: tgId,
      step: 'browsing_menu',
      last_active: new Date().toISOString(),
    };
    await setState(env, state);
    // TAMAT masih dibenarkan akses rekod pesanan berjalan (Grace Period)
    const notis = isExpired(subStatus)
      ? ' \\(Akses pesanan berjalan dibenarkan sehingga siap\\)'
      : '';
    await sendMessage(env, chatId, escapeMarkdownV2('📋 Menu Peniaga dibuka!' + notis), merchantMenuKeyboard());
    return;
  }

  // Butang pendaftaran kedai
  if (text === '🏪 Daftar Kedai Saya') {
    const state: MerchantState = {
      merchant_telegram_id: tgId,
      step: 'awaiting_shop_name',
      last_active: new Date().toISOString(),
    };
    await setState(env, state);
    await sendMessage(
      env,
      chatId,
      escapeMarkdownV2('Taip nama kedai anda untuk mendaftar:'),
      daftarKedaiKeyboard()
    );
    return;
  }

  // Fasa 5: Pelanggan / Peniaga minta carian kedai berdekatan
  if (text === '📍 Kedai Berdekatan') {
    // Guard lapisan ke-2: halang merchant TAMAT buka carian pelanggan baharu
    const subStatus = await getSubscriptionStatus(env, tgId);
    if (isSearchRestricted(subStatus)) {
      await sendExpiryAlert(env, chatId, subStatus, 'Kedai Anda');
      await sendMessage(
        env,
        chatId,
        escapeMarkdownV2('🚫 Carian pelanggan baharu disekat \\(langganan tamat\\)\\. Sila perbaharui\\.'),
        merchantMenuKeyboard()
      );
      return;
    }
    await sendMessage(
      env,
      chatId,
      escapeMarkdownV2('Sila hantar 📍 lokasi anda untuk cari kedai berdekatan 🔎'),
      customerMenuKeyboard()
    );
    return;
  }

  // Semak state sedia ada (Fasal 7 Strategy 2)
  const current = await getState(env, tgId);
  if (current?.step === 'awaiting_shop_name') {
    const ok = await daftarKedaiPermulaan(env, tgId, text);
    const next: MerchantState = {
      merchant_telegram_id: tgId,
      shop_name: text,
      step: ok ? 'idle' : 'awaiting_shop_name',
      last_active: new Date().toISOString(),
    };
    await setState(env, next);
    await sendMessage(
      env,
      chatId,
      escapeMarkdownV2(ok ? `✅ Kedai "${text}" berjaya didaftarkan!` : '❌ Gagal daftar. Cuba lagi.'),
      merchantMenuKeyboard()
    );
    return;
  }

  // Langkah B: basic text input — semak pendaftaran dalam DB
  const exists = await checkMerchantExists(env, tgId);
  if (!exists) {
    await sendMessage(
      env,
      chatId,
      escapeMarkdownV2('Hai! Anda belum daftar kedai. Tekan butang di bawah untuk mula 🚀'),
      daftarKedaiKeyboard()
    );
    return;
  }

  // Start: Fasa 7 - Checkout Flow (Cart Verification + Payment Screen)
  // Pelanggan tekan "💳 Bayar Sekarang" -> papar semakan cart + skrin bayaran DuitNow QR
  if (text === '💳 Bayar Sekarang') {
    await handleCheckout(env, chatId, tgId);
    return;
  }
  // End: Fasa 7 - Checkout Flow (Cart Verification + Payment Screen)

  await sendMessage(env, chatId, escapeMarkdownV2('Menu utama JomOrder 🤖'), merchantMenuKeyboard());
}

/**
 * handleCheckout
 * Papar semakan kandungan cart (Fasal 7 Strategy 3 buffer), jana teks DuitNow QR,
 * dan beri butang "Saya Dah Bayar" (callback pay_now) untuk sahkan pembayaran.
 */
async function handleCheckout(env: Env, chatId: number, tgId: number): Promise<void> {
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

/** Struktur cart buffer pelanggan (Strategy 3 JSONB). */
interface CartBuffer {
  kedaiId: string;
  items: Array<{ item_id: string; nama: string; kuantiti: number; harga_seunit: number }>;
  total: number;
  deliveryLat: number;
  deliveryLng: number;
}
// End: Fasa 7 - Checkout Flow (Cart Verification + Payment Screen)

// Start: Fasa 6 - Scheduled Maintenance Wiring
// Mengikat scheduler amaran (HAMPIR_TAMAT/TAMAT) dengan cache invalidation hook.
// Dipanggil dari cron / scheduled invocation (index.ts) bagi loop automasi penuh.
export async function runScheduledMaintenance(env: Env): Promise<number> {
  // 1. Scan + flag + dispatch amaran ke peniaga
  const scanned = await dispatchSubscriptionAlerts(env);
  // 2. Invalidate cache untuk semua peniaga terjejas supaya next read segar
  const ids = scanned.map((r) => r.telegramId);
  if (ids.length > 0) {
    await invalidateSubscriptionCacheBatch(env, ids);
  }
  return ids.length;
}
// End: Fasa 6 - Scheduled Maintenance Wiring

// End: JomOrder Fasa 4 - Message Router & Onboarding Logic (Fail 3)
