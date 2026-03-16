// @ts-nocheck
// CoinCash user ID routes
// POST /api/users/lookup  — get or create a CoinCash ID for a wallet address
// GET  /api/users/:ccId   — fetch user record by CoinCash ID

import { Router } from "express";
import { getOrCreateUser, getUserByCoinCashId } from "../lib/db";

const router = Router();

/**
 * POST /api/users/lookup
 * Body: { walletAddress: string }
 * Returns the CoinCash ID for the given wallet, creating one if needed.
 */
router.post("/users/lookup", async (req, res) => {
  const { walletAddress } = req.body ?? {};
  if (!walletAddress || typeof walletAddress !== "string" || walletAddress.trim().length < 10) {
    return res.status(400).json({ error: "walletAddress is required" });
  }
  try {
    const user = await getOrCreateUser(walletAddress.trim());
    return res.json({
      coincashId:    user.coincash_id,
      walletAddress: user.wallet_address,
      createdAt:     user.created_at,
    });
  } catch (err: any) {
    console.error("[users] lookup error:", err?.message);
    return res.status(500).json({ error: "Failed to resolve CoinCash ID" });
  }
});

/**
 * GET /api/users/:ccId
 * Returns the user record for a given CoinCash ID (CC-XXXXXX).
 */
router.get("/users/:ccId", async (req, res) => {
  const { ccId } = req.params;
  if (!/^CC-\d{6}$/.test(ccId)) {
    return res.status(400).json({ error: "Invalid CoinCash ID format" });
  }
  try {
    const user = await getUserByCoinCashId(ccId);
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json({
      coincashId:    user.coincash_id,
      walletAddress: user.wallet_address,
      createdAt:     user.created_at,
    });
  } catch (err: any) {
    console.error("[users] fetch error:", err?.message);
    return res.status(500).json({ error: "Failed to fetch user" });
  }
});

export default router;
