// @ts-nocheck
// CoinCash Swap Engine — powered by FixedFloat
// Pricing and execution delegated to FixedFloat API v2.
// Flow: user signs tx → relayer receives → relayer creates FF order
//       → relayer sends to FF deposit address → FF delivers to user wallet.

import { createHash } from "node:crypto";
import { sign as secp256k1Sign } from "@noble/secp256k1";
import { ffGetPrice, ffCreateOrder, isFFConfigured } from "./fixedFloat.js";
import { logSwapOrder, updateSwapOrderTxIds } from "./db.js";

// ── Config ────────────────────────────────────────────────────────────────────
const TRON_GRID       = "https://api.trongrid.io";
const API_KEY         = process.env.VITE_TRON_API_KEY          ?? "";
const RELAY_KEY       = process.env.TRON_RELAYER_PRIVATE_KEY   ?? "";
const _RELAY_ADDR_RAW = process.env.TRON_RELAYER_ADDRESS       ?? "";
const TREASURY_ADDR   = process.env.TREASURY_ADDRESS           ?? "";

const USDT_CONTRACT_B58 = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

// FixedFloat currency codes for TRON tokens
const FF_USDT = "USDTTRC20";
const FF_TRX  = "TRX";

// ── Normalize relayer address to 42-char hex ──────────────────────────────────
function normalizeToHex(raw: string): string {
  if (!raw) return "";
  if (raw.startsWith("41") && raw.length === 42 && /^[0-9a-fA-F]+$/.test(raw)) return raw.toLowerCase();
  try { return tronB58ToHex(raw); } catch { return raw; }
}
const RELAY_ADDR = normalizeToHex(_RELAY_ADDR_RAW);

// ── SUN conversion ────────────────────────────────────────────────────────────
function toSun(amount: number): number {
  const raw = typeof amount === "string" ? parseFloat((amount as string).replace(/,/g, ".")) : amount;
  if (!isFinite(raw) || raw <= 0) throw new Error(`Monto inválido: ${amount}`);
  return Math.trunc(Math.round(raw * 1_000_000));
}

export const COINCASH_FEE_USDT  = 1;      // flat 1 USDT CoinCash platform fee
export const QUOTE_TTL_MS       = 90_000; // quotes expire after 90 s (FF orders need time)

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
  let h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length === 40) h = "41" + h;
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

// ── Address validation ────────────────────────────────────────────────────────
function assertValidHex(addr: string, label: string): void {
  if (!addr || !/^41[0-9a-fA-F]{40}$/.test(addr))
    throw new Error(`${label} inválida: "${addr}" (debe ser hex 41-prefixed de 42 chars)`);
}
function assertValidRecipientHex(addr: string, label: string): void {
  if (!addr || !/^[0-9a-fA-F]{42}$/.test(addr))
    throw new Error(`${label} inválida: "${addr}" (debe ser hex de 42 chars)`);
}

// ── Send TRX from relayer ─────────────────────────────────────────────────────
async function sendTRXFromRelayer(toHex: string, amountTRX: number): Promise<string> {
  if (!RELAY_KEY || !RELAY_ADDR) throw new Error("Relayer no configurado.");
  const amt = Number(amountTRX);
  if (!isFinite(amt) || amt <= 0) throw new Error(`Monto TRX inválido: ${amountTRX}`);
  const amountSun = toSun(amt);
  if (!Number.isInteger(amountSun) || amountSun <= 0)
    throw new Error(`Error convirtiendo a SUN: ${amt} TRX → ${amountSun}`);

  assertValidHex(RELAY_ADDR, "Dirección del relayer (owner)");
  assertValidRecipientHex(toHex, "Dirección del destinatario (to_address)");
  console.log("[swap:sendTRXFromRelayer]", { Router: RELAY_ADDR, To: toHex, Amount: amt, AmountSun: amountSun });

  await rateWait();
  const res = await fetch(`${TRON_GRID}/wallet/createtransaction`, {
    method: "POST", headers: apiHeaders(),
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
  const amt = Number(amountUSDT);
  if (!isFinite(amt) || amt <= 0) throw new Error(`Monto USDT inválido: ${amountUSDT}`);
  const amtSun = toSun(amt);
  if (!Number.isInteger(amtSun) || amtSun <= 0)
    throw new Error(`Error convirtiendo a SUN: ${amt} USDT → ${amtSun}`);

  assertValidHex(RELAY_ADDR, "Dirección del relayer (owner)");
  assertValidRecipientHex(toHex, "Dirección del destinatario (to_address)");

  const contractHex = tronB58ToHex(USDT_CONTRACT_B58);
  const toHex20     = toHex.slice(2);
  const toParam     = toHex20.padStart(64, "0");
  const amtRaw      = BigInt(amtSun);
  const amtParam    = amtRaw.toString(16).padStart(64, "0");
  const parameter   = toParam + amtParam;

  console.log("[swap:sendUSDTFromRelayer]", {
    Router: RELAY_ADDR, Token: contractHex, To: toHex, Amount: amt, AmountSun: amtSun,
  });

  await rateWait();
  const res = await fetch(`${TRON_GRID}/wallet/triggersmartcontract`, {
    method: "POST", headers: apiHeaders(),
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

// ── Price cache (CoinGecko fallback when FF not configured) ───────────────────
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
    return usd;
  } catch (err: any) {
    console.warn("[swap] CoinGecko error:", err?.message);
    if (_priceCache) return _priceCache.usd;
    throw new Error("No se pudo obtener el precio de TRX.");
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// Format a number for FF API: remove trailing zeros, never use comma notation.
// e.g. 4.000000 → "4", 4.5 → "4.5", 0.123456 → "0.123456"
function cleanAmount(n: number): string {
  if (!isFinite(n) || n <= 0) throw new Error(`Monto inválido para la API: ${n}`);
  return parseFloat(n.toFixed(8)).toString();
}

// Validate a FixedFloat currency code — must be a non-empty string
function assertValidFFCurrency(code: string, label: string): void {
  if (!code || typeof code !== "string" || code.trim().length === 0)
    throw new Error(`Código de moneda inválido para ${label}: "${code}"`);
}

// ── Live TRX market rate (KuCoin → Kraken → CoinGecko → cached last known) ────
// FF /price endpoint is geo-blocked from datacenter IPs; use public market APIs.
let _ffRateCache: { trxUsd: number; trxPerUsdt: number; ts: number } | null = null;

async function fetchRateFromKuCoin(): Promise<number> {
  const res = await fetch(
    "https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=TRX-USDT",
    { signal: AbortSignal.timeout(8_000) }
  );
  if (!res.ok) throw new Error(`KuCoin ${res.status}`);
  const j = await res.json() as any;
  const p = parseFloat(j?.data?.price);
  if (!p || p <= 0) throw new Error("KuCoin: no price");
  return p;
}

async function fetchRateFromKraken(): Promise<number> {
  const res = await fetch(
    "https://api.kraken.com/0/public/Ticker?pair=TRXUSD",
    { signal: AbortSignal.timeout(8_000) }
  );
  if (!res.ok) throw new Error(`Kraken ${res.status}`);
  const j = await res.json() as any;
  const ticker = Object.values(j?.result ?? {})[0] as any;
  const p = parseFloat(ticker?.c?.[0]);
  if (!p || p <= 0) throw new Error("Kraken: no price");
  return p;
}

export async function fetchFFRate(): Promise<{ trxUsd: number; trxPerUsdt: number }> {
  if (_ffRateCache && Date.now() - _ffRateCache.ts < 15_000) {
    return { trxUsd: _ffRateCache.trxUsd, trxPerUsdt: _ffRateCache.trxPerUsdt };
  }

  let trxUsd = 0;

  // 1. KuCoin (most reliable, no geo-block on datacenter IPs)
  try {
    trxUsd = await fetchRateFromKuCoin();
    console.log(`[swap] KuCoin rate: 1 TRX = $${trxUsd.toFixed(5)}`);
  } catch (e1: any) {
    console.warn("[swap] KuCoin failed:", e1?.message);
    // 2. Kraken
    try {
      trxUsd = await fetchRateFromKraken();
      console.log(`[swap] Kraken rate: 1 TRX = $${trxUsd.toFixed(5)}`);
    } catch (e2: any) {
      console.warn("[swap] Kraken failed:", e2?.message);
      // 3. CoinGecko
      try {
        trxUsd = await fetchTRXPrice();
        console.log(`[swap] CoinGecko rate: 1 TRX = $${trxUsd.toFixed(5)}`);
      } catch (e3: any) {
        console.warn("[swap] CoinGecko failed:", e3?.message);
      }
    }
  }

  // 4. Use cached last-known rate rather than fail completely
  if (!trxUsd || trxUsd <= 0) {
    if (_ffRateCache) {
      console.warn("[swap] All price sources failed — using stale cache.");
      return { trxUsd: _ffRateCache.trxUsd, trxPerUsdt: _ffRateCache.trxPerUsdt };
    }
    throw new Error("No se pudo obtener el precio de TRX.");
  }

  const trxPerUsdt = 1 / trxUsd;
  _ffRateCache = { trxUsd, trxPerUsdt, ts: Date.now() };
  return { trxUsd, trxPerUsdt };
}

// ── Quote types ───────────────────────────────────────────────────────────────
export type SwapDirection = "usdt_to_trx" | "trx_to_usdt";

export interface SwapQuote {
  quoteId:          string;
  direction:        SwapDirection;
  inputAmount:      number;        // total the user sends to relayer
  coinCashFeeUsdt:  number;        // 1 USDT flat fee (always displayed in USDT)
  swapAmount:       number;        // amount actually forwarded to FixedFloat
  outputAmount:     number;        // FF estimated output (what user receives)
  feeAmount:        number;        // always 0 — FF's spread is built into the rate
  trxUsd:           number;        // implied TRX/USD rate from FF price
  trxPerUsdt:       number;        // TRX per 1 USDT (primary display unit)
  relayerAddress:   string;        // user sends tokens HERE (B58 of relayer)
  inputToken:       "USDT" | "TRX";
  outputToken:      "USDT" | "TRX";
  expiresAt:        number;
  // FF-specific
  ffFromCurrency:   string;        // e.g. "USDTTRC20"
  ffToCurrency:     string;        // e.g. "TRX"
  ffSwapAmount:     string;        // stringified amount sent to FF
}

const _quotes = new Map<string, SwapQuote>();

setInterval(() => {
  const now = Date.now();
  for (const [id, q] of _quotes) { if (q.expiresAt < now) _quotes.delete(id); }
}, 60_000);

// ── Create quote (calls FF /price) ────────────────────────────────────────────
export async function createSwapQuote(
  direction: SwapDirection,
  inputAmount: number,
): Promise<SwapQuote> {
  if (!RELAY_ADDR) throw new Error("Relayer no configurado.");
  if (inputAmount <= 0) throw new Error("Monto inválido.");

  const relayerB58 = getRelayerB58();
  const { trxUsd, trxPerUsdt } = await fetchFFRate();

  let inputToken:   "USDT" | "TRX";
  let outputToken:  "USDT" | "TRX";
  let swapAmount:   number;        // what we forward to FF
  let ffFrom:       string;
  let ffTo:         string;
  let outputAmount: number;

  if (direction === "usdt_to_trx") {
    // Deduct 1 USDT CoinCash fee first, forward the rest to FF
    if (inputAmount <= COINCASH_FEE_USDT)
      throw new Error(`El monto mínimo para swap USDT→TRX es ${COINCASH_FEE_USDT + 0.01} USDT.`);

    inputToken  = "USDT";
    outputToken = "TRX";
    swapAmount  = parseFloat((inputAmount - COINCASH_FEE_USDT).toFixed(6));
    ffFrom      = FF_USDT;
    ffTo        = FF_TRX;

    // Ask FF what this swapAmount yields
    try {
      const price   = await ffGetPrice(ffFrom, ffTo, cleanAmount(swapAmount), "float");
      outputAmount  = parseFloat(price.estimated) || (swapAmount * trxPerUsdt);
    } catch {
      outputAmount  = swapAmount * trxPerUsdt * 0.99;  // conservative local estimate
    }

  } else {
    // TRX → USDT
    // CoinCash fee charged in TRX (equivalent value to 1 USDT)
    const coinCashTRX = 1 / trxPerUsdt;  // TRX equivalent of 1 USDT
    swapAmount = Math.max(0, inputAmount - coinCashTRX);
    if (swapAmount <= 0) throw new Error("Monto TRX insuficiente para cubrir la comisión.");

    inputToken  = "TRX";
    outputToken = "USDT";
    ffFrom      = FF_TRX;
    ffTo        = FF_USDT;

    try {
      const price  = await ffGetPrice(ffFrom, ffTo, cleanAmount(swapAmount), "float");
      outputAmount = parseFloat(price.estimated) || (swapAmount * trxUsd);
    } catch {
      outputAmount = swapAmount * trxUsd * 0.99;
    }
  }

  const quoteId = createHash("sha256")
    .update(`${Date.now()}${direction}${inputAmount}${Math.random()}`)
    .digest("hex")
    .slice(0, 16);

  const quote: SwapQuote = {
    quoteId, direction,
    inputAmount,
    coinCashFeeUsdt: COINCASH_FEE_USDT,
    swapAmount,
    outputAmount,
    feeAmount:  0,  // FF includes spread in the rate — no separate CoinCash swap fee
    trxUsd, trxPerUsdt,
    relayerAddress: relayerB58,
    inputToken, outputToken,
    expiresAt: Date.now() + QUOTE_TTL_MS,
    ffFromCurrency: ffFrom,
    ffToCurrency:   ffTo,
    ffSwapAmount:   cleanAmount(swapAmount),
  };
  _quotes.set(quoteId, quote);
  return quote;
}

// ── Result types ──────────────────────────────────────────────────────────────
export interface SwapResult {
  inputTxId:      string;    // user → relayer
  relayTxId:      string;    // relayer → FF deposit address
  ffOrderId:      string;    // FixedFloat order ID (for status tracking)
  ffDepositAddr:  string;    // FF deposit address (for reference)
  outputAmount:   number;    // FF's expected output amount
  feeAmount:      number;    // always 0 in FF flow
  direction:      SwapDirection;
}

// ── Execute swap (FF-powered) ─────────────────────────────────────────────────
export async function executeSwap(
  quoteId:       string,
  signedInputTx: any,   // pre-signed by user: sends inputToken → relayer
  userAddress:   string, // B58 — receives output tokens FROM FF
): Promise<SwapResult> {
  const quote = _quotes.get(quoteId);
  if (!quote) throw new Error("Cotización expirada o inválida. Solicita una nueva.");
  if (Date.now() > quote.expiresAt) {
    _quotes.delete(quoteId);
    throw new Error("La cotización ha expirado. Solicita una nueva.");
  }
  _quotes.delete(quoteId); // one-time use

  // Validate user address — must be a valid TRON B58 or hex address
  if (!userAddress || typeof userAddress !== "string" || userAddress.trim().length === 0)
    throw new Error("Se requiere una dirección de destino válida (parámetro: address).");
  if (!userAddress.startsWith("T") && !/^41[0-9a-fA-F]{40}$/.test(userAddress))
    throw new Error(`Dirección del usuario inválida: "${userAddress}". Debe ser una dirección TRON válida.`);

  // Validate FF currency codes
  assertValidFFCurrency(quote.ffFromCurrency, "fromCurrency");
  assertValidFFCurrency(quote.ffToCurrency,   "toCurrency");

  // Clean the swap amount: strip trailing zeros, ensure numeric string (e.g. "4" not "4.000000")
  const ffAmountStr = cleanAmount(quote.swapAmount);

  const userHex = tronB58ToHex(userAddress);

  console.log("[swap:executeSwap]", {
    QuoteId:    quoteId,
    Direction:  quote.direction,
    UserB58:    userAddress,
    SwapAmount: quote.swapAmount,
    FFAmountStr: ffAmountStr,
    FFFrom:     quote.ffFromCurrency,
    FFTo:       quote.ffToCurrency,
  });

  // 1. Create swap order BEFORE broadcasting user tx (get deposit address first)
  //    The swap provider delivers output tokens directly to user's wallet.
  console.log("[swap] Creating swap order…");
  const ffOrder = await ffCreateOrder(
    quote.ffFromCurrency,
    quote.ffToCurrency,
    ffAmountStr,
    userAddress,   // swap provider delivers output here — required field
    "float",
  );
  if (!ffOrder.depositAddress)
    throw new Error("El proveedor de swap no devolvió una dirección de depósito.");

  console.log("[swap] FF order created:", {
    id:      ffOrder.id,
    deposit: ffOrder.depositAddress,
    expect:  ffOrder.expectedOutput,
  });

  // 2. Log order to DB (pending — no tx IDs yet)
  await logSwapOrder({
    ffOrderId:      ffOrder.id,
    ffToken:        ffOrder.token,
    userWallet:     userAddress,
    direction:      quote.direction,
    inputToken:     quote.inputToken,
    inputAmount:    quote.inputAmount,
    outputToken:    quote.outputToken,
    expectedOutput: parseFloat(ffOrder.expectedOutput) || quote.outputAmount,
    depositAddress: ffOrder.depositAddress,
    coinCashFee:    quote.coinCashFeeUsdt,
    status:         "pending",
  });

  // 3. Broadcast user's input tx (user → relayer)
  const inputBcast = await broadcastTx(signedInputTx);
  if (!inputBcast.result)
    throw new Error(inputBcast.message ?? "Tu transacción de entrada fue rechazada por la red.");

  const inputTxId = signedInputTx.txID as string;
  console.log(`[swap] Input tx broadcast OK: ${inputTxId}`);

  // 4. Small delay for input tx propagation
  await new Promise(r => setTimeout(r, 2_000));

  // 5. Send swapAmount from relayer → FF deposit address
  const depositHex = tronB58ToHex(ffOrder.depositAddress);
  let relayTxId: string;

  console.log("[swap] Sending to FF deposit:", {
    Wallet:  "Relayer",
    To:      ffOrder.depositAddress,
    Token:   quote.ffFromCurrency,
    Amount:  quote.swapAmount,
  });

  if (quote.direction === "usdt_to_trx") {
    // Relayer sends USDT to FF deposit address
    relayTxId = await sendUSDTFromRelayer(depositHex, quote.swapAmount);
  } else {
    // Relayer sends TRX to FF deposit address
    relayTxId = await sendTRXFromRelayer(depositHex, quote.swapAmount);
  }
  console.log(`[swap] Relay tx broadcast OK: ${relayTxId}`);

  // 6. Update DB with tx IDs
  await updateSwapOrderTxIds(ffOrder.id, inputTxId, relayTxId, "sent");

  return {
    inputTxId,
    relayTxId,
    ffOrderId:     ffOrder.id,
    ffDepositAddr: ffOrder.depositAddress,
    outputAmount:  parseFloat(ffOrder.expectedOutput) || quote.outputAmount,
    feeAmount:     0,
    direction:     quote.direction,
  };
}

// ── Availability ──────────────────────────────────────────────────────────────
export function isSwapAvailable(): boolean {
  return !!(RELAY_KEY && RELAY_ADDR && isFFConfigured());
}

export function getRelayerB58(): string {
  if (!RELAY_ADDR) return "";
  try {
    const b58 = tronHexToB58(RELAY_ADDR);
    if (!b58.startsWith("T") || b58.length !== 34)
      throw new Error(`tronHexToB58 produced invalid B58: "${b58}"`);
    return b58;
  } catch (e) {
    console.error("[swap] getRelayerB58 failed:", e);
    return "";
  }
}

// ── External swap order (no relayer — user sends directly to FF deposit addr) ──
// The user provides their destination address; we create the FF order and return
// the deposit address so the user can send funds directly from any wallet/exchange.
export interface ExternalSwapOrder {
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

export async function createExternalSwapOrder(
  direction:          SwapDirection,
  inputAmount:        number,
  destinationAddress: string,
): Promise<ExternalSwapOrder> {
  // Validate destination address — must be a TRON B58 address
  const dest = (destinationAddress ?? "").trim();
  if (!dest || !dest.startsWith("T") || dest.length < 30 || dest.length > 36)
    throw new Error("Dirección TRON de destino inválida. Debe empezar con T y tener entre 30 y 36 caracteres.");

  const amt = parseFloat(String(inputAmount).replace(/,/g, "."));
  if (!amt || amt <= 0)
    throw new Error("El monto debe ser un número positivo.");

  const ffFrom = direction === "usdt_to_trx" ? FF_USDT : FF_TRX;
  const ffTo   = direction === "usdt_to_trx" ? FF_TRX   : FF_USDT;

  assertValidFFCurrency(ffFrom, "fromCurrency");
  assertValidFFCurrency(ffTo,   "toCurrency");

  const amtStr = cleanAmount(amt);

  console.log("[swap:external] Creating order", { direction, amt, amtStr, dest, ffFrom, ffTo });

  const { trxUsd, trxPerUsdt } = await fetchFFRate();

  const ffOrder = await ffCreateOrder(ffFrom, ffTo, amtStr, dest, "float");
  if (!ffOrder.depositAddress)
    throw new Error("El proveedor de swap no devolvió una dirección de depósito.");

  console.log("[swap:external] Order created:", {
    id:      ffOrder.id,
    deposit: ffOrder.depositAddress,
    expect:  ffOrder.expectedOutput,
  });

  return {
    orderId:            ffOrder.id,
    ffToken:            ffOrder.token,
    depositAddress:     ffOrder.depositAddress,
    expectedOutput:     parseFloat(ffOrder.expectedOutput) || 0,
    fromAmount:         ffOrder.fromAmount || amtStr,
    fromToken:          direction === "usdt_to_trx" ? "USDT" : "TRX",
    toToken:            direction === "usdt_to_trx" ? "TRX"  : "USDT",
    destinationAddress: dest,
    direction,
    trxUsd,
    trxPerUsdt,
    inputAmount:        amt,
  };
}
