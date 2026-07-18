// Start: JomOrder Fasa 5 - Order Lifecycle State Manager (Fail 2)
// Fasal 4 (SOA) + Fasal 7 Strategy 3 (cart buffer -> rekod_pesanan commit)
// Fasa 5: PENDING -> MEMASAK -> DELIVERY -> COMPLETED dengan Grace Period guard.

import { Env } from './types';
import { LanggananStatus } from './subscription';
import { updateStatusPenghantaran, restoreInventoryOnCancel } from './db';

/** Kitar hayat pesanan (selaras rekod_pesanan.status_penghantaran). */
export type OrderLifecycle = 'PENDING' | 'MEMASAK' | 'DELIVERY' | 'COMPLETED';

/** Peta peralihan sah antara status pesanan. */
const TRANSISI: Record<OrderLifecycle, OrderLifecycle | null> = {
  PENDING: 'MEMASAK',
  MEMASAK: 'DELIVERY',
  DELIVERY: 'COMPLETED',
  COMPLETED: null,
};

/** Dapatkan status seterusnya; null jika tiada (COMPLETED). */
export function nextOrderState(current: OrderLifecycle): OrderLifecycle | null {
  return TRANSISI[current] ?? null;
}

/** True jika status masih dalam operasi aktif (belum COMPLETED). */
export function isOrderActive(status: OrderLifecycle): boolean {
  return status !== 'COMPLETED';
}

/**
 * GUARD Grace Period: Benarkan peniaga dengan langganan 'TAMAT' terus
 * mengemaskini pesanan sedia ada selagi ia BELUM 'COMPLETED'.
 * Ini memastikan pesanan berjalan (MEMASAK/DELIVERY) tamat secara gracefull.
 *
 * @param merchantStatus status langganan peniaga
 * @param orderStatus status semasa pesanan
 * @returns true = dibenarkan update; false = disekat
 */
export function canMerchantUpdateOrder(
  merchantStatus: LanggananStatus,
  orderStatus: OrderLifecycle
): boolean {
  // Jika pesanan sudah COMPLETED, tiada lagi kemas kini dibenarkan.
  if (orderStatus === 'COMPLETED') return false;
  // Selagi pesanan aktif, benarkan update walaupun langganan TAMAT (Grace Period).
  if (isOrderActive(orderStatus)) return true;
  return false;
}

/**
 * GUARD Carian: Halang peniaga 'TAMAT' dari membuka carian pelanggan baharu.
 * Pelanggan guna RPC ambil_kedai_berhampiran yang auto-exclude 'TAMAT',
 * jadi sekatan ini adalah lapisan pertahanan kedua di sisi bot.
 *
 * @returns true = carian disekat
 */
export function isSearchRestricted(merchantStatus: LanggananStatus): boolean {
  return merchantStatus === 'TAMAT';
}

/**
 * GUARD Pembatalan Pesanan: Benarkan batal HANYA jika status masih PENDING.
 * Selepas memasuki MEMASAK/DELIVERY/COMPLETED/REJECTED, pembatalan disekat
 * (Fasal 7 Strategy 4 - elak mutasi state tidak sah).
 * @param currentStatus status semasa pesanan (dari DB)
 * @returns true = boleh dibatalkan
 */
export function canCancelOrder(currentStatus: 'PENDING' | 'MEMASAK' | 'DELIVERY' | 'COMPLETED' | 'REJECTED'): boolean {
  return currentStatus === 'PENDING';
}

// Start: Phase 38 - Inventory Stock Recovery Shield
/**
 * restoreInventoryForCancelledOrder
 * Pulihkan balik stok menu_makanan (status_tersedia=true) apabila pesanan
 * dibatalkan semasa PENDING. Elak peniaga kehilangan item selepas cancel.
 * Soft-fail: sebarang ralat ditelan (Fasal 7 Strategy 4) supaya cancel tetap lancar.
 *
 * @param env bindings Worker
 * @param kedaiId UUID kedai (RLS isolation - Fasal 7 Strategy 1)
 * @param items item pesanan yang perlu dipulihkan ke katalog
 */
export async function restoreInventoryForCancelledOrder(
  env: Env,
  kedaiId: string,
  items: Array<{ item_id: string; kuantiti: number }>
): Promise<void> {
  try {
    await restoreInventoryOnCancel(env, kedaiId, items);
  } catch {
    // Swallow - inventory recovery bukan blocker untuk cancel.
  }
}
// End: Phase 38 - Inventory Stock Recovery Shield

// Start: Fasa 5 - Order Lifecycle Persistence (DB commit on transition)
/**
 * Lakukan peralihan status pesanan & PERSIST ke rekod_pesanan.status_penghantaran.
 * Grace Period: jika langganan TAMAT tetapi pesanan masih aktif, benarkan.
 *
 * @param env bindings Worker
 * @param orderId ID rekod_pesanan
 * @param kedaiId UUID kedai (RLS isolation - Fasal 7 Strategy 1)
 * @param currentStatus status semasa (daripada DB / callback)
 * @param merchantStatus status langganan peniaga (untuk Grace guard)
 * @returns status baharu jika berjaya; null jika disekat/gagal
 */
export async function transitionOrderStatus(
  env: Env,
  orderId: number,
  kedaiId: string,
  currentStatus: OrderLifecycle,
  merchantStatus: LanggananStatus
): Promise<OrderLifecycle | null> {
  // Grace Period guard: halang update jika tak dibenarkan
  if (!canMerchantUpdateOrder(merchantStatus, currentStatus)) return null;

  const next = nextOrderState(currentStatus);
  if (!next) return null; // sudah COMPLETED

  const ok = await updateStatusPenghantaran(env, orderId, kedaiId, next);
  return ok ? next : null;
}

// End: Fasa 5 - Order Lifecycle Persistence (DB commit on transition)

// End: JomOrder Fasa 5 - Order Lifecycle State Manager (Fail 2)
