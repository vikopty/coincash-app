import { Router } from "express";
import { createHash } from "node:crypto";
import { db } from "@workspace/db";
import { blacklistedAddresses } from "@workspace/db/schema";
import { desc } from "drizzle-orm";

const router = Router();

// ── Address conversion: Ethereum 0x hex → TRON T... Base58 ────────────────────
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function sha256(buf: Buffer): Buffer {
  return createHash("sha256").update(buf).digest();
}

function base58Encode(buf: Buffer): string {
  let n = BigInt("0x" + buf.toString("hex"));
  let out = "";
  while (n > 0n) {
    out = BASE58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of buf) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out;
}

/** Converts a TronGrid Ethereum-format address (0x... 40 hex chars) to TRON base58 (T...) */
function ethHexToTron(hex: string): string {
  const clean = hex.replace(/^0x/, "");
  if (clean.length !== 40) return hex; // already converted or invalid — return as-is
  const prefixed = Buffer.from("41" + clean, "hex"); // 21 bytes: 0x41 + 20-byte address
  const checksum = sha256(sha256(prefixed)).subarray(0, 4);
  return base58Encode(Buffer.concat([prefixed, checksum])); // 25 bytes → ~34 chars
}

// ── Balance formatter ─────────────────────────────────────────────────────────
function fmtBalance(raw: string): string {
  const n = parseFloat(raw);
  if (!n || n === 0) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " USDT";
}

// ── Date formatter ────────────────────────────────────────────────────────────
function fmtDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

// ── Route: GET /api/bitrace-trc20-frozen ──────────────────────────────────────
/**
 * Returns the latest TRC20 USDT blacklisted (frozen) wallets, sourced from the
 * on-chain AddedBlackList events that syncBlacklist() already maintains in the DB.
 * Addresses are returned in TRON T... base58 format.
 */
router.get("/bitrace-trc20-frozen", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(blacklistedAddresses)
      .orderBy(desc(blacklistedAddresses.freezeTime))
      .limit(100);

    const wallets = rows.map(row => ({
      address:        ethHexToTron(row.address),
      chain:          "TRC20",
      freeze_balance: fmtBalance(row.freezeBalance),
      freeze_time:    fmtDate(row.freezeTime),
    }));

    res.json({ wallets, cached: false, cacheAge: 0 });
  } catch (err: any) {
    console.error("[bitrace-proxy] DB error:", err?.message);
    res.status(500).json({ error: "No se pudo obtener la lista de wallets congeladas." });
  }
});

export default router;
