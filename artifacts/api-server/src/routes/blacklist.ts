import { Router } from "express";
import { db } from "@workspace/db";
import { blacklistedAddresses } from "@workspace/db/schema";
import { desc } from "drizzle-orm";

const router = Router();

const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const API_KEY = process.env.VITE_TRON_API_KEY;

function tronHeaders(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  if (API_KEY) h["TRON-PRO-API-KEY"] = API_KEY;
  return h;
}

async function fetchUsdtBalance(address: string): Promise<string> {
  try {
    const res = await fetch(
      `https://api.trongrid.io/v1/accounts/${encodeURIComponent(address)}`,
      { headers: tronHeaders() }
    );
    if (!res.ok) return "0";
    const data = await res.json();
    const acc = data.data?.[0];
    if (!acc?.trc20) return "0";
    const trc20Map: Record<string, string> = {};
    acc.trc20.forEach((entry: Record<string, string>) => Object.assign(trc20Map, entry));
    const raw = trc20Map[USDT_CONTRACT];
    return raw ? (parseFloat(raw) / 1e6).toFixed(2) : "0";
  } catch {
    return "0";
  }
}

async function syncBlacklist(): Promise<void> {
  try {
    console.log("[blacklist-sync] Starting TronGrid event fetch…");
    const url =
      `https://api.trongrid.io/v1/contracts/${USDT_CONTRACT}/events` +
      `?event_name=AddedBlackList&limit=200&only_confirmed=true&order_by=block_timestamp,desc`;

    const res = await fetch(url, { headers: tronHeaders() });
    if (!res.ok) {
      console.error(`[blacklist-sync] TronGrid error ${res.status}`);
      return;
    }
    const data = await res.json();
    const events: any[] = data.data ?? [];
    console.log(`[blacklist-sync] Fetched ${events.length} events`);

    // Collect new addresses (avoid duplicates within this batch)
    const seen = new Set<string>();
    const newAddresses: { address: string; freezeTime: number }[] = [];

    for (const event of events) {
      const address: string | undefined = event.result?._user;
      if (!address || seen.has(address)) continue;
      seen.add(address);
      newAddresses.push({ address, freezeTime: event.block_timestamp ?? Date.now() });
    }

    // Fetch balances in parallel (capped at 20 concurrent to respect rate limits)
    const CHUNK = 20;
    for (let i = 0; i < newAddresses.length; i += CHUNK) {
      const chunk = newAddresses.slice(i, i + CHUNK);
      await Promise.allSettled(
        chunk.map(async ({ address, freezeTime }) => {
          const freezeBalance = await fetchUsdtBalance(address);
          await db
            .insert(blacklistedAddresses)
            .values({ address, chain: "TRON", riskLevel: "HIGH", freezeBalance, freezeTime })
            .onConflictDoNothing();
        })
      );
    }

    console.log(`[blacklist-sync] Upserted up to ${newAddresses.length} addresses`);
  } catch (err) {
    console.error("[blacklist-sync] Unexpected error:", err);
  }
}

// Run on startup, then every 15 minutes — reduced from 5 min to ease TronGrid rate limits
syncBlacklist();
setInterval(syncBlacklist, 15 * 60 * 1000);

// GET /api/stats — aggregate stats for the dashboard
router.get("/stats", async (_req, res) => {
  try {
    const { count, max } = await import("drizzle-orm");
    const [totals] = await db
      .select({ total: count(), lastFreeze: max(blacklistedAddresses.freezeTime) })
      .from(blacklistedAddresses);
    res.json({ totalBlacklisted: totals?.total ?? 0, lastFreezeTime: totals?.lastFreeze ?? null });
  } catch (err) {
    console.error("[GET /stats] DB error:", err);
    res.status(500).json({ error: "Error al obtener estadísticas" });
  }
});

// GET /api/blacklist/check/:address — returns whether an address is in the DB
router.get("/blacklist/check/:address", async (req, res) => {
  try {
    const { address } = req.params;
    const { eq } = await import("drizzle-orm");
    const rows = await db
      .select({ address: blacklistedAddresses.address })
      .from(blacklistedAddresses)
      .where(eq(blacklistedAddresses.address, address))
      .limit(1);
    res.json({ found: rows.length > 0 });
  } catch (err) {
    console.error("[GET /blacklist/check] DB error:", err);
    res.status(500).json({ error: "Error al verificar la dirección" });
  }
});

// GET /api/blacklist — latest 100 frozen addresses
router.get("/blacklist", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(blacklistedAddresses)
      .orderBy(desc(blacklistedAddresses.freezeTime))
      .limit(100);
    res.json(rows);
  } catch (err) {
    console.error("[GET /blacklist] DB error:", err);
    res.status(500).json({ error: "Error al obtener la lista" });
  }
});

export default router;
