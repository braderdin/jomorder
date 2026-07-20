// Start: Phase 69 - Hidden AI Agent (client-side, user-funded)
// Agent penyeri utama untuk pelawat. Pengguna login Google sendiri,
// guna model list sendiri, BAYAR SENDIRI. Projek TAK bazir quota HELPER.
// RAHSIA: tiada label pembekal di DOM. Script di-load dynamic tanpa teks.
(function () {
  const SCRIPT_SRC = 'https://js.puter.com/v2/';
  const MODELS = [
    'prism-ml/ternary-bonsai-27b',
    'poolside/laguna-xs-2.1:free',
    'poolside/laguna-m.1:free',
    'cohere/north-mini-code:free',
    'meta-llama/llama-3.2-3b-instruct:free',
    'google/gemma-3n-e2b-it:free',
    'google/gemma-4-31b-it:free',
    'google/gemma-4-26b-a4b-it:free',
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
  let idx = 0;
  let ready = false;
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

  // Pick next model round-robin
  function nextModel() {
    const m = MODELS[idx % MODELS.length];
    idx++;
    return m;
  }

  // Public: run a one-shot smart task (no chat UI exposed to visitor)
  window.__xAgent = {
    async run(prompt, opts) {
      try {
        await ensureAuth();
        const model = (opts && opts.model) || nextModel();
        const resp = await sdk.ai.chat(prompt, { model: model });
        return { ok: true, model: model, text: resp || '' };
      } catch (e) {
        return { ok: false, error: String(e && e.message || e) };
      }
    },
    models: MODELS
  };

  // Auto-init on idle (visitor not prompted; used for page enrichment only)
  document.addEventListener('DOMContentLoaded', () => {
    loadSdk().then(() => { ready = true; }).catch(() => {});
  });
})();
// End: Phase 69 - Hidden AI Agent