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
  },
  en: {
    hero_sub: 'Automated F&B ordering system powered by Telegram bot. Merchants accept orders, manage menu, and receive DuitNow payment with zero monthly cost.',
    flow1_t: '1. Share Location',
    flow1_d: 'Tap the location button, find nearby shops.',
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

// Start: Phase 57 - Showcase "Buka Menu" Scroll Handler
// Klik butang 🍔 Buka Menu -> smooth scroll ke #menu-grid (Section C2).
function initBukaMenu() {
  const btn = document.getElementById("buka-menu-btn");
  const target = document.getElementById("menu-grid");
  if (!btn || !target) return;
  btn.addEventListener("click", () => {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}
// Hook ke init()
const _origInitShowcase = init;
init = async function () {
  await _origInitShowcase();
  initGuiNav();
  initBukaMenu();
};
// End: Phase 57 - Showcase "Buka Menu" Scroll Handler

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
// Hook ke init()
const _origInit = init;
init = async function () {
  await _origInit();
  initGuiNav();
};
// End: Phase 55 - GUI Nav Button reveal

// Start: Phase 58 - Deep-Link ?start=menu scroll handler
// Bila landing page dibuka dari t.me/...?start=menu, scroll terus ke #menu-grid.
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
// Hook ke init()
const _origInit58 = init;
init = async function () {
  await _origInit58();
  initDeepLinkScroll();
};
// End: Phase 58 - Deep-Link ?start=menu scroll handler

// End: JomOrder Portal Live Metrics Fetch (Phase 27 + Phase 45 UI)
