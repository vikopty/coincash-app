// @ts-nocheck — noble/secp256k1 v3 ESM resolution quirks; runtime correct
import { sign as secp256k1Sign, hashes as secp256k1Hashes } from "@noble/secp256k1";
import { sha256 } from "@noble/hashes/sha2.js";
import { hmac } from "@noble/hashes/hmac.js";

// @noble/secp256k1 v3 requires both hashes.sha256 and hashes.hmacSha256 to be
// registered before any sign() call — otherwise throws "hashes.sha256 not set"
// or "hashes.hmacSha256 not set". The old etc.sha256Sync API does not exist in v3.
secp256k1Hashes.sha256    = sha256;
secp256k1Hashes.hmacSha256 = (key: Uint8Array, ...msgs: Uint8Array[]) => hmac(sha256, key, ...msgs);

const KEY = import.meta.env.VITE_TRON_API_KEY ?? "";
console.log("[tronApi] API key loaded:", KEY ? `✓ (${KEY.slice(0, 8)}…)` : "✗ MISSING — requests will be unauthenticated");

// Both known mainnet USDT TRC20 contract addresses (TR7... is the primary Tether contract)
export const USDT_CONTRACT  = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
export const USDT_CONTRACT2 = "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj";

// ── Fallback node list ────────────────────────────────────────────────────────
// Tried in order; if one fails (network error, timeout, 5xx) the next is used.
// sc: true  → node supports /wallet/triggersmartcontract (verified)
// sc: false → node returns 404 for that endpoint; only used for reads
const NODES = [
  { base: "https://api.trongrid.io",          key: true,  sc: true  },
  { base: "https://tron-api.publicnode.com",   key: false, sc: false }, // 404 on triggersmartcontract
  { base: "https://api.tronstack.io",          key: false, sc: true  }, // verified 200
  { base: "https://rpc.ankr.com/tron",         key: false, sc: false }, // untested; skip for sc
];

// Index of the last node that responded successfully (start at 0 = primary)
let _activeNode = 0;

// Which node index is currently live (for status display)
export function getActiveNodeIndex(): number { return _activeNode; }
export function getNodeCount(): number       { return NODES.length; }
export function getActiveNodeBase(): string  { return NODES[_activeNode].base; }

// ── Resilient fetch with node fallback + 429 retry ───────────────────────────
// Tries each node in sequence (starting from last known-good) with a 5 s timeout.
// On 429: waits 2 s and retries up to 3 attempts before falling to the next node.
// Falls back on network errors and 5xx server errors; passes through other 4xx.
// Pass { sc: true } for /wallet/triggersmartcontract — skips nodes that return 404.
const MAX_RETRIES = 3;
const RETRY_WAIT_MS = 2_000;

async function tronFetch(path: string, init: RequestInit = {}, opts: { sc?: boolean } = {}): Promise<Response> {
  // For smart-contract calls: always try TronGrid first (index 0), then only sc-capable nodes.
  // For regular reads: rotate from _activeNode through all nodes.
  let order: number[];
  if (opts.sc) {
    const scNodes = NODES.map((_, i) => i).filter(i => NODES[i].sc);
    // Always lead with 0 (TronGrid) for sc calls regardless of _activeNode
    order = [0, ...scNodes.filter(i => i !== 0)];
  } else {
    order = NODES.map((_, i) => (i + _activeNode) % NODES.length);
  }
  let lastErr: Error | null = null;

  for (const idx of order) {
    const node = NODES[idx];

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5_000);
      try {
        const hdrs: Record<string, string> = { "Content-Type": "application/json" };
        if (node.key && KEY) hdrs["TRON-PRO-API-KEY"] = KEY;
        const res = await fetch(`${node.base}${path}`, {
          ...init,
          headers: { ...hdrs, ...(init.headers as Record<string, string> ?? {}) },
          signal: ctrl.signal,
        });
        clearTimeout(timer);

        if (res.status === 429) {
          console.warn(`[tronApi] 429 from node ${idx} (attempt ${attempt}/${MAX_RETRIES}) — waiting ${RETRY_WAIT_MS}ms`);
          if (attempt < MAX_RETRIES) {
            await new Promise<void>(r => setTimeout(r, RETRY_WAIT_MS));
            continue; // retry same node
          }
          // exhausted retries on this node — try next
          lastErr = new Error(`Node ${idx} rate-limited (429) after ${MAX_RETRIES} attempts`);
          break;
        }

        if (res.status < 500) { // 2xx/3xx/other 4xx → server alive, return result
          _activeNode = idx;
          return res;
        }

        // 5xx — don't retry same node, move to next
        lastErr = new Error(`Node ${idx} returned ${res.status}`);
        break;
      } catch (e: any) {
        clearTimeout(timer);
        lastErr = e;
        break; // network/abort error — move to next node
      }
    }
  }
  throw lastErr ?? new Error("All TRON nodes unavailable");
}

// ── Rate limiter (110 ms gap) ─────────────────────────────────────────────────
let _next = 0;
async function rateWait(): Promise<void> {
  const now = Date.now();
  if (now < _next) await new Promise<void>(r => setTimeout(r, _next - now));
  _next = Date.now() + 110;
}

// ── Hex helpers ───────────────────────────────────────────────────────────────
function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map(x => x.toString(16).padStart(2, "0")).join("");
}

// Safe SUN conversion — always returns a true integer, never a float
function toSun(amount: number): number {
  const n = typeof amount === "string"
    ? parseFloat((amount as string).replace(/,/g, "."))
    : Number(amount);
  if (!isFinite(n) || n <= 0) throw new Error(`Monto inválido: ${amount}`);
  return Math.trunc(Math.round(n * 1_000_000));
}

// ── Base58 ────────────────────────────────────────────────────────────────────
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function b58ToBigInt(s: string): bigint {
  let n = 0n;
  for (const c of s) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error("Invalid base58 character: " + c);
    n = n * 58n + BigInt(i);
  }
  return n;
}

function bigIntToB58(n: bigint, leadingZeros: number): string {
  let s = "";
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  return "1".repeat(leadingZeros) + s;
}

// ── Address validation & normalization ────────────────────────────────────────
// Returns true if `addr` is a plausible TRON address (B58 starting with T OR
// 42-char 41-prefixed hex).  Does NOT verify the checksum.
export function isValidTronAddr(addr: unknown): addr is string {
  if (typeof addr !== "string" || !addr) return false;
  if (addr.startsWith("T") && addr.length === 34) return true;  // B58
  if (/^41[0-9a-fA-F]{40}$/.test(addr)) return true;            // hex
  return false;
}

// TRON address → 42-char 41-prefixed hex.
// Accepts BOTH Base58Check (T...) and already-normalized hex (41...) so the
// function never produces garbage when the caller accidentally passes hex.
export function tronAddrToHex(addr: string): string {
  if (!addr) throw new Error("tronAddrToHex: dirección vacía");
  // Already hex with 41-prefix — return as-is (lower-cased for consistency)
  if (/^41[0-9a-fA-F]{40}$/.test(addr)) return addr.toLowerCase();
  // 40-char hex without prefix — add it
  if (/^[0-9a-fA-F]{40}$/.test(addr)) return ("41" + addr).toLowerCase();
  // Treat as Base58Check
  const n = b58ToBigInt(addr);
  return n.toString(16).padStart(50, "0").slice(0, 42); // first 21 bytes
}

// 21-byte hex (41-prefixed) → TRON Base58Check
export async function hexToTronAddr(hex42: string): Promise<string> {
  const raw = hexToBytes(hex42); // 21 bytes
  const h1 = new Uint8Array(await crypto.subtle.digest("SHA-256", raw));
  const h2 = new Uint8Array(await crypto.subtle.digest("SHA-256", h1));
  const full = new Uint8Array(25);
  full.set(raw); full.set(h2.slice(0, 4), 21);
  let leading = 0;
  for (const b of full) { if (b !== 0) break; leading++; }
  let n = 0n;
  for (const b of full) n = n * 256n + BigInt(b);
  return bigIntToB58(n, leading);
}

// Ensure hex has 41-prefix
function ensure41(hex: string): string {
  if (hex.startsWith("41")) return hex;
  if (hex.length === 40) return "41" + hex;
  return hex;
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface AccountInfo {
  trxBalance: number;
  usdtBalance: number;
  activated: boolean;
}

export interface TxRecord {
  id: string;
  ts: number;
  type: "in" | "out";
  token: "TRX" | "USDT";
  amount: number;
  counterpart: string;
  status: "SUCCESS" | "FAILED";
}

// ── Direct TRC20 balanceOf call via triggerconstantcontract ──────────────────
// This is the authoritative way to get a TRC20 balance — reads directly from
// the smart contract. No reliance on the account endpoint's trc20 array.
async function fetchTRC20Balance(walletAddress: string, contractAddress: string): Promise<number> {
  try {
    await rateWait();
    const walletHex   = tronAddrToHex(walletAddress);
    const contractHex = tronAddrToHex(contractAddress);
    // ABI-encode balanceOf(address): 20-byte address, left-padded to 32 bytes
    const addrParam = walletHex.slice(2).padStart(64, "0"); // drop "41", pad

    const res = await tronFetch("/wallet/triggerconstantcontract", {
      method: "POST",
      body: JSON.stringify({
        owner_address: walletHex,
        contract_address: contractHex,
        function_selector: "balanceOf(address)",
        parameter: addrParam,
        visible: false,
      }),
    });
    if (!res.ok) return 0;
    const json = await res.json();
    const hex = json.constant_result?.[0];
    if (!hex || hex === "0".repeat(64)) return 0;
    // Parse 32-byte big-endian uint256
    return Number(BigInt("0x" + hex)) / 1_000_000;
  } catch {
    return 0;
  }
}

// ── Fetch account info ────────────────────────────────────────────────────────
// Fetches TRX balance from the account endpoint, and USDT balance via a direct
// balanceOf() call to both known USDT contract addresses. Takes the maximum.
export async function fetchAccountInfo(address: string): Promise<AccountInfo> {
  // Run all three requests in parallel for speed
  const [accountRes, balanceOf1, balanceOf2] = await Promise.all([
    (async () => {
      await rateWait();
      const res = await tronFetch(`/v1/accounts/${address}`);
      return res.ok ? res.json() : null;
    })(),
    fetchTRC20Balance(address, USDT_CONTRACT),
    fetchTRC20Balance(address, USDT_CONTRACT2),
  ]);

  // TRX balance from account endpoint
  let trxBalance = 0;
  let activated  = false;
  // Start USDT candidates from the direct contract calls (authoritative)
  let usdtCandidates = [balanceOf1, balanceOf2];

  if (accountRes?.data && accountRes.data.length > 0) {
    const acc = accountRes.data[0];
    trxBalance = (acc.balance ?? 0) / 1_000_000;
    activated  = true;

    // Also check the account's trc20 array as an additional data source.
    // TronGrid can return keys in B58, HEX, or with minor case differences —
    // do a case-insensitive scan of all keys in each entry to avoid silent misses.
    if (Array.isArray(acc.trc20)) {
      const usdtTargets = new Set([
        USDT_CONTRACT.toLowerCase(),
        USDT_CONTRACT2.toLowerCase(),
        tronAddrToHex(USDT_CONTRACT).toLowerCase(),
        tronAddrToHex(USDT_CONTRACT2).toLowerCase(),
      ]);
      for (const entry of acc.trc20) {
        for (const [k, v] of Object.entries(entry)) {
          if (usdtTargets.has(k.toLowerCase()) && v !== undefined) {
            const num = Number(v) / 1_000_000;
            if (num > 0) usdtCandidates.push(num);
          }
        }
      }
    }
  }

  // Take the highest balance across all sources
  const usdtBalance = Math.max(...usdtCandidates, 0);

  return { trxBalance, usdtBalance, activated };
}

// ── Fetch TRX transactions ────────────────────────────────────────────────────
export async function fetchTRXTransactions(address: string, limit = 20): Promise<TxRecord[]> {
  await rateWait();
  const res = await tronFetch(
    `/v1/accounts/${address}/transactions?limit=${limit}&only_confirmed=true`
  );
  if (!res.ok) throw new Error(`TronGrid transactions error ${res.status}`);
  const json = await res.json();
  const records: TxRecord[] = [];

  for (const tx of json.data ?? []) {
    try {
      const contract = tx.raw_data?.contract?.[0];
      if (contract?.type !== "TransferContract") continue;
      const val = contract.parameter?.value ?? {};
      const toHex = ensure41(val.to_address ?? "");
      const fromHex = ensure41(val.owner_address ?? "");
      if (!toHex || !fromHex) continue;

      const [toAddr, fromAddr] = await Promise.all([
        hexToTronAddr(toHex),
        hexToTronAddr(fromHex),
      ]);

      const isIn = toAddr.toLowerCase() === address.toLowerCase();
      const status = tx.ret?.[0]?.contractRet === "SUCCESS" ? "SUCCESS" : "FAILED";

      records.push({
        id: tx.txID,
        ts: tx.block_timestamp ?? tx.blockTimeStamp ?? 0,
        type: isIn ? "in" : "out",
        token: "TRX",
        amount: (val.amount ?? 0) / 1_000_000,
        counterpart: isIn ? fromAddr : toAddr,
        status,
      });
    } catch { /* skip malformed */ }
  }
  return records;
}

// ── Fetch USDT (TRC20) transactions for one contract ─────────────────────────
async function fetchUSDTTxForContract(
  address: string, contractAddress: string, limit = 20
): Promise<TxRecord[]> {
  await rateWait();
  const res = await tronFetch(
    `/v1/accounts/${address}/transactions/trc20?limit=${limit}&contract_address=${contractAddress}&only_confirmed=true`
  );
  if (!res.ok) return [];
  const json = await res.json();
  const records: TxRecord[] = [];
  for (const tx of json.data ?? []) {
    try {
      const amount = Number(tx.value ?? "0") / 1_000_000;
      const isIn = (tx.to ?? "").toLowerCase() === address.toLowerCase();
      records.push({
        id: tx.transaction_id,
        ts: tx.block_timestamp ?? 0,
        type: isIn ? "in" : "out",
        token: "USDT",
        amount,
        counterpart: isIn ? tx.from : tx.to,
        status: "SUCCESS",
      });
    } catch { /* skip malformed */ }
  }
  return records;
}

// ── Fetch USDT (TRC20) transactions — both known contract addresses ───────────
export async function fetchUSDTTransactions(address: string, limit = 20): Promise<TxRecord[]> {
  const [set1, set2] = await Promise.all([
    fetchUSDTTxForContract(address, USDT_CONTRACT, limit),
    fetchUSDTTxForContract(address, USDT_CONTRACT2, limit),
  ]);
  // Merge, deduplicate by tx ID, sort by timestamp descending
  const seen = new Set<string>();
  const all: TxRecord[] = [];
  for (const r of [...set1, ...set2]) {
    if (!seen.has(r.id)) { seen.add(r.id); all.push(r); }
  }
  return all.sort((a, b) => b.ts - a.ts);
}

// ── Fetch all transactions (merged + sorted) ──────────────────────────────────
export async function fetchAllTransactions(address: string): Promise<TxRecord[]> {
  const [trx, usdt] = await Promise.all([
    fetchTRXTransactions(address, 20),
    fetchUSDTTransactions(address, 20),
  ]);
  return [...trx, ...usdt].sort((a, b) => b.ts - a.ts).slice(0, 30);
}

// ── Sign + broadcast ──────────────────────────────────────────────────────────
async function broadcastSigned(tx: any, privKeyHex: string): Promise<string> {
  const txHashBytes = hexToBytes(tx.txID);
  const privBytes = hexToBytes(privKeyHex);

  const sigRec = secp256k1Sign(txHashBytes, privBytes, { lowS: false, prehash: false, format: 'recovered' });
  const sigHex = Array.from(sigRec.slice(1)).map((b: number) => b.toString(16).padStart(2, '0')).join('') + (sigRec[0] + 27).toString(16).padStart(2, '0');

  const signed = { ...tx, signature: [sigHex] };

  await rateWait();
  const res = await tronFetch("/wallet/broadcasttransaction", {
    method: "POST",
    body: JSON.stringify(signed),
  });
  if (!res.ok) throw new Error(`Broadcast error ${res.status}`);
  const result = await res.json();
  if (!result.result) throw new Error(result.message ?? "Transacción rechazada por la red.");
  return tx.txID;
}

// ── Account resources ─────────────────────────────────────────────────────────
// Fetches live energy and bandwidth availability for a TRON address.

export interface AccountResources {
  availableEnergy: number;    // staked energy not yet consumed today
  totalEnergy: number;        // total staked energy limit
  availableBandwidth: number; // free + staked bandwidth not yet consumed
  totalBandwidth: number;     // free + staked bandwidth limit
}

export async function getAccountResources(address: string): Promise<AccountResources> {
  await rateWait();
  const res = await tronFetch("/wallet/getaccountresource", {
    method: "POST",
    body: JSON.stringify({ address }),
  });
  if (!res.ok) throw new Error(`getaccountresource ${res.status}`);
  const d = await res.json();

  const energyLimit = d.EnergyLimit     ?? 0;
  const energyUsed  = d.EnergyUsed      ?? 0;
  const freeNet     = d.freeNetLimit    ?? 1_500; // TRON gives 1500 free bandwidth/day
  const freeNetUsed = d.freeNetUsed     ?? 0;
  const netLimit    = d.NetLimit        ?? 0;
  const netUsed     = d.NetUsed         ?? 0;

  return {
    availableEnergy:    Math.max(0, energyLimit - energyUsed),
    totalEnergy:        energyLimit,
    availableBandwidth: Math.max(0, (freeNet + netLimit) - (freeNetUsed + netUsed)),
    totalBandwidth:     freeNet + netLimit,
  };
}

// ── Gas abstraction — fee estimation ─────────────────────────────────────────
// Fee model:
//  • "free"   — user has enough staked energy; only bandwidth cost (~0)
//  • "rental" — relay will rent energy; user pays the rental rate (~0.5 USDT)
//  • "burn"   — relay unavailable; TRX is burned at network rate (~27 TRX)

export type FeeMode = "free" | "rental" | "burn";

export interface FeeEstimate {
  // Primary user-facing fee (USDT) — always set
  displayFeeUSDT: number;
  feeMode:        FeeMode;

  // Raw burn cost (shown as secondary / worst-case)
  feeTRX:  number;
  feeUSDT: number;

  // Rental cost (shown when feeMode === "rental")
  rentalFeeTRX:  number;
  rentalFeeUSDT: number;

  trxPriceUSDT:    number;
  energyUsed:      number;   // backwards compat
  energyNeeded:    number;
  bandwidthNeeded: number;
  availableEnergy:    number;
  availableBandwidth: number;
  hasEnoughEnergy:    boolean;
  hasEnoughBandwidth: boolean;
}

// Conservative energy estimate covering cold + warm USDT contract calls
const ENERGY_ESTIMATE    = 65_000;
// Typical bandwidth for a TRC20 triggerSmartContract tx
const BANDWIDTH_ESTIMATE = 268;

// Energy rental market rate as a fraction of the burn rate.
// Rental platforms typically charge ~20 % of the burn rate (≈ 80-100 SUN/energy).
const RENTAL_RATE = 0.20;

// In-memory cache for live prices (30-second TTL)
let _priceCache: { trxUsdt: number; energySun: number; ts: number } | null = null;
const PRICE_TTL = 30_000;

async function fetchLivePrices(): Promise<{ trxUsdt: number; energySun: number }> {
  const now = Date.now();
  if (_priceCache && now - _priceCache.ts < PRICE_TTL) {
    return { trxUsdt: _priceCache.trxUsdt, energySun: _priceCache.energySun };
  }

  // Fetch TRX/USDT price from CoinGecko (public, no auth required)
  const [priceRes, chainRes] = await Promise.all([
    fetch("https://api.coingecko.com/api/v3/simple/price?ids=tron&vs_currencies=usd", {
      headers: { Accept: "application/json" },
    }).catch(() => null),
    (async () => {
      await rateWait();
      return tronFetch("/wallet/getchainparameters").catch(() => null);
    })(),
  ]);

  let trxUsdt = 0.12; // fallback: $0.12 per TRX
  if (priceRes?.ok) {
    const j = await priceRes.json().catch(() => null);
    if (j?.tron?.usd) trxUsdt = j.tron.usd;
  }

  let energySun = 420; // fallback: 420 SUN per energy (TRON mainnet default)
  if (chainRes?.ok) {
    const j = await chainRes.json().catch(() => null);
    const param = (j?.chainParameter ?? []).find((p: any) => p.key === "getEnergyFee");
    if (param?.value) energySun = param.value;
  }

  _priceCache = { trxUsdt, energySun, ts: now };
  return { trxUsdt, energySun };
}

// Estimate the USDT network fee for a TRC20 USDT transfer.
// Pass the sender address to also check real-time energy/bandwidth availability.
// Pass relayAvailable=true when the relay server is configured (can auto-rent energy).
export async function estimateUSDTTransferFee(
  address?: string,
  relayAvailable = true,
): Promise<FeeEstimate> {
  const [prices, resources] = await Promise.all([
    fetchLivePrices(),
    address ? getAccountResources(address).catch(() => null) : Promise.resolve(null),
  ]);

  const { trxUsdt, energySun } = prices;

  // Full burn cost (worst-case, no energy)
  const feeTRX  = (ENERGY_ESTIMATE * energySun) / 1_000_000;
  const feeUSDT = parseFloat((feeTRX * trxUsdt).toFixed(2));

  // Rental cost (20 % of burn cost — typical energy market rate)
  const rentalSunPerEnergy = energySun * RENTAL_RATE;
  const rentalFeeTRX  = parseFloat(((ENERGY_ESTIMATE * rentalSunPerEnergy) / 1_000_000).toFixed(4));
  const rentalFeeUSDT = parseFloat((rentalFeeTRX * trxUsdt).toFixed(2));

  const availableEnergy    = resources?.availableEnergy    ?? 0;
  const availableBandwidth = resources?.availableBandwidth ?? 0;
  const hasEnoughEnergy    = availableEnergy    >= ENERGY_ESTIMATE;
  const hasEnoughBandwidth = availableBandwidth >= BANDWIDTH_ESTIMATE;

  // Determine fee mode
  let feeMode: FeeMode;
  let displayFeeUSDT: number;

  if (hasEnoughEnergy) {
    // User's own staked energy covers this tx — only bandwidth (negligible)
    feeMode        = "free";
    displayFeeUSDT = 0.00;
  } else if (relayAvailable) {
    // Relay will rent energy automatically — user pays the rental rate
    feeMode        = "rental";
    displayFeeUSDT = Math.max(0.01, rentalFeeUSDT);
  } else {
    // No relay — TRX will be burned from the user's wallet
    feeMode        = "burn";
    displayFeeUSDT = Math.max(0.01, feeUSDT);
  }

  return {
    displayFeeUSDT,
    feeMode,
    feeTRX,
    feeUSDT: Math.max(0.01, feeUSDT),
    rentalFeeTRX,
    rentalFeeUSDT: Math.max(0.01, rentalFeeUSDT),
    trxPriceUSDT: trxUsdt,
    energyUsed:         ENERGY_ESTIMATE,
    energyNeeded:       ENERGY_ESTIMATE,
    bandwidthNeeded:    BANDWIDTH_ESTIMATE,
    availableEnergy,
    availableBandwidth,
    hasEnoughEnergy,
    hasEnoughBandwidth,
  };
}

// ── Send TRX ─────────────────────────────────────────────────────────────────
export async function sendTRX(
  from: string, to: string, amountTrx: number, privKeyHex: string
): Promise<string> {
  if (amountTrx <= 0) throw new Error("El monto debe ser mayor a 0.");
  if (!isValidTronAddr(to)) throw new Error("Dirección TRON inválida.");

  const fromHex   = tronAddrToHex(from);
  const toHex     = tronAddrToHex(to);
  const amountSun = toSun(amountTrx);   // safe integer

  await rateWait();
  const res = await tronFetch("/wallet/createtransaction", {
    method: "POST",
    body: JSON.stringify({ owner_address: fromHex, to_address: toHex, amount: amountSun }),
  });
  if (!res.ok) throw new Error(`Error creando tx TRX (${res.status})`);
  const tx = await res.json();
  if (tx.Error) throw new Error(tx.Error);

  return broadcastSigned(tx, privKeyHex);
}

// ── Send USDT (TRC20) — direct broadcast ─────────────────────────────────────
export async function sendUSDT(
  from: string, to: string, amountUsdt: number, privKeyHex: string
): Promise<string> {
  if (amountUsdt <= 0) throw new Error("El monto debe ser mayor a 0.");
  if (!isValidTronAddr(to)) throw new Error("Dirección TRON inválida.");

  const fromHex     = tronAddrToHex(from);
  const contractHex = tronAddrToHex(USDT_CONTRACT);
  const toHex20    = tronAddrToHex(to).slice(2);
  const toParam    = toHex20.padStart(64, "0");
  const amtRaw     = BigInt(toSun(amountUsdt));  // safe integer
  const amtParam   = amtRaw.toString(16).padStart(64, "0");
  const parameter  = toParam + amtParam;

  await rateWait();
  const res = await tronFetch("/wallet/triggersmartcontract", {
    method: "POST",
    body: JSON.stringify({
      owner_address: fromHex,
      contract_address: contractHex,
      function_selector: "transfer(address,uint256)",
      parameter,
      fee_limit: 50_000_000,
      call_value: 0,
    }),
  }, { sc: true });
  if (!res.ok) throw new Error(`Error creando tx USDT (${res.status})`);
  const result = await res.json();
  if (result.Error || !result.transaction) throw new Error(result.Error ?? "Error de smart contract.");

  return broadcastSigned(result.transaction, privKeyHex);
}

// ── Build + sign USDT tx (without broadcasting) ───────────────────────────────
// Used by the relay flow: tx is signed locally, the signed object is sent to the relay server.
async function buildAndSignUSDTTx(
  from: string, to: string, amountUsdt: number, privKeyHex: string
): Promise<any> {
  // ── Coerce + validate amount ───────────────────────────────────────────────
  const amt = Number(amountUsdt);
  if (!isFinite(amt) || amt <= 0)
    throw new Error(`Monto USDT inválido para tx: ${amountUsdt}`);
  // toSun returns Math.trunc(Math.round(n * 1_000_000)) — always a safe integer.
  const amtSun = toSun(amt);
  if (!Number.isInteger(amtSun) || amtSun <= 0)
    throw new Error(`Error convirtiendo a SUN: ${amt} USDT → ${amtSun}`);

  // ── Task 1 — log all parameters before any TronGrid call ──────────────────
  console.log("Wallet:",    from);               // source of USDT (user's wallet)
  console.log("Recipient:", to);                 // output destination
  console.log("Contract:",  USDT_CONTRACT);      // TRC20 USDT contract address
  console.log("Amount:",    amtSun);             // integer SUN value (no decimals)

  // ── Task 2/4 — validate address format before execution ───────────────────
  // Valid format: T + 33 Base58 chars = 34 chars total (e.g. Txxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)
  if (!isValidTronAddr(from))
    throw new Error(`Dirección de wallet inválida: "${from}". Formato: Txxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`);
  if (!isValidTronAddr(to))
    throw new Error(`Dirección del router/relayer inválida: "${to}". Formato: Txxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`);

  const fromHex     = tronAddrToHex(from);
  const contractHex = tronAddrToHex(USDT_CONTRACT);
  const toHex20     = tronAddrToHex(to).slice(2);
  const toParam     = toHex20.padStart(64, "0");
  const amtRaw      = BigInt(amtSun);          // safe integer, no decimals
  const amtParam    = amtRaw.toString(16).padStart(64, "0");
  const parameter   = toParam + amtParam;

  // Extended debug log — hex values for TronGrid body inspection
  console.log("[swap:buildUSDTTx]", { fromHex, contractHex, toHex20, parameter });

  await rateWait();
  const res = await tronFetch("/wallet/triggersmartcontract", {
    method: "POST",
    body: JSON.stringify({
      owner_address:     fromHex,
      contract_address:  contractHex,
      function_selector: "transfer(address,uint256)",
      parameter,
      fee_limit:  50_000_000,
      call_value: 0,
    }),
  }, { sc: true });
  if (!res.ok) throw new Error(`Error creando tx USDT (${res.status})`);
  const result = await res.json();
  if (result.Error || !result.transaction) throw new Error(result.Error ?? "Error de smart contract.");

  // Sign locally — private key never leaves this function / the browser
  const tx = result.transaction;
  const txHashBytes = hexToBytes(tx.txID);
  const privBytes   = hexToBytes(privKeyHex);
  const sigRec = secp256k1Sign(txHashBytes, privBytes, { lowS: false, prehash: false, format: 'recovered' });
  const sigHex = Array.from(sigRec.slice(1)).map((b: number) => b.toString(16).padStart(2, '0')).join('') + (sigRec[0] + 27).toString(16).padStart(2, '0');

  return { ...tx, signature: [sigHex] };
}

// ── Service fee constant ──────────────────────────────────────────────────────
// Fixed 1 USDT CoinCash service fee applied to every USDT transfer.
export const SERVICE_FEE_USDT = 1;

// ── Swap types ────────────────────────────────────────────────────────────────
export type SwapDirection = "usdt_to_trx" | "trx_to_usdt";

export interface SwapRate {
  trxUsd:         number;
  trxPerUsdt:     number;   // TRX per 1 USDT (primary display unit)
  feeRate:        number;   // 0 in FF flow — spread built into rate
  coinCashFee:    number;   // flat 1 USDT platform fee
  relayerAddress: string;   // B58 — user sends input tokens here
  swapAvailable:  boolean;
  ffConfigured:   boolean;  // whether FixedFloat API is configured
  provider:       string;   // "fixedfloat" | "local"
}

export interface SwapQuote {
  quoteId:          string;
  direction:        SwapDirection;
  inputAmount:      number;           // total sent to relayer (USDT or TRX)
  coinCashFeeUsdt:  number;           // flat 1 USDT CoinCash platform fee
  swapAmount:       number;           // amount forwarded to FixedFloat (after CoinCash fee)
  outputAmount:     number;           // FF estimated output (what user receives)
  feeAmount:        number;           // 0 in FF flow — spread built into exchange rate
  trxUsd:           number;           // implied USD/TRX rate
  trxPerUsdt:       number;           // TRX per 1 USDT (primary display unit)
  relayerAddress:   string;
  inputToken:       "USDT" | "TRX";
  outputToken:      "USDT" | "TRX";
  expiresAt:        number;
}

export interface SwapResult {
  inputTxId:     string;    // user → relayer
  relayTxId:     string;    // relayer → FixedFloat deposit address
  ffOrderId:     string;    // FixedFloat order ID
  ffDepositAddr: string;    // FixedFloat deposit address (for reference)
  outputAmount:  number;    // FF expected output amount
  feeAmount:     number;    // 0 in FF flow
  direction:     SwapDirection;
}

// ── Build + sign TRX tx (without broadcasting) ────────────────────────────────
// Used in the TRX → USDT swap flow: user signs TRX payment to relayer address.
async function buildAndSignTRXTx(
  from: string, to: string, amountTrx: number, privKeyHex: string
): Promise<any> {
  // ── Coerce + validate amount ───────────────────────────────────────────────
  const amt = Number(amountTrx);
  if (!isFinite(amt) || amt <= 0)
    throw new Error(`Monto TRX inválido para tx: ${amountTrx}`);
  const amountSun = toSun(amt);  // Math.trunc(Math.round(n*1_000_000)) — always integer
  if (!Number.isInteger(amountSun) || amountSun <= 0)
    throw new Error(`Error convirtiendo a SUN: ${amt} TRX → ${amountSun}`);

  // ── Task 1 — log all parameters before any TronGrid call ──────────────────
  console.log("Wallet:",    from);               // source of TRX (user's wallet)
  console.log("Recipient:", from);               // output destination = same wallet
  console.log("Router:",    to);                 // relayer that receives & swaps
  console.log("Token:",     "TRX");              // native TRX (no contract address)
  console.log("Amount:",    amountSun);          // integer SUN value (no decimals)

  // ── Task 2/4 — validate address format before execution ───────────────────
  // Valid format: T + 33 Base58 chars = 34 chars total (e.g. Txxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)
  if (!isValidTronAddr(from))
    throw new Error(`Dirección de wallet inválida: "${from}". Formato: Txxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`);
  if (!isValidTronAddr(to))
    throw new Error(`Dirección del router/relayer inválida: "${to}". Formato: Txxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`);

  const fromHex   = tronAddrToHex(from);
  const toHex     = tronAddrToHex(to);

  // Extended debug log — hex values for TronGrid body inspection
  console.log("[swap:buildTRXTx]", { fromHex, toHex, amountSun });

  await rateWait();
  const res = await tronFetch("/wallet/createtransaction", {
    method: "POST",
    body: JSON.stringify({ owner_address: fromHex, to_address: toHex, amount: amountSun }),
  });
  if (!res.ok) throw new Error(`Error creando tx TRX (${res.status})`);
  const tx = await res.json();
  if (tx.Error || !tx.txID) throw new Error(tx.Error ?? "Error creando tx TRX");

  const txHashBytes = hexToBytes(tx.txID);
  const privBytes   = hexToBytes(privKeyHex);
  const sigRec = secp256k1Sign(txHashBytes, privBytes, { lowS: false, prehash: false, format: 'recovered' });
  return { ...tx, signature: [Array.from(sigRec.slice(1)).map((b: number) => b.toString(16).padStart(2, '0')).join('') + (sigRec[0] + 27).toString(16).padStart(2, '0')] };
}

// ── Fetch live TRX/USDT rate + relayer info ───────────────────────────────────
export async function fetchSwapRate(): Promise<SwapRate> {
  try {
    const res = await fetch("/api-server/api/swap/rate");
    if (!res.ok) throw new Error("not ok");
    return res.json();
  } catch {
    return {
      trxUsd: 0, trxPerUsdt: 0, feeRate: 0, coinCashFee: 1,
      relayerAddress: "", swapAvailable: false, ffConfigured: false, provider: "unknown",
    };
  }
}

// ── Get a server-side swap quote (one-time use, 60 s TTL) ─────────────────────
export async function getSwapQuote(
  direction: SwapDirection,
  inputAmount: number,
): Promise<SwapQuote> {
  const res = await fetch("/api-server/api/swap/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ direction, inputAmount }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Error de red" }));
    throw new Error(err.error ?? `Swap quote error ${res.status}`);
  }
  return res.json();
}

// ── Execute a swap via the relay server ───────────────────────────────────────
// Steps:
//   1. Obtain (or reuse) a quote from the server
//   2. Build + sign the input tx (user → relayer): USDT or TRX
//   3. POST { quoteId, signedInputTx, userAddress } to relay
//   4. Relay broadcasts input, sends output + fee
export async function executeSwap(
  from:          string,        // user B58 address
  privKeyHex:    string,
  quote:         SwapQuote,     // server-issued quote
): Promise<SwapResult> {
  const { direction } = quote;

  // ── Explicit number coercion ──────────────────────────────────────────────
  // JSON deserialization can sometimes give string values in edge cases.
  const inputAmount = Number(quote.inputAmount);
  const swapAmount  = Number(quote.swapAmount);    // = inputAmount − coinCashFee (for USDT→TRX)
  const coinCashFee = Number(quote.coinCashFeeUsdt);

  // ── Resolve addresses ─────────────────────────────────────────────────────
  // walletAddress    — where the user's tokens originate (source of the swap input)
  // recipientAddress — where the swapped OUTPUT tokens return (always the user's wallet)
  //                    defaults to walletAddress if somehow unset
  // routerAddress    — the relayer/intermediary that executes the swap
  //                    defaults to walletAddress (self-transfer) if relayer not configured,
  //                    so the tx never references an undefined/null address
  const walletAddress    = String(from || "");
  const recipientAddress = walletAddress;                       // output always back to user
  const routerAddress    = String(quote.relayerAddress || walletAddress);
  const tokenAddress     = direction === "usdt_to_trx" ? USDT_CONTRACT : "TRX";

  // ── tx amount = swapAmount (CoinCash fee deducted BEFORE building the tx) ─
  // USDT→TRX: user sends (inputAmount − coinCashFee) = swapAmount USDT to relayer
  //            (e.g. 5 USDT input − 1 USDT fee = 4 USDT in the signed tx)
  // TRX→USDT: swapAmount === inputAmount (no input-side deduction for TRX)
  //
  // toSun() guarantees the result is a safe integer:
  //   toSun(4.0) → 4_000_000  ✓   never a float or decimal string
  const txAmount    = direction === "usdt_to_trx" ? swapAmount : inputAmount;
  const txAmountSun = toSun(txAmount);  // validate + convert to SUN integer

  // ── Task 1 — structured parameter log (all values before any TronGrid call) ─
  console.log("Wallet:",    walletAddress);
  console.log("Recipient:", recipientAddress);
  console.log("Router:",    routerAddress);
  console.log("Token:",     tokenAddress);
  console.log("Amount:",    txAmountSun);
  // Extended context log
  console.log("[swap:executeSwap]", {
    Direction:   direction,
    InputAmount: inputAmount,
    CoinCashFee: coinCashFee,
    SwapAmount:  swapAmount,
    TxAmountSun: txAmountSun,
    QuoteId:     quote.quoteId,
  });

  // ── Task 4 — validate every required parameter before touching TronGrid ───
  // Task 2 — valid format: T + 33 alphanumeric B58 chars = 34 chars total
  if (!walletAddress || !isValidTronAddr(walletAddress))
    throw new Error(`Dirección de wallet inválida: "${walletAddress}". Formato requerido: Txxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`);
  if (!isValidTronAddr(recipientAddress))
    throw new Error(`Dirección del destinatario inválida: "${recipientAddress}".`);
  if (!isValidTronAddr(routerAddress))
    throw new Error(`Dirección del router/relayer inválida: "${routerAddress}". El servicio de swap no está disponible.`);
  if (!isFinite(inputAmount) || inputAmount <= 0)
    throw new Error(`Monto de entrada inválido: ${quote.inputAmount}`);
  if (!isFinite(swapAmount) || swapAmount <= 0)
    throw new Error(`Monto de swap inválido: ${quote.swapAmount}`);
  if (!Number.isInteger(txAmountSun) || txAmountSun <= 0)
    throw new Error(`Error convirtiendo monto a SUN: ${txAmount} → ${txAmountSun}`);

  // Warn if the relayer wasn't set (self-transfer fallback active)
  if (!quote.relayerAddress) {
    console.warn("[swap] Relayer no configurado — usando wallet como router (self-transfer).");
  }

  // Build + sign the user's input payment to the relayer
  // Amount passed is always a plain Number integer (SUN already validated above).
  let signedInputTx: any;
  if (direction === "usdt_to_trx") {
    signedInputTx = await buildAndSignUSDTTx(walletAddress, routerAddress, txAmount, privKeyHex);
  } else {
    signedInputTx = await buildAndSignTRXTx(walletAddress, routerAddress, txAmount, privKeyHex);
  }

  const res = await fetch("/api-server/api/swap/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quoteId: quote.quoteId, signedInputTx, userAddress: from }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Error de red" }));
    throw new Error(err.error ?? `Swap execute error ${res.status}`);
  }
  return res.json();
}

// ── Relay result type ─────────────────────────────────────────────────────────
export interface RelayResult {
  txId:      string;
  feeTxId?:  string;                         // treasury fee tx id (when collected)
  sponsored: boolean;                        // true = relay covered energy
  feeMode:   "free" | "rental" | "burn";    // how energy was provided
}

// ── Relay status type ─────────────────────────────────────────────────────────
export interface RelayStatus {
  relayerActive:       boolean;
  sponsoredTransactions: boolean;
  treasuryAddress:     string;   // CoinCash treasury — receives the 1 USDT service fee
  serviceFeeUSDT:      number;   // always 1
}

// ── Send USDT via CoinCash relay ──────────────────────────────────────────────
// Transaction flow (all signing happens client-side — private key never sent):
//   1. Build + sign main transfer tx  (amount USDT → recipient)
//   2. If treasury address is known:
//      Build + sign service fee tx   (1 USDT → CoinCash treasury)
//   3. POST both signed txs to relay
//   4. Relay broadcasts fee tx first (collects service fee), then main tx
//   5. Relay handles energy delegation / rental so user pays 0 TRX
export async function relayUSDTTransfer(
  from:            string,
  to:              string,
  amountUsdt:      number,
  privKeyHex:      string,
  treasuryAddress: string,         // from relay status — empty string = skip fee tx
): Promise<RelayResult> {
  if (amountUsdt <= 0) throw new Error("El monto debe ser mayor a 0.");
  if (!isValidTronAddr(to)) throw new Error("Dirección TRON inválida.");

  const hasTreasury = treasuryAddress.startsWith("T") && treasuryAddress.length >= 30;

  // Build + sign both transactions in parallel for speed
  const [signedTx, feeTx] = await Promise.all([
    buildAndSignUSDTTx(from, to, amountUsdt, privKeyHex),
    hasTreasury
      ? buildAndSignUSDTTx(from, treasuryAddress, SERVICE_FEE_USDT, privKeyHex)
      : Promise.resolve(null),
  ]);

  // POST signed txs to relay server
  const relayRes = await fetch("/api-server/api/relay/usdt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedTx, feeTx, userAddress: from }),
  });

  if (!relayRes.ok) {
    const err = await relayRes.json().catch(() => ({ error: "Error de red" }));
    throw new Error(err.error ?? `Relay error ${relayRes.status}`);
  }

  const data = await relayRes.json();
  return {
    txId:      data.txId,
    feeTxId:   data.feeTxId,
    sponsored: data.sponsored ?? false,
    feeMode:   data.feeMode  ?? "burn",
  };
}

// ── Check relay server status ─────────────────────────────────────────────────
export async function fetchRelayStatus(): Promise<RelayStatus> {
  try {
    const res = await fetch("/api-server/api/relay/status");
    if (!res.ok) throw new Error("not ok");
    return res.json();
  } catch {
    return {
      relayerActive:        false,
      sponsoredTransactions: false,
      treasuryAddress:      "",
      serviceFeeUSDT:       SERVICE_FEE_USDT,
    };
  }
}

// ── External swap (no CoinCash wallet required) ───────────────────────────────
// User provides amount + destination address. Backend creates an order with the
// swap provider and returns a deposit address the user sends funds to directly.
export interface ExternalOrderResult {
  orderId:            string;
  ffToken:            string;
  depositAddress:     string;
  expectedOutput:     number;
  fromAmount:         string;
  fromToken:          string;
  toToken:            string;
  destinationAddress: string;
  direction:          SwapDirection;
  trxUsd:             number;
  trxPerUsdt:         number;
  inputAmount:        number;
}

export async function createExternalOrder(
  direction:          SwapDirection,
  inputAmount:        number,
  destinationAddress: string,
): Promise<ExternalOrderResult> {
  const res = await fetch("/api-server/api/swap/external-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ direction, inputAmount, destinationAddress }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Error de red" }));
    throw new Error(err.error ?? `Error al crear orden externa: ${res.status}`);
  }
  return res.json();
}

// ── Order status ──────────────────────────────────────────────────────────────
export interface OrderStatus {
  id:             string;
  status:         string;   // NEW | PENDING | EXCHANGE | WITHDRAW | DONE | EXPIRED | EMERGENCY
  fromAmount:     string;
  toAmount:       string;
  depositAddress: string;
  toAddress:      string;
  fromCurrency:   string;
  toCurrency:     string;
}

export async function fetchOrderStatus(id: string, token: string): Promise<OrderStatus> {
  const res = await fetch(
    `/api-server/api/swap/order-status?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`,
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Error de red" }));
    throw new Error(err.error ?? `Error al consultar estado: ${res.status}`);
  }
  return res.json();
}
