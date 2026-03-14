// @ts-nocheck — noble/secp256k1 v3 ESM resolution quirks; runtime correct
import { sign as secp256k1Sign } from "@noble/secp256k1";

const KEY = import.meta.env.VITE_TRON_API_KEY ?? "";

// Both known mainnet USDT TRC20 contract addresses (TR7... is the primary Tether contract)
export const USDT_CONTRACT  = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
export const USDT_CONTRACT2 = "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj";

// ── Fallback node list ────────────────────────────────────────────────────────
// Tried in order; if one fails (network error, timeout, 5xx) the next is used.
const NODES = [
  { base: "https://api.trongrid.io",          key: true  },
  { base: "https://tron-api.publicnode.com",   key: false },
  { base: "https://api.tronstack.io",          key: false },
  { base: "https://rpc.ankr.com/tron",         key: false },
];

// Index of the last node that responded successfully (start at 0 = primary)
let _activeNode = 0;

// Which node index is currently live (for status display)
export function getActiveNodeIndex(): number { return _activeNode; }
export function getNodeCount(): number       { return NODES.length; }
export function getActiveNodeBase(): string  { return NODES[_activeNode].base; }

// ── Resilient fetch with node fallback ───────────────────────────────────────
// Tries each node in sequence (starting from last known-good) with a 5s timeout.
// Falls back on network errors and 5xx server errors; passes through 2xx-4xx.
async function tronFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const order = NODES.map((_, i) => (i + _activeNode) % NODES.length);
  let lastErr: Error | null = null;

  for (const idx of order) {
    const node = NODES[idx];
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
      if (res.status < 500) {  // 2xx/3xx/4xx → server is alive, use result
        _activeNode = idx;
        return res;
      }
      lastErr = new Error(`Node ${idx} returned ${res.status}`);
    } catch (e: any) {
      clearTimeout(timer);
      lastErr = e;
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

// TRON Base58Check → 21-byte hex (41-prefixed)
export function tronAddrToHex(b58: string): string {
  const n = b58ToBigInt(b58);
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

    // Also check the account's trc20 array as an additional data source
    if (Array.isArray(acc.trc20)) {
      for (const entry of acc.trc20) {
        const v1 = entry[USDT_CONTRACT];
        const v2 = entry[USDT_CONTRACT2];
        if (v1 !== undefined) usdtCandidates.push(Number(v1) / 1_000_000);
        if (v2 !== undefined) usdtCandidates.push(Number(v2) / 1_000_000);
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

  const sig = secp256k1Sign(txHashBytes, privBytes, { lowS: false });
  const sigHex = sig.toCompactHex() + sig.recovery.toString(16).padStart(2, "0");

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

// ── Gas abstraction — fee estimation ─────────────────────────────────────────
// Estimates the USDT equivalent of the TRX energy cost for a USDT TRC20 transfer.
// The fee is deducted from the transfer amount so the user never needs TRX.

export interface FeeEstimate {
  feeTRX: number;       // TRX cost of the transfer (energy × price)
  feeUSDT: number;      // USDT equivalent, deducted from sent amount
  trxPriceUSDT: number; // current TRX/USDT price used for conversion
  energyUsed: number;   // energy estimate used in calculation
}

// Energy estimate — conservative value covering cold+warm USDT contract calls
const ENERGY_ESTIMATE = 65_000; // energy units

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
// Returns the fee in USDT that will be deducted from the transfer amount.
export async function estimateUSDTTransferFee(): Promise<FeeEstimate> {
  const { trxUsdt, energySun } = await fetchLivePrices();

  const feeTRX  = (ENERGY_ESTIMATE * energySun) / 1_000_000;   // energy → SUN → TRX
  const feeUSDT = parseFloat((feeTRX * trxUsdt).toFixed(2));   // TRX → USDT, 2 decimals

  return {
    feeTRX,
    feeUSDT: Math.max(0.01, feeUSDT), // floor at 1 cent
    trxPriceUSDT: trxUsdt,
    energyUsed: ENERGY_ESTIMATE,
  };
}

// ── Send TRX ─────────────────────────────────────────────────────────────────
export async function sendTRX(
  from: string, to: string, amountTrx: number, privKeyHex: string
): Promise<string> {
  if (amountTrx <= 0) throw new Error("El monto debe ser mayor a 0.");
  if (!to.startsWith("T") || to.length < 30) throw new Error("Dirección destino inválida.");

  const fromHex = tronAddrToHex(from);
  const toHex   = tronAddrToHex(to);
  const amountSun = Math.round(amountTrx * 1_000_000);

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
  if (!to.startsWith("T") || to.length < 30) throw new Error("Dirección destino inválida.");

  const fromHex     = tronAddrToHex(from);
  const contractHex = tronAddrToHex(USDT_CONTRACT);
  const toHex20    = tronAddrToHex(to).slice(2);
  const toParam    = toHex20.padStart(64, "0");
  const amtRaw     = BigInt(Math.round(amountUsdt * 1_000_000));
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
  });
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
  const fromHex     = tronAddrToHex(from);
  const contractHex = tronAddrToHex(USDT_CONTRACT);
  const toHex20     = tronAddrToHex(to).slice(2);
  const toParam     = toHex20.padStart(64, "0");
  const amtRaw      = BigInt(Math.round(amountUsdt * 1_000_000));
  const amtParam    = amtRaw.toString(16).padStart(64, "0");
  const parameter   = toParam + amtParam;

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
  });
  if (!res.ok) throw new Error(`Error creando tx USDT (${res.status})`);
  const result = await res.json();
  if (result.Error || !result.transaction) throw new Error(result.Error ?? "Error de smart contract.");

  // Sign locally — private key never leaves this function / the browser
  const tx = result.transaction;
  const txHashBytes = hexToBytes(tx.txID);
  const privBytes   = hexToBytes(privKeyHex);
  const sig = secp256k1Sign(txHashBytes, privBytes, { lowS: false });
  const sigHex = sig.toCompactHex() + sig.recovery.toString(16).padStart(2, "0");

  return { ...tx, signature: [sigHex] };
}

// ── Relay result type ─────────────────────────────────────────────────────────
export interface RelayResult {
  txId: string;
  sponsored: boolean;  // true = CoinCash covered the TRX energy cost
}

// ── Send USDT via CoinCash relay (gasless for user) ───────────────────────────
// 1. Creates TRC20 transfer transaction on TronGrid
// 2. Signs it entirely client-side (private key stays in browser memory only)
// 3. Sends ONLY the signed transaction object to the relay server
// 4. Relay attempts energy delegation (so user pays 0 TRX) then broadcasts
export async function relayUSDTTransfer(
  from: string, to: string, amountUsdt: number, privKeyHex: string
): Promise<RelayResult> {
  if (amountUsdt <= 0) throw new Error("El monto debe ser mayor a 0.");
  if (!to.startsWith("T") || to.length < 30) throw new Error("Dirección destino inválida.");

  // Step 1 + 2: build and sign locally — private key never sent anywhere
  const signedTx = await buildAndSignUSDTTx(from, to, amountUsdt, privKeyHex);

  // Step 3: POST only the signed tx to our relay
  const relayUrl = "/api-server/api/relay/usdt";
  const relayRes = await fetch(relayUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedTx, userAddress: from }),
  });

  if (!relayRes.ok) {
    const err = await relayRes.json().catch(() => ({ error: "Error de red" }));
    throw new Error(err.error ?? `Relay error ${relayRes.status}`);
  }

  const data = await relayRes.json();
  return { txId: data.txId, sponsored: data.sponsored ?? false };
}

// ── Check relay server status ─────────────────────────────────────────────────
export async function fetchRelayStatus(): Promise<{ relayerActive: boolean; sponsoredTransactions: boolean }> {
  try {
    const res = await fetch("/api-server/api/relay/status");
    if (!res.ok) return { relayerActive: false, sponsoredTransactions: false };
    return res.json();
  } catch {
    return { relayerActive: false, sponsoredTransactions: false };
  }
}
