import { Router } from "express";

const router = Router();

// ── In-memory visit store ─────────────────────────────────────────────────────
let totalVisits = 0;
const countryCounts: Record<string, { name: string; count: number }> = {};

// ── GET /api/visit-stats ──────────────────────────────────────────────────────
router.get("/visit-stats", (_req, res) => {
  res.json({ totalVisits, countryCounts });
});

// ── POST /api/visit ────────────────────────────────────────────────────────────
router.post("/visit", async (req, res) => {
  totalVisits++;

  const ip =
    ((req.headers["x-forwarded-for"] as string) || "").split(",")[0].trim() ||
    req.socket.remoteAddress ||
    "unknown";

  let countryCode = "XX";
  let countryName = "Unknown";

  const isPrivate =
    ip === "unknown" ||
    ip.startsWith("127.") ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip === "::1" ||
    ip === "::ffff:127.0.0.1";

  if (!isPrivate) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const geoRes = await fetch(
        `http://ip-api.com/json/${ip}?fields=status,country,countryCode`,
        { signal: controller.signal }
      );
      clearTimeout(timer);
      const geo = await geoRes.json() as any;
      if (geo.status === "success") {
        countryCode = geo.countryCode;
        countryName = geo.country;
      }
    } catch {
      // Non-fatal — keep defaults
    }
  } else {
    // Local dev: cycle through demo countries
    const demos = [
      { code: "CO", name: "Colombia" },
      { code: "US", name: "United States" },
      { code: "MX", name: "Mexico" },
      { code: "AR", name: "Argentina" },
      { code: "VE", name: "Venezuela" },
    ];
    const d = demos[totalVisits % demos.length];
    countryCode = d.code;
    countryName = d.name;
  }

  if (!countryCounts[countryCode]) {
    countryCounts[countryCode] = { name: countryName, count: 0 };
  }
  countryCounts[countryCode].count++;

  res.json({ totalVisits, country: countryCode, countryName, countryCounts });
});

export default router;
