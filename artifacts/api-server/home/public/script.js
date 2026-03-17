/* ── CoinCash Homepage — script.js ────────────────────────────────────────── */

const POLL_INTERVAL = 10_000; // refresh stats every 10 s
const FEED_MAX      = 20;     // max items in the live feed

let feedItems = [];

/* ── Animated counter ─────────────────────────────────────────────────────── */
function animateCounter(el, from, to, duration = 800) {
  if (from === to) { el.textContent = to.toLocaleString(); return; }
  const start = performance.now();
  const range = to - from;
  function step(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    el.textContent = Math.round(from + range * eased).toLocaleString();
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ── Flag URL helper ──────────────────────────────────────────────────────── */
function flagUrl(code) {
  return `https://flagcdn.com/w40/${code.toLowerCase()}.png`;
}

/* ── Render countries grid ────────────────────────────────────────────────── */
function renderCountries(countryCounts) {
  const grid = document.getElementById("countries-grid");
  const entries = Object.entries(countryCounts)
    .sort((a, b) => b[1].count - a[1].count);

  if (entries.length === 0) {
    grid.innerHTML = '<div class="countries-empty">Aún no hay datos de países.</div>';
    return;
  }

  grid.innerHTML = entries.map(([code, { name, count }]) => `
    <div class="country-item" data-tooltip="${name} — ${count} visit${count === 1 ? "a" : "as"}">
      <img
        class="country-flag"
        src="${flagUrl(code)}"
        alt="${name}"
        onerror="this.style.display='none'"
        loading="lazy"
      />
      <span class="country-code">${code}</span>
      <span class="country-count">${count.toLocaleString()}</span>
    </div>
  `).join("");
}

/* ── Render realtime feed ─────────────────────────────────────────────────── */
function renderFeed() {
  const feed = document.getElementById("realtime-feed");
  if (feedItems.length === 0) {
    feed.innerHTML = '<div class="countries-empty">Esperando visitantes...</div>';
    return;
  }
  feed.innerHTML = feedItems.map(item => `
    <div class="feed-item">
      <span class="feed-dot"></span>
      <img class="feed-flag" src="${flagUrl(item.country)}" alt="${item.countryName}"
           onerror="this.style.display='none'" loading="lazy" />
      <span class="feed-text">
        Visita desde <strong>${item.countryName}</strong>
      </span>
      <span class="feed-time">${item.time}</span>
    </div>
  `).join("");
}

/* ── Add a new event to the feed ─────────────────────────────────────────── */
function addFeedEvent(country, countryName) {
  const now = new Date();
  const time = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  feedItems.unshift({ country, countryName, time });
  if (feedItems.length > FEED_MAX) feedItems.pop();
  renderFeed();
}

/* ── Record this visit & fetch initial stats ──────────────────────────────── */
let lastTotal = 0;

async function recordVisit() {
  try {
    const res  = await fetch("/api/visit", { method: "POST" });
    const data = await res.json();

    const counterEl = document.getElementById("counter");
    animateCounter(counterEl, lastTotal, data.totalVisits);
    lastTotal = data.totalVisits;

    document.getElementById("counter-sub").textContent =
      `Desde ${Object.keys(data.countryCounts).length} país${Object.keys(data.countryCounts).length === 1 ? "" : "es"} del mundo`;

    renderCountries(data.countryCounts);
    addFeedEvent(data.country, data.countryName);
  } catch (err) {
    console.error("recordVisit error:", err);
  }
}

/* ── Poll stats periodically ─────────────────────────────────────────────── */
async function pollStats() {
  try {
    const res  = await fetch("/api/visit-stats");
    const data = await res.json();

    const counterEl = document.getElementById("counter");
    animateCounter(counterEl, lastTotal, data.totalVisits);
    lastTotal = data.totalVisits;

    if (Object.keys(data.countryCounts).length > 0) {
      document.getElementById("counter-sub").textContent =
        `Desde ${Object.keys(data.countryCounts).length} país${Object.keys(data.countryCounts).length === 1 ? "" : "es"} del mundo`;
      renderCountries(data.countryCounts);
    }
  } catch {
    // Non-fatal: keep showing last known data
  }
}

/* ── Boot ─────────────────────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  recordVisit();
  setInterval(pollStats, POLL_INTERVAL);
});
