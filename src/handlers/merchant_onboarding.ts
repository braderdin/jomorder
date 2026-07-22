// src/handlers/merchant_onboarding.ts
// Extracted from src/handlers/merchant.ts for modularity (Fasal 4).

import { Env, MerchantState } from '../types';
import { setState, getState, checkMerchantExists } from '../redis'; // Assuming redis.ts is core and available
import { sendMessage, escapeMarkdownV2, merchantReplyKeyboard } from '../telegram'; // Import merchantReplyKeyboard
// Assuming UI helpers and validators are in separate files, though not yet separated.
// For now, duplicating placeholder functions or assuming they are accessible.

// Placeholder for UI helpers
function daftarKedaiKeyboard() {
    return {
        keyboard: [[{ text: '🏪 Daftar Kedai Saya' }]], // Ini akan dihapus atau diganti
        resize_keyboard: true,
        one_time_keyboard: false,
    };
}
function kongsiLokasiKeyboard() {
    return {
        keyboard: [[{ text: '📍 Kongsi Lokasi Kedai', request_location: true }]],
        resize_keyboard: true,
        one_time_keyboard: false,
    };
}

// Placeholder for validators
function sanitizeShopName(raw: string): string {
   return (raw || '').replace(/[\r\n]/g, ' ').trim().slice(0, 60);
}
function isValidNameKedai(name: string): boolean {
   return sanitizeShopName(name).length > 0;
}


/**
 * handleMerchantOnboarding
 * Handles initial merchant onboarding flow: /daftar, /set_lokasi, /urus_kedai.
 * Manages state persistence via Redis (Fasal 7 Strategy 2).
 * @returns true if the message was handled by this onboarding flow, false otherwise.
 */
export async function handleMerchantOnboarding(
    env: Env,
    chatId: number,
    tgId: number,
    text: string
): Promise<boolean> {
    // Phase 39: Responsive Onboarding Thread Lock-Clear (anti-abandon)
    // Handles /daftar, /set_lokasi, /urus_kedai interactively with state persistence.
    console.log(`[MerchantOnboarding] handleMerchantOnboarding called for tgId: ${tgId}, text: ${text}`);
    if (text === '/daftar' || text === '/urus_kedai' || text === '/set_lokasi') {
        const exists = await checkMerchantExists(env, tgId);
        console.log(`[MerchantOnboarding] Merchant exists: ${exists}`);
        if (text === '/set_lokasi') {
            if (!exists) {
                await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Anda belum mendaftar kedai. Taip /daftar untuk bermula.'), merchantReplyKeyboard());
                return true; // Handled
            }
            await setState(env, {
                merchant_telegram_id: tgId,
                step: 'awaiting_shop_location',
                last_active: new Date().toISOString(),
            });
            console.log(`[MerchantOnboarding] State set to awaiting_shop_location for tgId: ${tgId}`);
            await sendMessage(env, chatId, escapeMarkdownV2('📍 Hantar lokasi baharu kedai anda dengan butang 📍 di bawah:'), kongsiLokasiKeyboard());
            return true; // Handled
        }
        // /daftar & /urus_kedai
        if (exists) {
            console.log(`[MerchantOnboarding] Merchant already exists for tgId: ${tgId}. Redirecting to merchant dashboard.`);
            await setState(env, {
                merchant_telegram_id: tgId,
                step: 'idle', // Reset to idle after existing registration
                last_active: new Date().toISOString(),
            });
            await sendMessage(env, chatId, escapeMarkdownV2('🏪 Kedai anda sudah berdaftar. Gunakan butang di bawah untuk mengurus operasi.'), merchantReplyKeyboard());
            return true; // Handled
        }
        await setState(env, {
            merchant_telegram_id: tgId,
            step: 'awaiting_shop_name',
            last_active: new Date().toISOString(),
        });
        console.log(`[MerchantOnboarding] State set to awaiting_shop_name for tgId: ${tgId}`);
        await sendMessage(env, chatId, escapeMarkdownV2('Taip nama kedai anda untuk mendaftar:')); // Tanpa keyboard yang membingungkan
        return true; // Handled
    }

    // Check if current state requires shop name input (after /daftar command)
    const current = await getState(env, tgId);
    console.log(`[MerchantOnboarding] Current state for tgId ${tgId}: ${current?.step}`);
    if (current?.step === 'awaiting_shop_name') {
        const cleanName = sanitizeShopName(text);
        if (!isValidNameKedai(cleanName)) {
            await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Nama kedai tidak sah. Sila taip nama kedai yang sah (1-60 aksara).')); // Tanpa keyboard
            return true; // Handled
        }
        // Store shop name and prompt for location
        const next: MerchantState = {
            merchant_telegram_id: tgId,
            shop_name: cleanName,
            step: 'awaiting_shop_location',
            last_active: new Date().toISOString(),
        };
        await setState(env, next);
        console.log(`[MerchantOnboarding] Shop name "${cleanName}" received. State set to awaiting_shop_location.`);
        await sendMessage(
            env,
            chatId,
            escapeMarkdownV2(`📍 Terima kasih! Kedai "${cleanName}" disimpan sementara. Sila hantar 📍 lokasi kedai anda untuk melengkapkan pendaftaran.`),
            kongsiLokasiKeyboard()
        );
        return true; // Handled
    }
    
    // If not specifically handled by onboarding steps, return false to let other handlers process.
    // This ensures messages are passed along if not part of the onboarding flow.
    return false; 
}

/**
 * handleMerchantRegistrasiLocation
 * Handles the native Telegram location object received during registration.
 * Intercepts native location, logs lat/long, and commits to DB via daftarKedaiPermulaan.
 * @returns true if the location was handled as part of onboarding, false otherwise.
 */
export async function handleMerchantRegistrasiLocation(
    env: Env,
    chatId: number,
    tgId: number,
    latitude: number,
    longitude: number
): Promise<boolean> {
    const current = await getState(env, tgId);
    if (!current || current.step !== 'awaiting_shop_location') return false; // Not in location state

    console.log(`[MerchantOnboarding] Location received for tgId: ${tgId}, lat: ${latitude}, long: ${longitude}`);
    const namaKedai = current.shop_name || 'Kedai Tanpa Nama'; // Fetch stored shop name
    const ok = await daftarKedaiPermulaan(env, tgId, namaKedai, latitude, longitude); // Persist to DB
    console.log(`[MerchantOnboarding] daftarKedaiPermulaan result: ${ok}`);
    
    const next: MerchantState = { // Update state after registration attempt
        merchant_telegram_id: tgId,
        shop_name: namaKedai,
        step: ok ? 'idle' : 'awaiting_shop_location', // Reset step on success, retry on fail
        last_active: new Date().toISOString(),
    };
    await setState(env, next);

    if (ok) {
        console.log(`[MerchantOnboarding] Shop "${namaKedai}" registered successfully.`);
        await sendMessage(
            env,
            chatId,
            escapeMarkdownV2(`✅ Kedai "${namaKedai}" berjaya didaftarkan dengan lokasi! Status: MENUNGGU PENGESAHAN. Sila tunggu kelulusan admin.`),
            merchantReplyKeyboard() // Menggunakan papan kekunci peniaga yang sesuai
        );
    } else {
        console.error(`[MerchantOnboarding] Failed to register location for shop "${namaKedai}".`);
        await sendMessage(
            env,
            chatId,
            escapeMarkdownV2('❌ Gagal daftar lokasi. Sila hantar 📍 lokasi kedai anda sekali lagi.'),
            kongsiLokasiKeyboard() // Prompt to send location again
        );
    }
    return true; // Location was handled
}