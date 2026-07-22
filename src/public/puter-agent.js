// Start: Phase 69c - Hidden AI Agent (client-side, user-funded) + JomOrder Brain
// Agen AI untuk pelawat portal. Pengguna log masuk menggunakan akaun Google mereka sendiri,
// menggunakan senarai model mereka sendiri, dan membayar sendiri. Projek ini tidak menggunakan kuota Pembantu AI.
// RAHSIA: Tiada label pembekal dipaparkan di DOM. Skrip dimuatkan secara dinamik tanpa teks yang kelihatan.
//
// OTAK: systemMessage menerangkan JomOrder supaya model dapat menjawab dengan tepat walaupun
// model rawak tidak mengetahui apa-apa tentang projek ini.
(function () {
  const SCRIPT_SRC = 'https://js.puter.com/v2/';

  // Default model (pantas, sederhana) - dipilih Chip Besar.
  const DEFAULT_MODEL = 'google/gemma-4-26b-a4b-it:free';

  // Konstanta pesan kesalahan
  const ERROR_LOAD_FAIL = 'load-fail';
  const ERROR_ALL_MODELS_FAILED = 'all-models-failed';

  // Senarai fallback round-robin jika default gagal.
  const FALLBACK_MODELS = [
    'prism-ml/ternary-bonsai-27b',
    'poolside/laguna-xs-2.1:free',
    'poolside/laguna-m.1:free',
    'cohere/north-mini-code:free',
    'meta-llama/llama-3.2-3b-instruct:free',
    'google/gemma-3n-e2b-it:free',
    'google/gemma-4-31b-it:free',
    'nvidia/nemotron-3-ultra-550b-a55b:free',
    'nvidia/nemotron-3.5-content-safety:free',
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    'nvidia/nemotron-nano-9b-v2:free',
    'liquid/lfm-2.5-1.2b-instruct:free',
    'liquid/lfm-2.5-1.2b-thinking:free',
    'qwen/qwen3.6-plus-preview:free',
    'qwen/qwen3-4b:free',
    'baidu/cobuddy:free'
  ];

  // OTAK JomOrder - diberi sebagai systemMessage pada setiap panggilan.
  const BRAIN = [
    'Anda ialah "Pembantu JomOrder", chatbot rasmi untuk projek JomOrder.',
    'JomOrder ialah platform mikro-SaaS (Software-as-a-Service) multi-tenant untuk peniaga F&B (makanan & minuman) Malaysia.',
    'Ia beroperasi 100% melalui bot Telegram - peniaga tidak memerlukan aplikasi berasingan.',
    'Kos operasi ialah RM0 (freetier) - dibina untuk program MDEC GLOW (Global Online Workforce / Gig Economy).',
    'Fungsi utama: (1) Peniaga mendaftar kedai menggunakan /daftar, (2) membina menu menggunakan /tambah_menu, (3) pelanggan mencari kedai berdekatan, memilih makanan, membayar menggunakan DuitNow QR, (4) peniaga menerima pesanan dan menyediakannya.',
    'Ada 30 perintah native Bahasa Malaysia: pelanggan (/start, /menu, /troli, /pesanan_saya, /promo), peniaga (/daftar, /tambah_menu, /laporan_jualan, /cipta_kupon, /invois, /zon_operasi), pentadbir (/admin_stats, /pengumuman).',
    'Teknologi: Cloudflare Worker (serverless), Supabase (Postgres + RLS multi-tenant isolation), Redis (cache state), Cloudflare R2 (simpan QR DuitNow & foto menu WebP).',
    'Bayaran: DuitNow QR - pelanggan mengimbas, wang masuk terus ke akaun peniaga.',
    'Portal web: https://jomorder-portal.vercel.app/ , Bot Telegram: https://t.me/jomorder_makan_bot',
    'Jawab dalam Bahasa Malaysia yang mesra & santai (gaya "JomOrder Modern-Siber"). Gunakan emoji bila sesuai.',
    'Jika ditanya selain JomOrder, arahkan semula ke topik JomOrder. Jika tidak pasti, katakan "Sila buka bot Telegram untuk butiran lanjut".',
    'JANGAN berbohong tentang ciri yang tidak wujud. Fokus membantu pelawat memahami dan mencuba JomOrder.'
  ].join(' ');

  let sdk = null; // SDK Puter.com

  function loadSdk() {
    return new Promise((resolve, reject) => {
      if (window.puter) { sdk = window.puter; return resolve(sdk); }
      const s = document.createElement('script');
      s.src = SCRIPT_SRC;
      s.onload = () => { sdk = window.puter; resolve(sdk); }; // Setelah SDK dimuat, inisialisasi pemboleh ubah sdk
      s.onerror = () => reject(new Error(ERROR_LOAD_FAIL));
      document.head.appendChild(s);
    });
  }

  async function ensureAuth() {
    if (!sdk) await loadSdk();
    if (sdk.auth && sdk.auth.isSignedIn && await sdk.auth.isSignedIn()) return true;
    await sdk.auth.signIn();
    return true;
  }

  // Pilih model fallback secara round-robin (model lalai di luar senarai ini).
  function nextFallback() { // Pilih model fallback secara round-robin (model lalai di luar senarai ini).
    const m = FALLBACK_MODELS[idx % FALLBACK_MODELS.length];
    idx++;
    return m;
  }

  // Public API: run a chat with JomOrder brain.
  // Auto: cuba DEFAULT_MODEL dulu, kalau gagal fallback round-robin.
  // Auto: cuba DEFAULT_MODEL terlebih dahulu, jika gagal gunakan fallback round-robin.
  window.__xAgent = {
    _fallbackIdx: 0, // Internal index for round-robin fallback
    async run(prompt, opts) {
      try {
        await ensureAuth();
        const history = opts && opts.history ? opts.history : [];
        const tryModel = async (model) => {
          return await sdk.ai.chat(prompt, {
            model: model,
            systemMessage: BRAIN,
            messages: history
          });
        };
        let resp;
        let usedModel = DEFAULT_MODEL;
        try {
          resp = await tryModel(DEFAULT_MODEL);
        } catch (e) {
          let lastErr;
          for (let i = 0; i < FALLBACK_MODELS.length; i++) {
            const fb = FALLBACK_MODELS[this._fallbackIdx++ % FALLBACK_MODELS.length]; // Use internal index
            usedModel = fb;
            try {
              resp = await tryModel(fb);
              break;
            } catch (e2) {
              lastErr = e2;
            }
          }
          if (resp === undefined) throw lastErr || new Error(ERROR_ALL_MODELS_FAILED);
        }
        return { ok: true, model: usedModel, text: resp || '' };
      } catch (e) {
        return { ok: false, error: String((e && e.message) || e) };
      }
    },
    defaultModel: DEFAULT_MODEL,
    fallbackModels: FALLBACK_MODELS
  };

  // Widget 1: Penjana Idea Menu AI (pelawat menaip jenis kedai).
  window.__xMenuIdea = async (jenis) => {
    const p = `Cadangkan 5 nama hidangan popular untuk kedai "${jenis}" di Malaysia, dengan harga RM yang munasabah dan emoji. Format: EMOJI NAMA - RMHARGA (satu baris setiap satu).`;
    return window.__xAgent.run(p);
  };
  // Widget 2: Penulis Ulasan AI (pelanggan menaip pengalaman kasar).
  window.__xReview = async (draft) => {
    const p = `Tulis ulasan pendek dan mesra (1-2 ayat) dalam Bahasa Malaysia berdasarkan draf kasar ini: "${draft}". Tambah emoji.`;
    return window.__xAgent.run(p);
  };
  // Widget 3: Penterjemah AI BM<->EN (menterjemah deskripsi menu).
  window.__xTranslate = async (teks, ke) => {
    const p = `Terjemah teks ini ke ${ke === 'en' ? 'Bahasa Inggeris' : 'Bahasa Melayu'}: "${teks}". Jawab HANYA dengan terjemahan.`;
    return window.__xAgent.run(p);
  };

  // Auto-init on idle (visitor not prompted; used for page enrichment only).
  document.addEventListener('DOMContentLoaded', () => {
    loadSdk().catch(err => console.error('Failed to load Puter SDK:', err)); // Log error instead of swallowing
  });
})();
// End: Phase 69c - Hidden AI Agent + JomOrder Brain