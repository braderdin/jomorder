// Start: Phase 32 - Bot Menu Registration (Native Telegram Command Grid)
// Fasal 6 (Bahasa Malaysia UI) + Fasal 4 (SOA) + Fasal 11 (env binding).
// Mendaftar 16 arahan natif ke attachment menu Telegram guna setMyCommands API.
import { Env } from '../types';

const TELEGRAM_API = 'https://api.telegram.org/bot';

/** 16 arahan kanonikal dipaparkan di menu natif Telegram (deskripsi BM). */
const BOT_COMMANDS: Array<{ command: string; description: string }> = [
  { command: '/start', description: 'Mula & pilih peranan' },
  { command: '/help', description: 'Panduan interaktif bot' },
  { command: '/menu', description: 'Senarai kedai aktif' },
  { command: '/urus', description: 'Papan pemerintah peniaga' },
  { command: '/cari_makan', description: 'Cari kedai makan berdekatan' },
  { command: '/troli', description: 'Lihat troli pesanan saya' },
  { command: '/pesanan_saya', description: 'Senarai pesanan aktif' },
  { command: '/cipta_kupon', description: 'Cipta kupon diskaun baru' },
  { command: '/senarai_kupon', description: 'Senarai kupon aktif' },
  { command: '/padam_kupon', description: 'Padam kupon diskaun' },
  { command: '/invois', description: 'Jana invois digital' },
  { command: '/laporan_jualan', description: 'Laporan jualan platform' },
  { command: '/zon_operasi', description: 'Zon operasi perkhidmatan' },
  { command: '/admin_stats', description: 'Statistik pentadbir sistem' },
  { command: '/senarai_pendaftaran', description: 'Senarai peniaga berdaftar' },
  { command: '/naiktaraf', description: 'Naik taraf pelan premium' },
];

/**
 * Daftarkan kesemua 16 arahan bot ke menu natif Telegram pengguna.
 * Memanggil Telegram setMyCommands API. Soft-fail: return false tanpa throw.
 */
export async function registerBotCommands(env: Env): Promise<boolean> {
  try {
    const url = `${TELEGRAM_API}${env.TELEGRAM_BOT_TOKEN}/setMyCommands`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands: BOT_COMMANDS }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { ok?: boolean };
    return data.ok === true;
  } catch {
    // Soft-fail (Fasal 7 Strategy 4) - jangan crash worker bootstrap.
    return false;
  }
}
// End: Phase 32 - Bot Menu Registration