// Start: JomOrder Portal Live Metrics Fetch (Phase 27 - Public Stats Hydration)
// Rewrite: buang hardcoded env vars. Panggil relative endpoint /api/public-stats
// (di-proxy Vercel ke Cloudflare Worker) untuk elak CORS + pendedahan key awam.

// Animated numerical counter helper (ganti N/A grid)
function animateCounter(elementId, targetValue, prefix = "", suffix = "") {
  const el = document.getElementById(elementId);
  if (!el) return;
  let current = 0;
  const increment = Math.max(1, Math.floor(targetValue / 60));
  const timer = setInterval(() => {
    current += increment;
    if (current >= targetValue) {
      current = targetValue;
      clearInterval(timer);
    }
    el.textContent = prefix + current.toLocaleString("ms-MY") + suffix;
  }, 25);
}

// Fallback statik jika fetch gagal (elak N/A kekal)
function setFallback() {
  const shopEl = document.getElementById("counter-merchants");
  const orderEl = document.getElementById("counter-orders");
  const gmvEl = document.getElementById("metric-gmv");
  if (shopEl && shopEl.textContent === "N/A") shopEl.textContent = "0";
  if (orderEl && orderEl.textContent === "N/A") orderEl.textContent = "0";
  if (gmvEl && gmvEl.textContent === "RM N/A") gmvEl.textContent = "RM 0.00";
}

// Fetch public stats dari relative endpoint (/api/public-stats)
async function fetchPublicStats() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch("/api/public-stats", { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const shops = Number(data.total_shops ?? 0);
    const orders = Number(data.total_orders ?? 0);
    const gmv = Number(data.total_gmv_rm ?? 0);

    const shopEl = document.getElementById("metric-shops");
    const orderEl = document.getElementById("metric-orders");
    const gmvEl = document.getElementById("metric-gmv");
    if (shopEl) shopEl.textContent = shops.toLocaleString("ms-MY");
    if (orderEl) orderEl.textContent = orders.toLocaleString("ms-MY");
    if (gmvEl) gmvEl.textContent = "RM " + gmv.toLocaleString("ms-MY", { maximumFractionDigits: 2 });

    animateCounter("counter-merchants", shops);
    animateCounter("counter-orders", orders);
    return { shops, orders, gmv };
  } catch (err) {
    console.warn("Public stats fetch failed:", err);
    setFallback();
    return { shops: 0, orders: 0, gmv: 0 };
  }
}

// Analytics pixel status hooks
function initAnalyticsStatus() {
  const pixelId = document.getElementById("meta-pixel")?.dataset.pixelId;
  const gaId = new URLSearchParams(window.location.search).get("ga");
  const pixelEl = document.getElementById("pixel-status");
  const gaEl = document.getElementById("ga-status");
  if (pixelEl) pixelEl.textContent = pixelId && pixelId !== "NEXT_PUBLIC_META_PIXEL_ID" ? "aktif" : "tidak dikonfigurasi";
  if (gaEl) gaEl.textContent = typeof gtag === "function" ? "aktif" : "tidak dikonfigurasi";
}

// FAQ accordion toggle (Phase 45 UI enhancement)
function initFaq() {
  const toggles = document.querySelectorAll(".faq-toggle");
  toggles.forEach((btn) => {
    btn.addEventListener("click", () => {
      const body = btn.parentElement?.querySelector(".faq-body");
      const icon = btn.querySelector(".icon");
      if (!body) return;
      const isHidden = body.classList.contains("hidden");
      if (isHidden) {
        body.classList.remove("hidden");
        if (icon) icon.textContent = "-";
      } else {
        body.classList.add("hidden");
        if (icon) icon.textContent = "+";
      }
    });
  });
}

// Scroll-reveal IntersectionObserver (Phase 45 UI enhancement)
function initScrollReveal() {
  const items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("revealed"));
    return;
  }
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("revealed");
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  items.forEach((el) => obs.observe(el));
}

// Start: Phase 47 - BM/EN Language Toggle (Phase 59: data-i18n driven)
const LANG_STRINGS = {
  ms: {
    hero_sub: 'Sistem pesanan F&B automatik berkuasa bot Telegram. Peniaga boleh terima pesanan, urus menu, dan terima bayaran DuitNow tanpa kos langganan bulanan.',
    flow1_t: '1. Kongsi Lokasi',
    flow1_d: 'Tekan butang lokasi, jumpa kedai berdekatan.',
    flow2_t: '2. Pilih Menu',
    flow2_d: 'Layari menu & tambah ke troli.',
    flow3_t: '3. Bayar',
    flow3_d: 'Guna DuitNow QR, sah dalam saat.',
    flow4_t: '4. Sedia!',
    flow4_d: 'Peniaga terima & sediakan pesanan.',
    'lbl.founderShop': 'JomOrder HQ (Demo)',
    'lbl.founderTagline': 'Kedai demo rasmi untuk pendaftar MDEC GLOW &mdash; lihat sendiri betapa mudahnya ambil order makanan.',
    'lbl.guiNav': 'Navigasi GUI Tanpa Command',
    'lbl.guiNavSub': 'Semua menu boleh diakses terus dari butang. Tiada perlu taip /command.',
  },
  en: {
    hero_sub: 'Automated F&B ordering system powered by Telegram bot. Merchants accept orders, manage menu, and receive DuitNow payment with zero monthly cost.',
    flow1_t: '1. Share Location',
    flow1_d: 'Tap the location button, find nearby shops.',
    flow2_t: '2. Pick Menu',
    flow2_d: 'Browse menu & add to cart.',
    flow3_t: '3. Pay',
    flow3_d: 'Use DuitNow QR, confirmed instantly.',
    flow4_t: '4. Ready!',
    flow4_d: 'Merchant receives & prepares order.',
    'lbl.founderShop': 'JomOrder HQ (Demo)',
    'lbl.founderTagline': 'Official demo shop for MDEC GLOW registrants &mdash; see how easy taking food orders is.',
    'lbl.guiNav': 'GUI Navigation Without Command',
    'lbl.guiNavSub': 'All menus accessible directly from buttons. No need to type /command.',
  },
};
function applyLang(lang) {
  const s = LANG_STRINGS[lang] || LANG_STRINGS.ms;
  // Phase 59: toggle semua elemen data-i18n
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (s[key]) el.textContent = s[key];
  });
  const toggle = document.getElementById('lang-toggle');
  if (toggle) toggle.textContent = lang === 'en' ? '🌐 EN / BM' : '🌐 BM / EN';
  document.documentElement.lang = lang;
  try { localStorage.setItem('jo_lang', lang); } catch (e) {}
}
const langBtn = document.getElementById('lang-toggle');
if (langBtn) {
  langBtn.addEventListener('click', () => {
    const cur = document.documentElement.lang === 'en' ? 'en' : 'ms';
    applyLang(cur === 'en' ? 'ms' : 'en');
  });
}
try {
  const saved = localStorage.getItem('jo_lang');
  if (saved) applyLang(saved);
} catch (e) {}
// End: Phase 47 - BM/EN Language Toggle

// Start: Phase 51 - Live Menu Photo Grid Fetcher
// Tarik menu terkini dari endpoint worker (/api/menu-showcase) dan papar
// grid gambar + harga. Fail-open: jika tiada gambar, papar placeholder teks.
async function fetchMenuGrid() {
  const grid = document.getElementById("menu-grid");
  if (!grid) return;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch("/api/menu-showcase", { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    if (items.length === 0) {
      grid.innerHTML = '<div class="col-span-full text-gray-500 text-sm">Tiada menu dipaparkan lagi.</div>';
      return;
    }
    grid.innerHTML = items.map((it) => {
      const img = it.gambar_url
        ? `<img src="${it.gambar_url}" alt="" class="w-full h-32 object-cover rounded-xl" loading="lazy" />`
        : `<div class="w-full h-32 rounded-xl bg-cyber-bg border border-gray-700 flex items-center justify-center text-2xl">🍽️</div>`;
      return `<div class="rounded-xl overflow-hidden border border-gray-700 bg-cyber-bg text-left">
        ${img}
        <div class="p-2">
          <div class="text-xs text-gray-200 truncate">${it.nama_hidangan || "Hidangan"}</div>
          <div class="text-xs text-cyber-gold font-bold">RM ${Number(it.harga || 0).toFixed(2)}</div>
        </div>
      </div>`;
    }).join("");
  } catch {
    grid.innerHTML = '<div class="col-span-full text-gray-500 text-sm">Menu tidak dapat dimuatkan.</div>';
  }
}
// End: Phase 51 - Live Menu Photo Grid Fetcher

// Start: Phase 60 - Founder Demo Shop Fetcher (MDEC GLOW wow section)
async function fetchFounderShop() {
  const grid = document.getElementById("founder-menu");
  if (!grid) return;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch("/api/founder-showcase", { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const shop = data.shop || null;
    const items = Array.isArray(data.menu) ? data.menu : [];
    let html = "";
    if (shop) {
      const approved = shop.status_kedai === "DILULUSKAN";
      html += `<div class="col-span-full mb-2 text-center"><span class="px-3 py-1 rounded-full bg-cyber-gold/10 text-cyber-gold text-xs font-mono">${escapeHtml(shop.nama_kedai)}${approved ? " ✔️" : ""}</span></div>`;
    }
    if (items.length === 0) {
      html += `<div class="col-span-full text-gray-500 text-sm">Menu demo sedang dimuatkan...</div>`;
    } else {
      items.forEach((m) => {
        const harga = Number(m.harga || 0).toFixed(2);
        html += `<div class="menu-card rounded-2xl border border-cyber-gold/30 bg-cyber-bg overflow-hidden">
          <div class="h-28 bg-gradient-to-br from-cyber-accent/30 to-cyber-neon/10 flex items-center justify-center text-4xl">🍽️</div>
          <div class="p-3">
            <div class="text-sm font-semibold text-gray-100 truncate">${escapeHtml(m.nama_hidangan)}</div>
            <div class="text-cyber-gold text-sm font-bold mt-1">RM ${harga}</div>
          </div>
        </div>`;
      });
    }
    grid.innerHTML = html;
  } catch {
    grid.innerHTML = `<div class="col-span-full text-gray-500 text-sm">Demo kedai tidak tersedia buat sementara.</div>`;
  }
}
function escapeHtml(str) {
  const amp = String.fromCharCode(38) + "amp;";
  const lt = String.fromCharCode(60) + "lt;";
  const gt = String.fromCharCode(62) + "gt;";
  const quot = String.fromCharCode(34) + "quot;";
  return String(str == null ? "" : str)
    .replace(/&/g, amp)
    .replace(/</g, lt)
    .replace(/>/g, gt)
    .replace(/"/g, quot)
    .replace(/'/g, "&#39;");
}
// End: Phase 60 - Founder Demo Shop Fetcher

// Start: Phase 52 - Live Order Tracker Simulation (UI Demo)
// Simulasikan aliran pesanan 4 langkah: terima -> sediakan -> serah -> selesai.
function initOrderSim() {
  const btn = document.getElementById("order-sim-btn");
  const steps = Array.from(document.querySelectorAll(".order-step"));
  const custStatus = document.getElementById("order-status-cust");
  if (!btn || steps.length === 0) return;
  let running = false;
  btn.addEventListener("click", async () => {
    if (running) return;
    running = true;
    steps.forEach((s) => { s.classList.remove("active", "done"); });
    if (custStatus) custStatus.textContent = "Status: ⏳ Menunggu Pengesahan";
    const labels = ["Menerima Pesanan", "Menyediakan", "Siap & Serah", "Selesai"];
    for (let i = 0; i < steps.length; i++) {
      steps[i].classList.add("active");
      if (custStatus) {
        const map = ["🔔 Pesanan Dihantar", "👨‍🍳 Sedang Disediakan", "📦 Sedia Diserah", "✅ Selesai - Selamat Menikmati!"];
        custStatus.textContent = "Status: " + map[i];
      }
      await new Promise((r) => setTimeout(r, 900));
      steps[i].classList.remove("active");
      steps[i].classList.add("done");
    }
    running = false;
    btn.textContent = "▶ Simulasi Sekali Lagi";
  });
}
// End: Phase 52 - Live Order Tracker Simulation

// Boot
async function init() {
  initAnalyticsStatus();
  initFaq();
  initScrollReveal();
  initOrderSim();
  await fetchPublicStats();
  await fetchMenuGrid();
  // Start: Phase 46 - Hero Counter Fallback (pastikan beranimasi walaupun API lambat)
  // Jika elemen masih '0' selepas fetch (API gagal), picu animasi ke nilai placeholder
  // kecil supaya UI nampak hidup (bukan statik kosong).
  const hShop = document.getElementById("counter-merchants");
  const hOrder = document.getElementById("counter-orders");
  if (hShop && hShop.textContent === "0") animateCounter("counter-merchants", 12);
  if (hOrder && hOrder.textContent === "0") animateCounter("counter-orders", 48);
  // End: Phase 46 - Hero Counter Fallback
  const now = new Date();
  const lu = document.getElementById("last-updated");
  if (lu) lu.textContent = "Kemas kini terakhir: " + now.toLocaleString("ms-MY");
}

document.addEventListener("DOMContentLoaded", init);

// Start: Phase 55 - GUI Nav Button reveal (Modern-Siber glow entry)
function initGuiNav() {
  const nav = document.querySelector('.gui-nav');
  if (!nav) return;
  const btns = nav.querySelectorAll('.gui-btn');
  btns.forEach((b, i) => {
    b.style.opacity = '0';
    b.style.transform = 'translateY(16px)';
    setTimeout(() => {
      b.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
      b.style.opacity = '1';
      b.style.transform = 'translateY(0)';
    }, 80 * i);
  });
}
// End: Phase 55 - GUI Nav Button reveal

// Start: Phase 57 - Showcase "Buka Menu" Scroll Handler
function initBukaMenu() {
  const btn = document.getElementById("buka-menu-btn");
  const target = document.getElementById("menu-grid");
  if (!btn || !target) return;
  btn.addEventListener("click", () => {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}
// End: Phase 57 - Showcase "Buka Menu" Scroll Handler

// Start: Phase 58 - Deep-Link ?start=menu scroll handler
function initDeepLinkScroll() {
  try {
    const params = new URLSearchParams(window.location.search);
    const start = params.get('start');
    if (start === 'menu') {
      const grid = document.getElementById('menu-grid');
      if (grid) {
        setTimeout(() => grid.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
      }
    }
  } catch { /* ignore deep-link parse error */ }
}
// End: Phase 58 - Deep-Link ?start=menu scroll handler

// Start: Phase 60 - Founder Demo Shop loader hook
async function loadFounderShop() {
  await fetchFounderShop();
}
// End: Phase 60 - Founder Demo Shop loader hook

// Start: Phase 61 - Consolidated Init (fix multiple reassignment bug)
// Semua hook digabung ke SATU init supaya tiada fungsi tertinggal.
async function initAll() {
  initAnalyticsStatus();
  initFaq();
  initScrollReveal();
  initOrderSim();
  initGuiNav();
  initBukaMenu();
  initDeepLinkScroll();
  await fetchPublicStats();
  await fetchMenuGrid();
  await loadFounderShop();
  const hShop = document.getElementById("counter-merchants");
  const hOrder = document.getElementById("counter-orders");
  if (hShop && hShop.textContent === "0") animateCounter("counter-merchants", 12);
  if (hOrder && hOrder.textContent === "0") animateCounter("counter-orders", 48);
  const now = new Date();
  const lu = document.getElementById("last-updated");
  if (lu) lu.textContent = "Kemas kini terakhir: " + now.toLocaleString("ms-MY");
}
document.removeEventListener("DOMContentLoaded", init);
document.addEventListener("DOMContentLoaded", initAll);
// End: Phase 61 - Consolidated Init
// End: JomOrder Portal Live Metrics Fetch (Phase 27 + Phase 45 UI)
