const express = require("express");
const path = require("path");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 8081;

// ── In-memory visit store ─────────────────────────────────────────────────────
let totalVisits = 0;
const countryCounts = {}; // { "US": 42, "CO": 17, ... }

// ── Static files ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));

// ── GET /api/stats — return current visit data ───────────────────────────────
app.get("/api/stats", (_req, res) => {
  res.json({ totalVisits, countryCounts });
});

// ── POST /api/visit — record a visit, detect country via ip-api.com ──────────
app.post("/api/visit", async (req, res) => {
  totalVisits++;

  // Resolve visitor IP (works behind proxies)
  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket.remoteAddress ||
    "unknown";

  let countryCode = "XX";
  let countryName = "Unknown";

  // Skip geo-lookup for loopback / private addresses
  const isPrivate =
    ip === "unknown" ||
    ip.startsWith("127.") ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip === "::1" ||
    ip === "::ffff:127.0.0.1";

  if (!isPrivate) {
    try {
      const geoRes = await fetch(
        `http://ip-api.com/json/${ip}?fields=status,country,countryCode`,
        { timeout: 3000 }
      );
      const geo = await geoRes.json();
      if (geo.status === "success") {
        countryCode = geo.countryCode;
        countryName = geo.country;
      }
    } catch {
      // Non-fatal — keep defaults
    }
  } else {
    // In local dev, simulate a country so the UI has something to show
    const demo = ["CO", "US", "MX", "AR", "VE"][totalVisits % 5];
    countryCode = demo;
    countryName = { CO: "Colombia", US: "United States", MX: "Mexico", AR: "Argentina", VE: "Venezuela" }[demo];
  }

  // Accumulate counts
  if (!countryCounts[countryCode]) {
    countryCounts[countryCode] = { name: countryName, count: 0 };
  }
  countryCounts[countryCode].count++;

  res.json({
    totalVisits,
    country: countryCode,
    countryName,
    countryCounts,
  });
});

// ── Fallback → index.html ─────────────────────────────────────────────────────
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`CoinCash Home running on port ${PORT}`);
});
