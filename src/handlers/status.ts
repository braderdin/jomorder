// Start: Phase 44 - /status Command Controller (Fasal 5/6 BM + Fasal 7 S1)
// Papar kad status ringkas: kesihatan bot, peranan user, tier langganan.
// Rujuk checkDatabaseHealth (sentinel), checkMerchantExists (db),
// getSubscriptionStatus (subscription). Soft-fail: jika DB gagal, anggap degraded.
import { Env, NATIVE_COMMAND_LIST } from '../types';
import { sendMessage, escapeMarkdownV2 } from '../telegram';
import { checkMerchantExists } from '../db';
import { getStatusSnapshot } from '../services/sentinel';
import { getSubscriptionStatus } from '../subscription';
import { WORKER_VERSION, getWorkerUptime } from '../services/sentinel';

/**
 * Controller untuk arahan '/status'.
 * Logik:
 *  1. Ambil snapshot kesihatan (DB + Redis) via sentinel.getStatusSnapshot.
 *  2. Tentu peranan (merchant vs customer) via checkMerchantExists.
 *  3. Ambil tier langganan via getSubscriptionTier.
 *  4. Render kad status BM dengan emoji + RM (jika ada).
 * Soft-fail: sebarang throw -> hantar mesej degraded tanpa crash (Fasal 7 S4).
 */
export async function handleStatus(env: Env, chatId: number, tgId: number): Promise<void> {
  let dbOk = false;
  let redisOk = false;
  let isMerchant = false;
  let tier = 'PERCUMA';
  try {
    const snap = await getStatusSnapshot(env);
    dbOk = snap.db;
    redisOk = snap.redis;
  } catch {
    // degraded - teruskan dengan flag false
  }
  try {
    isMerchant = await checkMerchantExists(env, tgId);
  } catch {
    isMerchant = false;
  }
  try {
    tier = await getSubscriptionStatus(env, tgId);
  } catch {
    tier = 'PERCUMA';
  }

  const roleLabel = isMerchant ? 'Peniaga' : 'Pelanggan';
  const healthIcon = dbOk ? '🟢' : '🔴';
  const redisIcon = redisOk ? '🟢' : '🔴';
  const ts = new Date().toLocaleString('ms-MY', { timeZone: 'Asia/Kuala_Lumpur' });

  // Start: Phase 46 - Status Card Elevation (version + uptime + command count)
  // Escape semua nilai berubah supaya tiada parse crash (Fasal 6).
  const uptimeSec = getWorkerUptime();
  const uptimeMin = Math.floor(uptimeSec / 60);
  const uptimeLabel = uptimeMin > 0 ? `${uptimeMin} minit` : `${uptimeSec} saat`;

  const text =
    escapeMarkdownV2('📡 STATUS JomOrder\\n\\n') +
    escapeMarkdownV2(`${healthIcon} Pangkalan Data: ${dbOk ? 'Siap' : 'Degradasi'}\\n`) +
    escapeMarkdownV2(`${redisIcon} Cache Redis: ${redisOk ? 'Siap' : 'Degradasi'}\\n`) +
    escapeMarkdownV2(`👤 Peranan: ${escapeMarkdownV2(roleLabel)}\\n`) +
    escapeMarkdownV2(`⭐ Pelan: ${escapeMarkdownV2(tier)}\\n`) +
    escapeMarkdownV2(`🏷️ Versi: ${escapeMarkdownV2(WORKER_VERSION)}\\n`) +
    escapeMarkdownV2(`⏱️ Masa Jalan: ${escapeMarkdownV2(uptimeLabel)}\\n`) +
    escapeMarkdownV2(`🤖 Arahan Aktif: ${NATIVE_COMMAND_LIST.length}/${NATIVE_COMMAND_LIST.length}\\n`) +
    escapeMarkdownV2(`🕒 Masa: ${escapeMarkdownV2(ts)}`);
  // End: Phase 46 - Status Card Elevation

  // Start: Phase 45 - Rich Status Inline Keyboard (Fasal 6)
  const buttons = {
    inline_keyboard: [
      [{ text: '🔄 Segarkan', callback_data: 'status_refresh' }, { text: '📞 Sokongan', url: 'https://t.me/JomOrderSupport' }],
    ],
  };
  // End: Phase 45 - Rich Status Inline Keyboard
  await sendMessage(env, chatId, text, buttons);
}
// End: Phase 44 - /status Command Controller