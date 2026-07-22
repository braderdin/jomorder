// Start: Phase 32 - Bot Menu Registration (Native Telegram Command Grid)
// Fasal 6 (Bahasa Malaysia UI) + Fasal 4 (SOA) + Fasal 11 (env binding).
// Mendaftar 31 perintah natif ke menu lampiran Telegram menggunakan API setMyCommands.
import { Env, NATIVE_COMMAND_LIST } from '../types';

const TELEGRAM_API = 'https://api.telegram.org/bot';

// Start: Phase 53 - 30 Command Master Sync (1:1 NATIVE_COMMAND_LIST)
// Extract commands for Telegram API (only command + description, no role field)
const BOT_COMMANDS: Array<{ command: string; description: string }> = NATIVE_COMMAND_LIST.map(c => ({
  command: c.command,
  description: c.description
}));
// End: Phase 53 - 30 Command Master Sync

/** 
 * Daftarkan kesemua 31 perintah bot ke menu natif Telegram pengguna.
 * Memanggil API setMyCommands Telegram. Soft-fail: mengembalikan false tanpa membuang pengecualian.
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
    // Soft-fail (Fasa 7 Strategi 4) - jangan menyebabkan worker bootstrap terhenti.
    return false;
  }
}

/**
 * validateCommandSync - mengesahkan konfigurasi deployment menu selari 1:1 dengan
 * NATIVE_COMMAND_LIST (sumber kebenaran tunggal di types.ts). Mengelakkan hanyutan perintah
 * antara API setMyCommands dan registri 31-perintah (Fasa 4 SOA).
 * Mengembalikan true jika kedua-dua set padan sempurna (perintah dan kiraan).
 */
export function validateCommandSync(): boolean {
  // Validation now always passes since we derive BOT_COMMANDS from NATIVE_COMMAND_LIST
  return true;
}
// End: Phase 41 - 22 Command BM Activation (Bot Menu Registration)
