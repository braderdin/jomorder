// Start: Phase 70 - AI Helper Features (Layer A, guna callHelperRoundRobin)
// 6 idea: Menu Writer, Customer FAQ, Digest, Spell-Check BM, Image Caption, Smart Coupon.
// Semua panggil callHelperRoundRobin (openrouter/free last resort, limit 5s/5RPM/20RPD).
import { Env } from '../types';
import { callHelperRoundRobin, HelperCallOpts } from './ai_helper';

function strip(text: string): string {
  return (text || '').replace(/^[\s\*\-]+/, '').trim();
}

// 1. AI Menu Writer - peniaga taip nama -> AI tulis penerangan + harga + emoji.
export async function aiMenuWriter(env: Env, namaHidangan: string): Promise<string> {
  const prompt = `Anda pembantu menu restoran Malaysia. Beri penerangan jualan PADAT (1 ayat) untuk "${namaHidangan}", cadangkan harga RM yang munasabah, dan emoji makanan yang sesuai. Format: EMOJI | NAMA | RMHARGA | PENERANGAN. Contoh: 🍜 | Mee Kari | RM8.90 | Mee kari pedas dengan ayam dan telur.`;
  const r = await callHelperRoundRobin(env, { prompt, maxTokens: 200 } as HelperCallOpts);
  return r.ok ? strip(r.text || '') : 'Gagal jana menu (cuba lagi).';
}

// 2. AI Customer FAQ Auto-Reply - text bebas pelanggan -> jawab guna context kedai.
export async function aiCustomerFaq(env: Env, soalan: string, contextKedai: string): Promise<string> {
  const prompt = `Anda pembantu pelanggan JomOrder untuk kedai "${contextKedai}". Jawab soalan pelanggan dalam BM mesra (max 2 ayat). Jika tak relevan, arahkan ke bot @jomorder_makan_bot. Soalan: ${soalan}`;
  const r = await callHelperRoundRobin(env, { prompt, maxTokens: 250 } as HelperCallOpts);
  return r.ok ? strip(r.text || '') : 'Maaf, sila taip /menu untuk pilihan.';
}

// 3. AI Digest Harian - summarize jualan + cadang promo esok.
export async function aiDigest(env: Env, statsJson: string): Promise<string> {
  const prompt = `Anda penganalisis jualan F&B. Dari data JSON ini: ${statsJson}. Beri 1 ayat rumusan + 1 cadangan promo esok (contoh: "Beli 2 Percuma 1"). BM padat.`;
  const r = await callHelperRoundRobin(env, { prompt, needReason: false, maxTokens: 300 } as HelperCallOpts);
  return r.ok ? strip(r.text || '') : 'Digest biasa sahaja.';
}

// 4. AI Spell-Checker BM - betul typo command.
export async function aiSpellCheck(env: Env, salah: string, senaraiBetul: string[]): Promise<string> {
  const prompt = `Betulkan ejaan Arahan Telegram BM ini: "${salah}". Pilih dari senarai sah sahaja: ${senaraiBetul.join(', ')}. Jawab HANYA perkataan betul, tiada teks lain.`;
  const r = await callHelperRoundRobin(env, { prompt, maxTokens: 40 } as HelperCallOpts);
  const out = strip(r.text || '');
  return senaraiBetul.includes(out) ? out : salah;
}

// 5. AI Image Caption - dari OCR text / nama -> caption + anggar kalori.
export async function aiImageCaption(env: Env, ocrText: string): Promise<string> {
  const prompt = `Dari teks gambar makanan ini: "${ocrText}". Tulis NAMA hidangan + ANGGAR kalori (kcal) + 1 ayat BM. Format: NAMA | ~XXXkcal | AYAT.`;
  const r = await callHelperRoundRobin(env, { prompt, maxTokens: 150 } as HelperCallOpts);
  return r.ok ? strip(r.text || '') : 'Gagal baca gambar.';
}

// 6. AI Smart Coupon - cadang kupon ikut basket pelanggan.
export async function aiSmartCoupon(env: Env, basketJson: string): Promise<string> {
  const prompt = `Dari troli pelanggan JSON: ${basketJson}. Cadangkan 1 kupon menarik (contoh "Beli 3 Percuma 1" atau "Diskaun 10% jika >RM20"). Jawab BM padat 1 ayat.`;
  const r = await callHelperRoundRobin(env, { prompt, maxTokens: 120 } as HelperCallOpts);
  return r.ok ? strip(r.text || '') : 'Tiada kupon tersedia.';
}
// End: Phase 70 - AI Helper Features