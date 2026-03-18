import { Router } from "express";
import { createHash } from "node:crypto";

const router = Router();

// ── Config ────────────────────────────────────────────────────────────────────
const TRON_API_KEY    = process.env.VITE_TRON_API_KEY ?? "";
const USDT_PRIMARY    = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const USDT_SECONDARY  = "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj";
const FETCH_LIMIT     = 200; // events per TronGrid page
const BALANCE_BATCH   = 10;  // concurrent balance requests
const BALANCE_GAP_MS  = 80;  // ms between balance batches
const CACHE_TTL_MS    = 10 * 60_000; // 10 minute cache — prevents TronGrid 429 floods

// ── Types ─────────────────────────────────────────────────────────────────────
export interface FrozenWallet {
  address:        string;
  chain:          string;
  freeze_balance: string;
  freeze_balance_raw: number;
  freeze_time:    string;
  risk_level:     "HIGH" | "MODERATE" | "LOW";
  tx_id:          string;
}

// ── In-memory cache ───────────────────────────────────────────────────────────
let cacheData:        FrozenWallet[] | null = null;
let cacheFetchedAt:   number                = 0;
let cacheTotal:       number                = 0;
let refreshing                              = false;
let backoffUntil:     number                = 0; // epoch ms — skip refresh if TronGrid is angry

// ── Address conversion: Ethereum 0x hex → TRON T... Base58 ───────────────────
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function sha256(buf: Buffer): Buffer {
  return createHash("sha256").update(buf).digest();
}

function base58Encode(buf: Buffer): string {
  let n = BigInt("0x" + buf.toString("hex"));
  let out = "";
  while (n > 0n) { out = BASE58[Number(n % 58n)] + out; n /= 58n; }
  for (const b of buf) { if (b !== 0) break; out = "1" + out; }
  return out;
}

function ethHexToTron(hex: string): string {
  const clean = hex.replace(/^0x/, "");
  if (clean.length !== 40) return hex;
  const prefixed = Buffer.from("41" + clean, "hex");
  const checksum = sha256(sha256(prefixed)).subarray(0, 4);
  return base58Encode(Buffer.concat([prefixed, checksum]));
}

// ── TronGrid helpers ──────────────────────────────────────────────────────────
function tronHeaders(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  if (TRON_API_KEY) h["TRON-PRO-API-KEY"] = TRON_API_KEY;
  return h;
}

async function tronFetch(url: string, timeout = 10_000): Promise<any> {
  const res = await fetch(url, {
    headers: tronHeaders(),
    signal: AbortSignal.timeout(timeout),
  });
  if (res.status === 429) {
    // Back off for 15 minutes when rate-limited
    backoffUntil = Date.now() + 15 * 60_000;
    throw new Error(`TronGrid HTTP 429`);
  }
  if (!res.ok) throw new Error(`TronGrid HTTP ${res.status}`);
  return res.json();
}

// ── Fetch AddedBlackList events from a USDT contract ─────────────────────────
interface BlackEvent {
  address:     string; // Ethereum hex
  timestamp:   number;
  tx_id:       string;
}

async function fetchBlacklistEvents(contract: string): Promise<BlackEvent[]> {
  const url =
    `https://api.trongrid.io/v1/contracts/${contract}/events` +
    `?event_name=AddedBlackList&limit=${FETCH_LIMIT}&only_confirmed=true&order_by=block_timestamp,desc`;

  try {
    const data = await tronFetch(url, 15_000);
    const events: any[] = data.data ?? [];
    return events.map(e => ({
      address:   e.result?._user ?? e.result?.["0"] ?? "",
      timestamp: e.block_timestamp ?? Date.now(),
      tx_id:     e.transaction_id ?? "",
    })).filter(e => e.address.length === 42); // must be full 0x + 40 hex chars
  } catch (err: any) {
    console.error(`[bitrace] Failed to fetch events for ${contract}: ${err?.message}`);
    return [];
  }
}

// ── Fetch USDT balance for a single TRON address ──────────────────────────────
async function fetchUsdtBalance(tronAddress: string): Promise<number> {
  try {
    const data = await tronFetch(
      `https://api.trongrid.io/v1/accounts/${encodeURIComponent(tronAddress)}`,
      5_000,
    );
    const acc = data.data?.[0];
    if (!acc?.trc20) return 0;
    const trc20: Record<string, string>[] = acc.trc20;
    const flat: Record<string, string> = Object.assign({}, ...trc20);
    const raw = flat[USDT_PRIMARY] ?? flat[USDT_SECONDARY] ?? "0";
    return parseFloat(raw) / 1e6;
  } catch {
    return 0;
  }
}

// ── Batch balance fetching (rate-limited) ─────────────────────────────────────
async function fetchAllBalances(
  addresses: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  for (let i = 0; i < addresses.length; i += BALANCE_BATCH) {
    const batch = addresses.slice(i, i + BALANCE_BATCH);
    const settled = await Promise.allSettled(
      batch.map(addr => fetchUsdtBalance(addr)),
    );
    settled.forEach((r, idx) => {
      result.set(batch[idx], r.status === "fulfilled" ? r.value : 0);
    });
    if (i + BALANCE_BATCH < addresses.length) {
      await new Promise<void>(r => setTimeout(r, BALANCE_GAP_MS));
    }
  }

  return result;
}

// ── Risk level from USDT balance ──────────────────────────────────────────────
function riskLevel(bal: number): FrozenWallet["risk_level"] {
  if (bal >= 100_000) return "HIGH";
  if (bal >= 10_000)  return "MODERATE";
  return "LOW";
}

// ── Format balance ────────────────────────────────────────────────────────────
function fmtBal(n: number): string {
  if (n <= 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M USDT`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(2)}K USDT`;
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " USDT";
}

// ── Format date ───────────────────────────────────────────────────────────────
function fmtDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

// ── Main refresh logic ────────────────────────────────────────────────────────
async function refreshCache(): Promise<void> {
  if (refreshing) return;
  if (Date.now() < backoffUntil) {
    console.log(`[bitrace] Skipping refresh — TronGrid backoff until ${new Date(backoffUntil).toISOString()}`);
    return;
  }
  refreshing = true;

  try {
    console.log("[bitrace] Fetching AddedBlackList events…");

    // Fetch from both USDT contracts in parallel
    const [primary, secondary] = await Promise.all([
      fetchBlacklistEvents(USDT_PRIMARY),
      fetchBlacklistEvents(USDT_SECONDARY),
    ]);

    // Merge and de-duplicate by Ethereum address
    const seen   = new Set<string>();
    const merged: BlackEvent[] = [];
    for (const ev of [...primary, ...secondary]) {
      if (!ev.address || seen.has(ev.address)) continue;
      seen.add(ev.address);
      merged.push(ev);
    }

    // Sort newest first
    merged.sort((a, b) => b.timestamp - a.timestamp);

    console.log(`[bitrace] ${merged.length} unique frozen addresses fetched`);

    // Convert to TRON base58 addresses
    const tronAddresses = merged.map(ev => ethHexToTron(ev.address));

    // Fetch USDT balances for all addresses
    console.log("[bitrace] Fetching USDT balances…");
    const balances = await fetchAllBalances(tronAddresses);

    // Build wallet list
    const wallets: FrozenWallet[] = merged.map((ev, i) => {
      const tronAddr = tronAddresses[i];
      const bal      = balances.get(tronAddr) ?? 0;
      return {
        address:            tronAddr,
        chain:              "TRC20",
        freeze_balance:     fmtBal(bal),
        freeze_balance_raw: bal,
        freeze_time:        fmtDate(ev.timestamp),
        risk_level:         riskLevel(bal),
        tx_id:              ev.tx_id,
      };
    });

    cacheData      = wallets;
    cacheFetchedAt = Date.now();
    cacheTotal     = wallets.length;
    console.log(`[bitrace] Cache updated: ${wallets.length} TRC20 frozen wallets`);
  } catch (err: any) {
    console.error("[bitrace] Cache refresh failed:", err?.message);
  } finally {
    refreshing = false;
  }
}

// ── Kick off background refresh loop ─────────────────────────────────────────
// First run on import, then every 60s
refreshCache();
setInterval(() => { refreshCache().catch(console.error); }, CACHE_TTL_MS);

// ── Route: GET /api/bitrace-trc20-frozen ─────────────────────────────────────
router.get("/bitrace-trc20-frozen", async (_req, res) => {
  // If cache is still warm, return immediately
  if (cacheData && Date.now() - cacheFetchedAt < CACHE_TTL_MS * 2) {
    const age = Math.floor((Date.now() - cacheFetchedAt) / 1000);
    return res.json({
      wallets:  cacheData,
      total:    cacheTotal,
      cached:   true,
      cacheAge: age,
      stale:    age > 60,
    });
  }

  // Cache is empty or very stale — wait for a fresh fetch
  try {
    await refreshCache();
    return res.json({
      wallets:  cacheData ?? [],
      total:    cacheTotal,
      cached:   false,
      cacheAge: 0,
    });
  } catch {
    return res.status(503).json({ error: "No se pudo obtener la lista de wallets congeladas." });
  }
});

export default router;
