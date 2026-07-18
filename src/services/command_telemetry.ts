// Start: Phase 42 - Command Telemetry Service (Fasal 7 S1 + Fasal 4 SOA)
// Track setiap 22-command hit ke table command_telemetry (Supabase).
// Fail-open: jika insert gagal, jangan block command utama (Fasal 7 S4).
import { Env } from '../types';

/**
 * Rekam satu command hit ke Supabase command_telemetry.
 * Soft-fail: swallow error supaya command flow tak terganggu.
 */
export async function recordCommandTelemetry(
  env: Env,
  opts: {
    command: string;
    merchantTelegramId?: number;
    chatId?: number;
    status?: 'OK' | 'ERROR';
    errorMessage?: string;
  }
): Promise<void> {
  try {
    const payload = {
      command: opts.command,
      merchant_telegram_id: opts.merchantTelegramId ?? null,
      chat_id: opts.chatId ?? null,
      status: opts.status ?? 'OK',
      error_message: opts.errorMessage ?? null,
    };
    const url = `${env.SUPABASE_URL}/rest/v1/command_telemetry`;
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(payload),
    });
    } catch {
    // Soft-fail (Fasal 7 Strategy 4) - telemetry tak boleh block command.
  }
}
// End: Phase 42 - Command Telemetry Service

// Start: Phase 44 - /status Telemetry Support
// recordCommandTelemetry(label='/status') disokong sepenuhnya tanpa
// perubahan logik. withCommandGuard di handlers.ts sudah panggil service
// ini untuk setiap command termasuk /status (fail-open insert).
// End: Phase 44 - /status Telemetry Support
