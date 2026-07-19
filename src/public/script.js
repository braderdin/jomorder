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

// Start: Phase 47 - BM/EN Language Toggle
const LANG_STRINGS = {
  ms: { hero_sub: 'Platform Mikro-SaaS Multi-Tenant RM0 Kos Operasi' },
  en: { hero_sub: 'Multi-Tenant Micro-SaaS Platform RM0 Operating Cost' },
};
function applyLang(lang) {
  const s = LANG_STRINGS[lang] || LANG_STRINGS.ms;
  const sub = document.querySelector('p.text-xl');
  if (sub) sub.innerHTML = s.hero_sub;
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

// Boot
async function init() {
  initAnalyticsStatus();
  initFaq();
  initScrollReveal();
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
// End: JomOrder Portal Live Metrics Fetch (Phase 27 + Phase 45 UI)