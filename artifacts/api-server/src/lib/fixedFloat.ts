// @ts-nocheck
// FixedFloat API v2 client
// Auth: X-API-KEY header + X-API-SIGN header (HMAC-SHA256 of body/query-string with secret)
// Docs: https://fixedfloat.com/api

import { createHmac } from "node:crypto";

const FF_BASE       = "https://ff.io/api/v2";
const FF_API_KEY    = process.env.FIXEDFLOAT_API_KEY    ?? "";
const FF_API_SECRET = process.env.FIXEDFLOAT_API_SECRET ?? "";

export function isFFConfigured(): boolean {
  return !!(FF_API_KEY && FF_API_SECRET);
}

function ffSign(data: string): string {
  return createHmac("sha256", FF_API_SECRET).update(data).digest("hex");
}

function ffHeaders(signData: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Accept":       "application/json",
    "X-API-KEY":    FF_API_KEY,
    "X-API-SIGN":   ffSign(signData),
  };
}

// ── Shared error extractor ────────────────────────────────────────────────────
function ffError(json: any, context: string): never {
  const code = String(json?.code ?? "?");
  const msg  = json?.msg ?? "Unknown FixedFloat error";
  throw new Error(`FixedFloat [${context}] code=${code}: ${msg}`);
}

// ── GET /price ────────────────────────────────────────────────────────────────
// Returns current exchange rate estimate for a given amount.
// from / to: currency codes (e.g. "USDTTRC20", "TRX")
// amount: amount of `from` currency to exchange
// type: "float" (variable rate) | "fixed" (locked rate)

export interface FFPriceResult {
  /** Exchange rate: how many `to` units per 1 `from` unit */
  price:     string;
  /** Confirmed input amount (echo of request) */
  amount:    string;
  /** Estimated output amount after exchange */
  estimated: string;
  /** Minimum input amount accepted */
  minAmount: string;
  /** Maximum input amount accepted */
  maxAmount: string;
  /** Raw response data for debugging */
  raw:       unknown;
}

export async function ffGetPrice(
  from:   string,
  to:     string,
  amount: string,
  type:   "float" | "fixed" = "float",
): Promise<FFPriceResult> {
  if (!isFFConfigured()) throw new Error("FixedFloat no configurado (faltan FIXEDFLOAT_API_KEY / FIXEDFLOAT_API_SECRET).");

  const qs = `from=${from}&to=${to}&amount=${amount}&type=${type}`;
  const res = await fetch(`${FF_BASE}/price?${qs}`, {
    headers: ffHeaders(qs),
    signal:  AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`FixedFloat /price HTTP ${res.status}`);

  const json = await res.json() as any;
  if (String(json?.code) !== "0") ffError(json, "price");

  const d = json.data ?? {};
  // FF v2 response structure: { from: { amount, rate, min, max }, to: { amount, rate } }
  // Fields may also be at top level depending on version. Handle both shapes.
  const fromData = d.from ?? {};
  const toData   = d.to   ?? {};

  return {
    price:     String(d.price     ?? fromData.rate  ?? toData.rate  ?? "0"),
    amount:    String(d.amount    ?? fromData.amount ?? amount),
    estimated: String(d.estimated ?? toData.amount  ?? "0"),
    minAmount: String(d.minAmount ?? fromData.min   ?? "0"),
    maxAmount: String(d.maxAmount ?? fromData.max   ?? "0"),
    raw:       json.data,
  };
}

// ── POST /create ──────────────────────────────────────────────────────────────
// Creates a swap order. Returns the deposit address to which the sender must
// send `amount` of `from` currency. FF then delivers `to` currency to `address`.

export interface FFOrderResult {
  /** FixedFloat order ID */
  id:             string;
  /** Auth token for the order status page */
  token:          string;
  /** Current status (e.g. "NEW", "PENDING", "EXCHANGE", "DONE") */
  status:         string;
  /** Address where the sender must deposit `from` tokens */
  depositAddress: string;
  /** Optional deposit memo/tag (e.g. for XRP/MEMO chains) */
  depositTag:     string | null;
  /** Amount that must be sent to depositAddress */
  fromAmount:     string;
  /** Estimated output amount that will be delivered to `address` */
  expectedOutput: string;
  /** Currency being sent */
  fromCurrency:   string;
  /** Currency being received */
  toCurrency:     string;
  /** Raw response data */
  raw:            unknown;
}

export async function ffCreateOrder(
  from:    string,
  to:      string,
  amount:  string,
  address: string,
  type:    "float" | "fixed" = "float",
): Promise<FFOrderResult> {
  if (!isFFConfigured()) throw new Error("FixedFloat no configurado.");

  const body = JSON.stringify({ from, to, amount, address, type });
  const res  = await fetch(`${FF_BASE}/create`, {
    method:  "POST",
    headers: ffHeaders(body),
    body,
    signal:  AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`FixedFloat /create HTTP ${res.status}`);

  const json = await res.json() as any;
  if (String(json?.code) !== "0") ffError(json, "create");

  const d    = json.data ?? {};
  const from_ = d.from ?? {};
  const to_   = d.to   ?? {};

  return {
    id:             String(d.id            ?? ""),
    token:          String(d.token         ?? ""),
    status:         String(d.status        ?? "NEW"),
    depositAddress: String(from_.address   ?? ""),
    depositTag:     from_.tag ?? null,
    fromAmount:     String(from_.amount    ?? amount),
    expectedOutput: String(to_.amount      ?? "0"),
    fromCurrency:   String(from_.currency  ?? from),
    toCurrency:     String(to_.currency    ?? to),
    raw:            json.data,
  };
}
