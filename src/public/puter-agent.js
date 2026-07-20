// Start: Phase 69c - Hidden AI Agent (client-side, user-funded) + JomOrder Brain
// Agent penyeri untuk PELAWAT portal. Pengguna login Google sendiri,
// guna model list sendiri, BAYAR SENDIRI. Projek TAK bazir quota HELPER.
// RAHSIA: tiada label pembekal di DOM. Script di-load dynamic tanpa teks.
//
// OTAK: systemMessage terangkan JomOrder supaya model jawab betul walaupun
// model rawak tak tahu apa-apa pasal projek ini.
(function () {
  const SCRIPT_SRC = 'https://js.puter.com/v2/';

  // Default model (pantas, sederhana) - dipilih Chip Besar.
  const DEFAULT_MODEL = 'google/gemma-4-26b-a4b-it:free';

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
    'Ia beroperasi 100% melalui bot Telegram - peniaga tak perlu app berasingan.',
    'Kos operasi ialah RM0 (freetier) - dibina untuk program MDEC GLOW (Global Online Workforce / Gig Economy).',
    'Fungsi utama: (1) Peniaga daftar kedai guna /daftar, (2) bina menu guna /tambah_menu, (3) pelanggan cari kedai berdekatan, pilih makanan, bayar guna DuitNow QR, (4) peniaga terima pesanan & sediakan.',
    'Ada 30 perintah native Bahasa Malaysia: pelanggan (/start, /menu, /troli, /pesanan_saya, /promo), peniaga (/daftar, /tambah_menu, /laporan_jualan, /cipta_kupon, /invois, /zon_operasi), pentadbir (/admin_stats, /pengumuman).',
    'Teknologi: Cloudflare Worker (serverless), Supabase (Postgres + RLS multi-tenant isolation), Redis (cache state), Cloudflare R2 (simpan QR DuitNow & foto menu WebP).',
    'Bayaran: DuitNow QR - pelanggan scan, wang masuk terus ke akaun peniaga.',
    'Portal web: https://jomorder-portal.vercel.app/ , Bot Telegram: https://t.me/jomorder_makan_bot',
    'Jawab dalam Bahasa Malaysia yang mesra & santai (gaya "JomOrder Modern-Siber"). Gunakan emoji bila sesuai.',
    'Jika ditanya selain JomOrder, arahkan semula ke topik JomOrder. Jika tak pasti, kata "Sila buka bot Telegram untuk butiran lanjut".',
    'JANGAN berbohong tentang ciri yang tak wujud. Fokus bantu pelawat faham & cuba JomOrder.'
  ].join(' ');

  let idx = 0;
  let sdk = null;

  function loadSdk() {
    return new Promise((resolve, reject) => {
      if (window.puter) { sdk = window.puter; return resolve(sdk); }
      const s = document.createElement('script');
      s.src = SCRIPT_SRC;
      s.onload = () => { sdk = window.puter; resolve(sdk); };
      s.onerror = () => reject(new Error('load-fail'));
      document.head.appendChild(s);
    });
  }

  async function ensureAuth() {
    if (!sdk) await loadSdk();
    if (sdk.auth && sdk.auth.isSignedIn && await sdk.auth.isSignedIn()) return true;
    await sdk.auth.signIn();
    return true;
  }

  // Pick fallback model round-robin (default diuar senarai ini).
  function nextFallback() {
    const m = FALLBACK_MODELS[idx % FALLBACK_MODELS.length];
    idx++;
    return m;
  }

  // Public API: run a chat with JomOrder brain.
  // Auto: cuba DEFAULT_MODEL dulu, kalau gagal fallback round-robin.
  window.__xAgent = {
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
          // Default gagal -> cuba fallback satu demi satu.
          let lastErr;
          for (let i = 0; i < FALLBACK_MODELS.length; i++) {
            const fb = nextFallback();
            usedModel = fb;
            try {
              resp = await tryModel(fb);
              break;
            } catch (e2) {
              lastErr = e2;
            }
          }
          if (resp === undefined) throw lastErr || new Error('all-models-failed');
        }
        return { ok: true, model: usedModel, text: resp || '' };
      } catch (e) {
        return { ok: false, error: String((e && e.message) || e) };
      }
    },
    defaultModel: DEFAULT_MODEL,
    fallbackModels: FALLBACK_MODELS
  };

  // Auto-init on idle (visitor not prompted; used for page enrichment only).
  document.addEventListener('DOMContentLoaded', () => {
    loadSdk().catch(() => {});
  });
})();
// End: Phase 69c - Hidden AI Agent + JomOrder Brain