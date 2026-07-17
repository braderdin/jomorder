// Start: JomOrder Portal Live Metrics Fetch
// Lightweight vanilla JS to fetch live merchant/order counts from Supabase
// using NEXT_PUBLIC_SUPABASE_ANON_KEY and NEXT_PUBLIC_SUPABASE_URL.

const SUPABASE_URL = "__SUPABASE_URL__";
const SUPABASE_ANON_KEY = "__SUPABASE_ANON_KEY__";

// Animated counter helper
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

// Fetch shop count from merchants table
async function fetchShopCount() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/merchants?select=count`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const count = Array.isArray(data) && data[0] && data[0].count ? data[0].count : 0;
    document.getElementById("metric-shops").textContent = count;
    animateCounter("counter-merchants", count);
    return count;
  } catch (err) {
    console.warn("Shop count fetch failed:", err);
    document.getElementById("metric-shops").textContent = "N/A";
    return 0;
  }
}

// Fetch order count from rekod_pesanan table
async function fetchOrderCount() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/rekod_pesanan?select=count`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const count = Array.isArray(data) && data[0] && data[0].count ? data[0].count : 0;
    document.getElementById("metric-orders").textContent = count;
    animateCounter("counter-orders", count);
    return count;
  } catch (err) {
    console.warn("Order count fetch failed:", err);
    document.getElementById("metric-orders").textContent = "N/A";
    return 0;
  }
}

// Fetch GMV sum from rekod_pesanan total_amount column
async function fetchGMV() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/rekod_pesanan?select=total_amount`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );
    if (!res.ok) throw new Error("HTTP " + res.status);
    const rows = await res.json();
    let total = 0;
    if (Array.isArray(rows)) {
      total = rows.reduce((sum, r) => sum + (parseFloat(r.total_amount) || 0), 0);
    }
    document.getElementById("metric-gmv").textContent =
      "RM " + total.toLocaleString("ms-MY", { maximumFractionDigits: 2 });
    return total;
  } catch (err) {
    console.warn("GMV fetch failed:", err);
    document.getElementById("metric-gmv").textContent = "RM N/A";
    return 0;
  }
}

// Analytics pixel status hooks
function initAnalyticsStatus() {
  const pixelId = document.getElementById("meta-pixel")?.dataset.pixelId;
  const gaId = new URLSearchParams(window.location.search).get("ga");
  document.getElementById("pixel-status").textContent =
    pixelId && pixelId !== "NEXT_PUBLIC_META_PIXEL_ID" ? "aktif" : "tidak dikonfigurasi";
  document.getElementById("ga-status").textContent =
    typeof gtag === "function" ? "aktif" : "tidak dikonfigurasi";
}

// Boot
async function init() {
  initAnalyticsStatus();
  await Promise.all([fetchShopCount(), fetchOrderCount(), fetchGMV()]);
  const now = new Date();
  document.getElementById("last-updated").textContent =
    "Kemas kini terakhir: " + now.toLocaleString("ms-MY");
}

document.addEventListener("DOMContentLoaded", init);
// End: JomOrder Portal Live Metrics Fetch