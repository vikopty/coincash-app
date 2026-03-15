// @ts-nocheck
// CoinCash Swap Engine
// Handles TRX/USDT price fetching, quote management, and swap execution.
// The relayer wallet must hold sufficient TRX and USDT to fill swaps.

import { createHash } from "node:crypto";
import { sign as secp256k1Sign } from "@noble/secp256k1";

// ── Config ────────────────────────────────────────────────────────────────────
const TRON_GRID       = "https://api.trongrid.io";
const API_KEY         = process.env.VITE_TRON_API_KEY          ?? "";
const RELAY_KEY       = process.env.TRON_RELAYER_PRIVATE_KEY   ?? "";
const _RELAY_ADDR_RAW = process.env.TRON_RELAYER_ADDRESS       ?? "";
const TREASURY_ADDR   = process.env.TREASURY_ADDRESS           ?? ""; // B58

const USDT_CONTRACT_B58 = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

// ── Normalize relayer address to 42-char hex (TronGrid always wants hex) ─────
// The env var may be set as B58 ("TLi92d...") or already as hex ("41abc...").
// Mixing B58 and hex in the same API call → "string did not match expected pattern".
function normalizeToHex(raw: string): string {
  if (!raw) return "";
  if (raw.startsWith("41") && raw.length === 42 && /^[0-9a-fA-F]+$/.test(raw)) return raw.toLowerCase();
  try { return tronB58ToHex(raw); } catch { return raw; }
}
const RELAY_ADDR = normalizeToHex(_RELAY_ADDR_RAW); // always 42-char hex

// ── Safe SUN conversion — guarantees a true integer (no floats to TronGrid) ──
function toSun(amount: number): number {
  const raw = typeof amount === "string" ? parseFloat((amount as string).replace(/,/g, ".")) : amount;
  if (!isFinite(raw) || raw <= 0) throw new Error(`Monto inválido: ${amount}`);
  return Math.trunc(Math.round(raw * 1_000_000));
}

export const SWAP_FEE_RATE      = 0.02;   // 2 % CoinCash swap fee (of output)
export const QUOTE_TTL_MS       = 60_000; // quotes expire after 60 s
export const COINCASH_FEE_USDT  = 1;      // flat CoinCash platform fee (always USDT)

// ── Helpers ───────────────────────────────────────────────────────────────────
function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function sha256(data: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha256").update(data).digest());
}

const B58_CHARS = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function tronB58ToHex(b58: string): string {
  let n = 0n;
  for (const c of b58) {
    const i = B58_CHARS.indexOf(c);
    if (i < 0) throw new Error("Invalid base58 char");
    n = n * 58n + BigInt(i);
  }
  return n.toString(16).padStart(50, "0").slice(0, 42);
}

export function tronHexToB58(hex: string): string {
  // Normalise: strip 0x, ensure 42 chars (21 bytes) with 41 prefix
  let h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length === 40) h = "41" + h;   // add TRON version byte if missing
  if (h.length !== 42) throw new Error(`Bad TRON hex length: ${h.length}`);

  const bytes = new Uint8Array(21);
  for (let i = 0; i < 21; i++) bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);

  const hash1 = sha256(bytes);
  const hash2 = sha256(hash1);

  const full = new Uint8Array(25);
  full.set(bytes);
  full.set(hash2.slice(0, 4), 21);

  let n = 0n;
  for (const b of full) n = n * 256n + BigInt(b);

  let result = "";
  while (n > 0n) { result = B58_CHARS[Number(n % 58n)] + result; n /= 58n; }
  // Each leading zero byte → one extra leading '1'
  for (const b of full) { if (b !== 0) break; result = "1" + result; }
  return result;
}

function apiHeaders(): Record<string, string> {
  return { "TRON-PRO-API-KEY": API_KEY, "Content-Type": "application/json" };
}

let _rateNext = 0;
async function rateWait(): Promise<void> {
  const now = Date.now();
  if (now < _rateNext) await new Promise<void>(r => setTimeout(r, _rateNext - now));
  _rateNext = Date.now() + 150;
}

function signTx(tx: any, privKeyHex: string): any {
  const txHashBytes = hexToBytes(tx.txID);
  const privBytes   = hexToBytes(privKeyHex);
  const sig = secp256k1Sign(txHashBytes, privBytes, { lowS: false });
  return { ...tx, signature: [sig.toCompactHex() + sig.recovery.toString(16).padStart(2, "0")] };
}

async function broadcastTx(signedTx: any): Promise<{ result: boolean; txID: string; message?: string }> {
  await rateWait();
  const res = await fetch(`${TRON_GRID}/wallet/broadcasttransaction`, {
    method: "POST", headers: apiHeaders(), body: JSON.stringify(signedTx),
  });
  if (!res.ok) throw new Error(`TronGrid broadcast ${res.status}`);
  return res.json();
}

// ── Price cache ───────────────────────────────────────────────────────────────
let _priceCache: { usd: number; ts: number } | null = null;

export async function fetchTRXPrice(): Promise<number> {
  if (_priceCache && Date.now() - _priceCache.ts < 10_000) return _priceCache.usd;
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=tron&vs_currencies=usd",
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8_000) }
    );
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const data = await res.json() as any;
    const usd = data?.tron?.usd ?? 0;
    if (!usd) throw new Error("Bad CoinGecko response");
    _priceCache = { usd, ts: Date.now() };
    console.log(`[swap] TRX price refreshed: $${usd}`);
    return usd;
  } catch (err: any) {
    console.warn("[swap] CoinGecko error:", err?.message);
    if (_priceCache) return _priceCache.usd; // use stale
    throw new Error("No se pudo obtener el precio de TRX.");
  }
}

// ── Quote store (server-side, short-lived) ────────────────────────────────────
export type SwapDirection = "usdt_to_trx" | "trx_to_usdt";

export interface SwapQuote {
  quoteId:          string;
  direction:        SwapDirection;
  inputAmount:      number;           // total user sends (USDT or TRX) to relayer
  coinCashFeeUsdt:  number;           // flat 1 USDT platform fee (deducted first for USDT→TRX, from output for TRX→USDT)
  swapAmount:       number;           // amount actually converted (inputAmount − coinCashFeeUsdt for USDT→TRX)
  outputAmount:     number;           // what user receives (after swap fee)
  feeAmount:        number;           // 2% swap fee in output token
  trxUsd:           number;           // price used
  relayerAddress:   string;           // user sends input tokens HERE (B58)
  inputToken:       "USDT" | "TRX";
  outputToken:      "USDT" | "TRX";
  expiresAt:        number;
}

const _quotes = new Map<string, SwapQuote>();

// Clean up expired quotes every minute
setInterval(() => {
  const now = Date.now();
  for (const [id, q] of _quotes) { if (q.expiresAt < now) _quotes.delete(id); }
}, 60_000);

export async function createSwapQuote(
  direction: SwapDirection,
  inputAmount: number,
): Promise<SwapQuote> {
  if (!RELAY_ADDR) throw new Error("Relayer no configurado.");
  if (inputAmount <= 0) throw new Error("Monto inválido.");

  const trxUsd    = await fetchTRXPrice();
  const relayerB58 = getRelayerB58();

  let inputToken:  "USDT" | "TRX";
  let outputToken: "USDT" | "TRX";
  let swapAmount:  number;   // amount actually converted (after CoinCash fee)
  let grossOutput: number;

  if (direction === "usdt_to_trx") {
    // ── USDT → TRX ────────────────────────────────────────────────────────────
    // 1. Deduct flat CoinCash fee from the USDT input FIRST
    // 2. Convert the remainder to TRX at the live price
    if (inputAmount <= COINCASH_FEE_USDT)
      throw new Error(`El monto mínimo para swap USDT→TRX es ${COINCASH_FEE_USDT + 0.01} USDT.`);

    inputToken  = "USDT";
    outputToken = "TRX";
    swapAmount  = inputAmount - COINCASH_FEE_USDT;   // e.g. 8 - 1 = 7 USDT
    grossOutput = swapAmount / trxUsd;               // e.g. 7 / 0.299 ≈ 23.4 TRX

  } else {
    // ── TRX → USDT ────────────────────────────────────────────────────────────
    // 1. Convert the full TRX input to USDT at the live price
    // 2. Deduct flat CoinCash fee from the USDT output
    inputToken  = "TRX";
    outputToken = "USDT";
    swapAmount  = inputAmount;                       // all TRX gets swapped
    grossOutput = inputAmount * trxUsd;              // USDT before fees
  }

  // 2 % swap fee on the gross output (in output token)
  const feeAmount = grossOutput * SWAP_FEE_RATE;
  let   outputAmount = grossOutput - feeAmount;      // after 2% swap fee

  // For TRX→USDT: additionally deduct the 1 USDT CoinCash fee from USDT output
  if (direction === "trx_to_usdt") {
    outputAmount = Math.max(0, outputAmount - COINCASH_FEE_USDT);
  }

  const quoteId = createHash("sha256")
    .update(`${Date.now()}${direction}${inputAmount}${Math.random()}`)
    .digest("hex")
    .slice(0, 16);

  const quote: SwapQuote = {
    quoteId, direction,
    inputAmount,                        // full amount user sends to relayer
    coinCashFeeUsdt: COINCASH_FEE_USDT, // always 1 USDT
    swapAmount,                         // amount after CoinCash fee (for display)
    outputAmount, feeAmount,
    trxUsd, relayerAddress: relayerB58,
    inputToken, outputToken,
    expiresAt: Date.now() + QUOTE_TTL_MS,
  };
  _quotes.set(quoteId, quote);
  return quote;
}

// ── Send TRX from relayer ─────────────────────────────────────────────────────
async function sendTRXFromRelayer(toHex: string, amountTRX: number): Promise<string> {
  if (!RELAY_KEY || !RELAY_ADDR) throw new Error("Relayer no configurado.");
  const amountSun = toSun(amountTRX);                   // ← safe integer, no floats
  await rateWait();
  const res = await fetch(`${TRON_GRID}/wallet/createtransaction`, {
    method: "POST",
    headers: apiHeaders(),
    // Both addresses must be the same format; RELAY_ADDR is always hex (normalizeToHex above)
    body: JSON.stringify({ owner_address: RELAY_ADDR, to_address: toHex, amount: amountSun }),
  });
  if (!res.ok) throw new Error(`Error creando tx TRX (${res.status})`);
  const tx = await res.json() as any;
  if (tx.Error || !tx.txID) throw new Error(tx.Error ?? "Error creando tx TRX");
  const signed = signTx(tx, RELAY_KEY);
  const result = await broadcastTx(signed);
  if (!result.result) throw new Error(result.message ?? "Broadcast TRX fallido");
  return signed.txID as string;
}

// ── Send USDT from relayer ────────────────────────────────────────────────────
async function sendUSDTFromRelayer(toHex: string, amountUSDT: number): Promise<string> {
  if (!RELAY_KEY || !RELAY_ADDR) throw new Error("Relayer no configurado.");
  const contractHex = tronB58ToHex(USDT_CONTRACT_B58);
  const toHex20     = toHex.slice(2);
  const toParam     = toHex20.padStart(64, "0");
  const amtRaw      = BigInt(toSun(amountUSDT));          // ← safe integer via toSun()
  const amtParam    = amtRaw.toString(16).padStart(64, "0");
  const parameter   = toParam + amtParam;

  await rateWait();
  const res = await fetch(`${TRON_GRID}/wallet/triggersmartcontract`, {
    method: "POST",
    headers: apiHeaders(),
    // RELAY_ADDR is normalised to hex at startup — never mix B58/hex in one request
    body: JSON.stringify({
      owner_address:     RELAY_ADDR,
      contract_address:  contractHex,
      function_selector: "transfer(address,uint256)",
      parameter,
      fee_limit:  50_000_000,
      call_value: 0,
    }),
  });
  if (!res.ok) throw new Error(`Error creando tx USDT (${res.status})`);
  const result = await res.json() as any;
  if (result.Error || !result.transaction) throw new Error(result.Error ?? "Error de smart contract.");
  const signed = signTx(result.transaction, RELAY_KEY);
  const bcast  = await broadcastTx(signed);
  if (!bcast.result) throw new Error(bcast.message ?? "Broadcast USDT fallido");
  return signed.txID as string;
}

// ── Execute swap ──────────────────────────────────────────────────────────────
export interface SwapResult {
  inputTxId:    string;
  outputTxId:   string;
  feeTxId?:     string;
  outputAmount: number;
  feeAmount:    number;
  direction:    SwapDirection;
}

export async function executeSwap(
  quoteId:     string,
  signedInputTx: any,  // pre-signed by user: sends inputToken → relayer
  userAddress: string, // B58 — receives output tokens
): Promise<SwapResult> {
  const quote = _quotes.get(quoteId);
  if (!quote) throw new Error("Cotización expirada o inválida. Solicita una nueva.");
  if (Date.now() > quote.expiresAt) {
    _quotes.delete(quoteId);
    throw new Error("La cotización ha expirado. Solicita una nueva.");
  }
  _quotes.delete(quoteId); // consume it (one-time use)

  const userHex = tronB58ToHex(userAddress);

  // 1. Broadcast user's input tx (they pay into the relayer)
  const inputBcast = await broadcastTx(signedInputTx);
  if (!inputBcast.result) {
    throw new Error(inputBcast.message ?? "Tu transacción de entrada fue rechazada por la red.");
  }
  const inputTxId = signedInputTx.txID as string;
  console.log(`[swap] Input tx broadcast OK: ${inputTxId}`);

  // Small delay to let the input tx propagate before sending output
  await new Promise(r => setTimeout(r, 2_000));

  // 2. Send output tokens to user
  let outputTxId: string;
  if (quote.direction === "usdt_to_trx") {
    outputTxId = await sendTRXFromRelayer(userHex, quote.outputAmount);
  } else {
    outputTxId = await sendUSDTFromRelayer(userHex, quote.outputAmount);
  }
  console.log(`[swap] Output tx broadcast OK: ${outputTxId}`);

  // 3. Send fee to treasury (best-effort — don't fail the swap if this fails)
  let feeTxId: string | undefined;
  if (TREASURY_ADDR && quote.feeAmount > 0.0001) {
    try {
      const treasuryHex = tronB58ToHex(TREASURY_ADDR);
      if (quote.direction === "usdt_to_trx") {
        feeTxId = await sendTRXFromRelayer(treasuryHex, quote.feeAmount);
      } else {
        feeTxId = await sendUSDTFromRelayer(treasuryHex, quote.feeAmount);
      }
      console.log(`[swap] Fee tx broadcast OK: ${feeTxId}`);
    } catch (e: any) {
      console.warn("[swap] Fee collection failed (non-fatal):", e?.message);
    }
  }

  return {
    inputTxId,
    outputTxId,
    feeTxId,
    outputAmount: quote.outputAmount,
    feeAmount:    quote.feeAmount,
    direction:    quote.direction,
  };
}

// ── Relayer availability ──────────────────────────────────────────────────────
export function isSwapAvailable(): boolean {
  return !!(RELAY_KEY && RELAY_ADDR);
}

export function getRelayerB58(): string {
  if (!RELAY_ADDR) return "";
  // If the env var was set as a Base58 address (starts with T, 34 chars), use directly
  if (RELAY_ADDR.startsWith("T") && RELAY_ADDR.length === 34) return RELAY_ADDR;
  try { return tronHexToB58(RELAY_ADDR); }
  catch { return RELAY_ADDR; }
}
