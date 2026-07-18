// Start: Phase 32 - Bot Menu Registration (Native Telegram Command Grid)
// Fasal 6 (Bahasa Malaysia UI) + Fasal 4 (SOA) + Fasal 11 (env binding).
// Mendaftar 16 arahan natif ke attachment menu Telegram guna setMyCommands API.
import { Env, NATIVE_COMMAND_LIST } from '../types';

const TELEGRAM_API = 'https://api.telegram.org/bot';

/** 22 arahan kanonikal BM dipaparkan di menu natif Telegram (deskripsi BM). */
// Start: Phase 41 - 22 Command BM Activation (sync 1:1 NATIVE_COMMAND_LIST)
// Kemaskini ke 22 command BM supaya BotFather menu padan dengan router handlers.ts.
const BOT_COMMANDS: Array<{ command: string; description: string }> = [
  { command: '/start', description: 'Mula & pilih peranan' },
  { command: '/bantuan', description: 'Panduan interaktif bot' },
  { command: '/menu', description: 'Senarai kedai aktif' },
  { command: '/urus', description: 'Papan pemerintah peniaga' },
  { command: '/urus_kedai', description: 'Urus kedai saya' },
  { command: '/daftar', description: 'Daftar kedai baharu' },
  { command: '/tambah_menu', description: 'Tambah item menu' },
  { command: '/senarai_menu', description: 'Senarai menu kedai' },
  { command: '/cari_makan', description: 'Cari kedai berdekatan' },
  { command: '/troli', description: 'Lihat troli pesanan' },
  { command: '/pesanan_saya', description: 'Senarai pesanan aktif' },
  { command: '/senarai_pesanan', description: 'Senarai pesanan saya' },
  { command: '/cipta_kupon', description: 'Cipta kupon diskaun' },
  { command: '/senarai_kupon', description: 'Senarai kupon aktif' },
  { command: '/padam_kupon', description: 'Padam kupon diskaun' },
  { command: '/invois', description: 'Jana invois digital' },
  { command: '/laporan_jualan', description: 'Laporan jualan kedai' },
  { command: '/set_lokasi', description: 'Tetapkan koordinat kedai' },
  { command: '/sejarah_pesanan', description: 'Sejarah pesanan saya' },
  { command: '/batalkan_pesanan', description: 'Batal pesanan tertunda' },
  { command: '/profil', description: 'Profil & langganan saya' },
  { command: '/naiktaraf', description: 'Naik taraf pelan premium' },
  { command: '/zon_operasi', description: 'Zon operasi perkhidmatan' },
  { command: '/admin_stats', description: 'Statistik pentadbir' },
  { command: '/senarai_pendaftaran', description: 'Senarai peniaga berdaftar' },
  { command: '/pengumuman', description: 'Pengumuman pentadbir' },
  { command: '/status', description: 'Semak status bot & akaun' },
];

/**
 * Daftarkan kesemua 22 arahan bot ke menu natif Telegram pengguna.
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
/**
 * validateCommandSync - sahkan konfigurasi deployment menu selari 1:1 dengan
 * NATIVE_COMMAND_LIST (sumber benar tunggal di types.ts). Elak drift arahan
 * antara setMyCommands API dan registry 22-command (Fasal 4 SOA).
 * Return true jika kedua-dua set padan sempurna (command + kiraan).
 */
export function validateCommandSync(): boolean {
  if (BOT_COMMANDS.length !== NATIVE_COMMAND_LIST.length) return false;
  const nativeMap = new Map(NATIVE_COMMAND_LIST.map((c) => [c.command, c.description]));
  for (const c of BOT_COMMANDS) {
    if (nativeMap.get(c.command) !== c.description) return false;
  }
  return true;
}
// End: Phase 41 - 22 Command BM Activation (Bot Menu Registration)
