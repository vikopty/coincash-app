// @ts-nocheck — @noble/secp256k1 v3 ESM resolution quirks; runtime correct
// TRON Relayer — energy rental + broadcast
// Private key never leaves client; this handles energy provision and relaying signed txs.
// Energy rental flow:
//   1. Check user's available energy via /wallet/getaccountresource
//   2a. If relayer has staked energy → delegate it (free, instant)
//   2b. Else → relayer freezes a small TRX amount on-the-fly to acquire energy, then delegates
//   3. Broadcast user's already-signed USDT transaction
import { createHash } from "node:crypto";
import { sign as secp256k1Sign, hashes as secp256k1Hashes } from "@noble/secp256k1";
import { sha256 } from "@noble/hashes/sha2.js";
import { hmac } from "@noble/hashes/hmac.js";
secp256k1Hashes.sha256 = sha256;
secp256k1Hashes.hmacSha256 = (key: Uint8Array, ...msgs: Uint8Array[]) => hmac(sha256, key, ...msgs);

const TRON_GRID       = "https://api.trongrid.io";
const API_KEY         = process.env.TRONGRID_API_KEY ?? process.env.VITE_TRON_API_KEY ?? "";
const RELAY_KEY       = process.env.TRON_RELAYER_PRIVATE_KEY   ?? "";
const RELAY_ADDR      = process.env.TRON_RELAYER_ADDRESS       ?? "";   // hex 41-prefix
const TREASURY_ADDR   = process.env.TREASURY_ADDRESS           ?? "";   // Base58 TRON address
export const SERVICE_FEE_USDT = 1;

console.log("[tronRelayer] TronGrid API key:", API_KEY ? `✓ loaded (${API_KEY.slice(0, 8)}…)` : "✗ MISSING");

// ── Hex error decoder — TronGrid returns errors as hex-encoded UTF-8 ──────────
function decodeHexMessage(raw: string): string {
  if (!raw) return "Transacción rechazada por la red TRON.";
  let text = raw;
  if (/^[0-9a-fA-F]{2,}$/.test(raw) && raw.length % 2 === 0) {
    try { text = Buffer.from(raw, "hex").toString("utf8").replace(/\0/g, "").trim(); } catch {}
  }
  const lo = text.toLowerCase();
  if (lo.includes("signature") || lo.includes("sign"))       return "Error firmando la transacción.";
  if (lo.includes("invalid address"))                         return "Dirección TRON inválida.";
  if (lo.includes("insufficient") || lo.includes("balance")) return "Fondos insuficientes.";
  if (lo.includes("expired") || lo.includes("tapos"))        return "Transacción expirada. Intenta de nuevo.";
  if (lo.includes("bandwidth"))                               return "Sin suficiente ancho de banda.";
  if (lo.includes("contract") || lo.includes("execution"))   return "Error en el contrato inteligente.";
  if (lo.includes("duplicate") || lo.includes("already"))    return "Transacción duplicada.";
  if (text !== raw && /^[\x20-\x7E]{3,}$/.test(text))       return text;
  return "Transacción rechazada por la red TRON.";
}

// ── Rate limiter (shared, 120ms gap) ──────────────────────────────────────────
let _next = 0;
async function rateWait(): Promise<void> {
  const now = Date.now();
  if (now < _next) await new Promise<void>(r => setTimeout(r, _next - now));
  _next = Date.now() + 120;
}

function apiHeaders(): Record<string, string> {
  return { "TRON-PRO-API-KEY": API_KEY, "Content-Type": "application/json" };
}

// TronGrid fetch with 429 retry (2 s wait, max 3 attempts)
const TG_MAX_RETRIES = 3;
const TG_RETRY_WAIT  = 2_000;
async function tgFetch(path: string, init: RequestInit = {}): Promise<Response> {
  await rateWait();
  const url = `${TRON_GRID}${path}`;
  for (let attempt = 1; attempt <= TG_MAX_RETRIES; attempt++) {
    const res = await fetch(url, { ...init, headers: apiHeaders() });
    if (res.status !== 429) return res;
    console.warn(`[tronRelayer] TronGrid 429 on ${path} (attempt ${attempt}/${TG_MAX_RETRIES}) — waiting ${TG_RETRY_WAIT}ms`);
    if (attempt < TG_MAX_RETRIES) await new Promise<void>(r => setTimeout(r, TG_RETRY_WAIT));
  }
  throw new Error(`TronGrid rate-limited (429) on ${path} after ${TG_MAX_RETRIES} attempts`);
}

// ── Hex helpers ───────────────────────────────────────────────────────────────
function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// ── Base58 decode (TRON address → 21-byte hex) ────────────────────────────────
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function tronAddrToHex(b58: string): string {
  let n = 0n;
  for (const c of b58) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error("Invalid base58 character");
    n = n * 58n + BigInt(i);
  }
  return n.toString(16).padStart(50, "0").slice(0, 42); // 21 bytes
}

// ── sha256 (Node crypto) ──────────────────────────────────────────────────────
function sha256(data: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha256").update(data).digest());
}

// ── Sign a TronGrid unsigned transaction with a private key ───────────────────
function signTx(tx: any, privKeyHex: string): any {
  const txHashBytes = hexToBytes(tx.txID);
  const privBytes   = hexToBytes(privKeyHex);
  const sigRec = secp256k1Sign(txHashBytes, privBytes, { lowS: false, prehash: false, format: 'recovered' });
  const sigHex = Array.from(sigRec.slice(1)).map((b: number) => b.toString(16).padStart(2, '0')).join('') + (sigRec[0] + 27).toString(16).padStart(2, '0');
  return { ...tx, signature: [sigHex] };
}

// ── Broadcast a signed transaction ────────────────────────────────────────────
async function broadcastTx(signedTx: any): Promise<{ result: boolean; txID: string; message?: string }> {
  const res = await tgFetch("/wallet/broadcasttransaction", {
    method: "POST",
    body: JSON.stringify(signedTx),
  });
  if (!res.ok) throw new Error(`TronGrid broadcast error ${res.status}`);
  return res.json();
}

// ── Check user's available energy ─────────────────────────────────────────────
async function getUserEnergy(userHex: string): Promise<number> {
  try {
    const res = await tgFetch("/wallet/getaccountresource", {
      method: "POST",
      body: JSON.stringify({ address: userHex }),
    });
    if (!res.ok) return 0;
    const d = await res.json() as any;
    const limit = d.EnergyLimit ?? 0;
    const used  = d.EnergyUsed  ?? 0;
    return Math.max(0, limit - used);
  } catch {
    return 0;
  }
}

// ── Energy delegation: relayer → target address ───────────────────────────────
// First tries to delegate from already-staked relayer energy.
// If the relayer has no staked energy, freezes TRX dynamically to acquire some.
// Returns true if delegation succeeded, false otherwise.
async function delegateEnergy(toHex: string): Promise<boolean> {
  if (!RELAY_KEY || !RELAY_ADDR) return false;

  // ── Attempt 1: delegate from existing staked energy ──
  try {
    const res = await tgFetch("/wallet/delegateresource", {
      method: "POST",
      body: JSON.stringify({
        owner_address:    RELAY_ADDR,
        receiver_address: toHex,
        balance:          100_000_000, // 100 TRX staked equivalent
        resource:         "ENERGY",
        lock:             false,
        visible:          false,
      }),
    });
    if (res.ok) {
      const delegateTx = await res.json() as any;
      if (!delegateTx.Error && delegateTx.txID) {
        const signed = signTx(delegateTx, RELAY_KEY);
        const result = await broadcastTx(signed);
        if (result.result) {
          console.log("[relay] Energy delegated from stake, txID:", result.txID);
          await new Promise(r => setTimeout(r, 600));
          return true;
        }
        console.warn("[relay] Stake delegation failed:", result.message);
      }
    }
  } catch (err: any) {
    console.warn("[relay] Stake delegation error:", err?.message);
  }

  // ── Attempt 2: freeze TRX dynamically to acquire energy, then delegate ──
  // Freezes the minimum TRX needed (≈32 TRX for ~65 000 energy units),
  // waits one block, then delegates to the user.
  try {
    const TRX_TO_FREEZE_SUN = 32_000_000; // 32 TRX in SUN

    const freezeRes = await tgFetch("/wallet/freezebalancev2", {
      method: "POST",
      body: JSON.stringify({
        owner_address: RELAY_ADDR,
        frozen_balance: TRX_TO_FREEZE_SUN,
        resource:       "ENERGY",
        visible:        false,
      }),
    });
    if (!freezeRes.ok) {
      console.warn("[relay] Freeze HTTP error:", freezeRes.status);
      return false;
    }
    const freezeTx = await freezeRes.json() as any;
    if (freezeTx.Error || !freezeTx.txID) {
      console.warn("[relay] Freeze tx error:", freezeTx.Error);
      return false;
    }

    const signedFreeze = signTx(freezeTx, RELAY_KEY);
    const freezeResult = await broadcastTx(signedFreeze);
    if (!freezeResult.result) {
      console.warn("[relay] Freeze broadcast failed:", freezeResult.message);
      return false;
    }
    console.log("[relay] TRX frozen for energy, txID:", freezeResult.txID);

    // Wait ~1 block for the freeze to settle before delegating
    await new Promise(r => setTimeout(r, 3_500));

    const delRes = await tgFetch("/wallet/delegateresource", {
      method: "POST",
      body: JSON.stringify({
        owner_address:    RELAY_ADDR,
        receiver_address: toHex,
        balance:          TRX_TO_FREEZE_SUN,
        resource:         "ENERGY",
        lock:             false,
        visible:          false,
      }),
    });
    if (!delRes.ok) return false;
    const delTx = await delRes.json() as any;
    if (delTx.Error || !delTx.txID) return false;

    const signedDel = signTx(delTx, RELAY_KEY);
    const delResult = await broadcastTx(signedDel);
    if (!delResult.result) {
      console.warn("[relay] Dynamic delegate failed:", delResult.message);
      return false;
    }
    console.log("[relay] Energy delegated dynamically, txID:", delResult.txID);
    await new Promise(r => setTimeout(r, 600));
    return true;
  } catch (err: any) {
    console.warn("[relay] Dynamic energy rental error:", err?.message);
    return false;
  }
}

// ── Main relay function ───────────────────────────────────────────────────────
export interface RelayResult {
  txId:      string;
  feeTxId?:  string;         // treasury fee collection tx (may be absent)
  sponsored: boolean;        // true = relayer covered the energy cost
  feeMode:   "free" | "rental" | "burn";
}

export async function relayUSDTTransfer(
  signedTx:    any,
  userAddress: string,       // TRON Base58 address of sender
  feeTx?:      any | null,   // pre-signed 1 USDT service fee tx (optional)
): Promise<RelayResult> {
  const ENERGY_NEEDED = 65_000;
  const userHex = tronAddrToHex(userAddress);

  // 1. Broadcast the service fee transaction first (1 USDT → CoinCash treasury)
  let feeTxId: string | undefined;
  if (feeTx && feeTx.txID && feeTx.raw_data && Array.isArray(feeTx.signature)) {
    try {
      console.log("[relay] Broadcasting service fee tx…");
      const feeResult = await broadcastTx(feeTx);
      if (feeResult.result) {
        feeTxId = feeTx.txID;
        console.log("[relay] Service fee collected, txID:", feeTxId);
      } else {
        // Log but don't abort — still deliver the main transfer
        console.warn("[relay] Service fee tx rejected:", feeResult.message);
      }
    } catch (err: any) {
      console.warn("[relay] Service fee broadcast error:", err?.message);
    }
  }

  // 2. Check whether the user already has enough energy for the main tx
  const availableEnergy = await getUserEnergy(userHex);
  console.log(`[relay] User energy: ${availableEnergy} / ${ENERGY_NEEDED} needed`);

  let sponsored = false;
  let feeMode: RelayResult["feeMode"] = "burn";

  if (availableEnergy >= ENERGY_NEEDED) {
    sponsored = true;
    feeMode   = "free";
    console.log("[relay] User has sufficient energy — skipping delegation.");
  } else {
    console.log("[relay] Insufficient energy — attempting energy provision…");
    sponsored = await delegateEnergy(userHex);
    feeMode   = sponsored ? "rental" : "burn";
  }

  // 3. Broadcast the user's main USDT transfer
  await rateWait();
  const result = await broadcastTx(signedTx);

  if (!result.result) {
    const rawMsg = result.message ?? "";
    console.error("[relay] broadcast rejected:", rawMsg);
    throw new Error(decodeHexMessage(rawMsg));
  }

  console.log(`[relay] Main tx OK — txID: ${signedTx.txID}, feeMode: ${feeMode}`);
  return { txId: signedTx.txID, feeTxId, sponsored, feeMode };
}

// ── Helpers for relay metadata ────────────────────────────────────────────────
export function isRelayerConfigured(): boolean {
  return !!(RELAY_KEY && RELAY_ADDR);
}

export function getTreasuryAddress(): string {
  return TREASURY_ADDR;
}

export function getServiceFeeUSDT(): number {
  return SERVICE_FEE_USDT;
}
