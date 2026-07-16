// Start: JomOrder Fasa 5 - Order Lifecycle State Manager (Fail 2)
// Fasal 4 (SOA) + Fasal 7 Strategy 3 (cart buffer -> rekod_pesanan commit)
// Fasa 5: PENDING -> MEMASAK -> DELIVERY -> COMPLETED dengan Grace Period guard.

import { LanggananStatus } from './subscription';

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

// End: JomOrder Fasa 5 - Order Lifecycle State Manager (Fail 2)