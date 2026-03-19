// @ts-nocheck
// Freemium plan routes
// Public:
//   GET  /api/freemium/status?ccId=...       — check plan + daily scan count
//   POST /api/freemium/record                — increment scan counter
//   POST /api/freemium/request-upgrade       — user requests upgrade ("Ya pagué")
// Admin (require key):
//   GET  /api/freemium/users?key=...         — all users list + stats
//   GET  /api/freemium/pending?key=...       — pending upgrade requests
//   POST /api/freemium/set-plan              — set plan for a user
//   POST /api/freemium/reset-scans           — reset today's scans for a user
//   POST /api/freemium/confirm-upgrade       — confirm payment → PRO

import { Router } from "express";
import {
  ensureFreemiumUser,
  getUserPlan,
  getScanCountToday,
  incrementScanCount,
  setUserPlan,
  resetScanCount,
  requestUpgrade,
  getAllUsersWithPlans,
  getPendingUpgrades,
  getFreemiumStats,
  FREE_SCAN_LIMIT,
} from "../lib/db";

const router  = Router();
const ADM_KEY = "CoinCashAdmin2026";

function adminGuard(req: any, res: any): boolean {
  const key = req.query.key ?? req.body?.key ?? "";
  if (key !== ADM_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

// ── GET /api/freemium/status ──────────────────────────────────────────────────
router.get("/freemium/status", async (req, res) => {
  const ccId = ((req.query.ccId as string) ?? "").trim();
  if (!ccId) return res.status(400).json({ error: "ccId required" });

  try {
    // Register user row on first visit (fire-and-forget, non-blocking)
    ensureFreemiumUser(ccId).catch(() => {});

    const [plan, scansToday] = await Promise.all([
      getUserPlan(ccId),
      getScanCountToday(ccId),
    ]);

    const isPro     = plan === "pro";
    const canScan   = isPro || scansToday < FREE_SCAN_LIMIT;
    const remaining = isPro ? null : Math.max(0, FREE_SCAN_LIMIT - scansToday);

    return res.json({ plan, scansToday, limit: FREE_SCAN_LIMIT, canScan, remaining });
  } catch (err: any) {
    console.error("[freemium] status error:", err?.message);
    return res.json({ plan: "free", scansToday: 0, limit: FREE_SCAN_LIMIT, canScan: true, remaining: FREE_SCAN_LIMIT });
  }
});

// ── POST /api/freemium/record ─────────────────────────────────────────────────
router.post("/freemium/record", async (req, res) => {
  const ccId = ((req.body?.ccId) ?? "").trim();
  if (!ccId) return res.status(400).json({ error: "ccId required" });

  try {
    const plan = await getUserPlan(ccId);

    if (plan === "pro") {
      return res.json({ ok: true, plan: "pro", scansToday: null, remaining: null });
    }

    const scansToday = await getScanCountToday(ccId);
    if (scansToday >= FREE_SCAN_LIMIT) {
      return res.status(429).json({ error: "limit_reached", limit: FREE_SCAN_LIMIT, scansToday });
    }

    const newCount  = await incrementScanCount(ccId);
    const remaining = Math.max(0, FREE_SCAN_LIMIT - newCount);

    return res.json({ ok: true, plan: "free", scansToday: newCount, remaining });
  } catch (err: any) {
    console.error("[freemium] record error:", err?.message);
    return res.json({ ok: true, plan: "free", scansToday: 0, remaining: FREE_SCAN_LIMIT });
  }
});

// ── POST /api/freemium/request-upgrade ───────────────────────────────────────
// User clicked "Ya pagué" — stores a pending upgrade request.
router.post("/freemium/request-upgrade", async (req, res) => {
  const ccId  = ((req.body?.ccId)  ?? "").trim();
  const email = ((req.body?.email) ?? "").trim();
  if (!ccId) return res.status(400).json({ error: "ccId required" });

  try {
    await requestUpgrade(ccId, email);
    return res.json({ ok: true, message: "Solicitud registrada. El admin verificará tu pago." });
  } catch (err: any) {
    console.error("[freemium] request-upgrade error:", err?.message);
    return res.status(500).json({ error: "Error al registrar solicitud" });
  }
});

// ── GET /api/freemium/users?key=... ──────────────────────────────────────────
router.get("/freemium/users", async (req, res) => {
  if (!adminGuard(req, res)) return;
  try {
    const [users, stats] = await Promise.all([
      getAllUsersWithPlans(),
      getFreemiumStats(),
    ]);
    return res.json({ users, stats });
  } catch (err: any) {
    console.error("[freemium] users error:", err?.message);
    return res.status(500).json({ error: "Error al obtener usuarios" });
  }
});

// ── GET /api/freemium/pending?key=... ────────────────────────────────────────
router.get("/freemium/pending", async (req, res) => {
  if (!adminGuard(req, res)) return;
  try {
    const pending = await getPendingUpgrades();
    return res.json({ pending });
  } catch (err: any) {
    console.error("[freemium] pending error:", err?.message);
    return res.status(500).json({ error: "Error al obtener pendientes" });
  }
});

// ── POST /api/freemium/set-plan ───────────────────────────────────────────────
router.post("/freemium/set-plan", async (req, res) => {
  if (!adminGuard(req, res)) return;
  const ccId = ((req.body?.ccId) ?? "").trim();
  const plan = ((req.body?.plan) ?? "").trim() as "free" | "pro";
  if (!ccId || !["free", "pro"].includes(plan)) {
    return res.status(400).json({ error: "ccId and plan (free|pro) required" });
  }
  try {
    await setUserPlan(ccId, plan);
    return res.json({ ok: true, ccId, plan });
  } catch (err: any) {
    console.error("[freemium] set-plan error:", err?.message);
    return res.status(500).json({ error: "Error al cambiar plan" });
  }
});

// ── POST /api/freemium/reset-scans ────────────────────────────────────────────
router.post("/freemium/reset-scans", async (req, res) => {
  if (!adminGuard(req, res)) return;
  const ccId = ((req.body?.ccId) ?? "").trim();
  if (!ccId) return res.status(400).json({ error: "ccId required" });
  try {
    await resetScanCount(ccId);
    return res.json({ ok: true, ccId });
  } catch (err: any) {
    console.error("[freemium] reset-scans error:", err?.message);
    return res.status(500).json({ error: "Error al resetear scans" });
  }
});

// ── POST /api/freemium/confirm-upgrade ────────────────────────────────────────
router.post("/freemium/confirm-upgrade", async (req, res) => {
  if (!adminGuard(req, res)) return;
  const ccId = ((req.body?.ccId) ?? "").trim();
  if (!ccId) return res.status(400).json({ error: "ccId required" });
  try {
    await setUserPlan(ccId, "pro"); // also clears upgrade_requested_at
    return res.json({ ok: true, ccId, plan: "pro" });
  } catch (err: any) {
    console.error("[freemium] confirm-upgrade error:", err?.message);
    return res.status(500).json({ error: "Error al confirmar upgrade" });
  }
});

export default router;
