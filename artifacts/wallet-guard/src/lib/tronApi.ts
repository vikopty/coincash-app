// @ts-nocheck — noble/secp256k1 v3 ESM resolution quirks; runtime correct
import { sign as secp256k1Sign } from "@noble/secp256k1";

const BASE = "https://api.trongrid.io";
const KEY  = import.meta.env.VITE_TRON_API_KEY ?? "";
export const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

// ── Rate limiter (100 ms gap) ─────────────────────────────────────────────────
let _next = 0;
async function rateWait(): Promise<void> {
  const now = Date.now();
  if (now < _next) await new Promise<void>(r => setTimeout(r, _next - now));
  _next = Date.now() + 110;
}

function apiHeaders(): Record<string, string> {
  return { "TRON-PRO-API-KEY": KEY, "Content-Type": "application/json" };
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

// ── Fetch account info ────────────────────────────────────────────────────────
export async function fetchAccountInfo(address: string): Promise<AccountInfo> {
  await rateWait();
  const res = await fetch(`${BASE}/v1/accounts/${address}`, {
    headers: apiHeaders(),
  });
  if (!res.ok) throw new Error(`TronGrid error ${res.status}`);
  const json = await res.json();
  if (!json.data || json.data.length === 0) {
    return { trxBalance: 0, usdtBalance: 0, activated: false };
  }
  const acc = json.data[0];
  const trxBalance = (acc.balance ?? 0) / 1_000_000;
  let usdtBalance = 0;
  if (Array.isArray(acc.trc20)) {
    for (const entry of acc.trc20) {
      if (entry[USDT_CONTRACT] !== undefined) {
        usdtBalance = Number(entry[USDT_CONTRACT]) / 1_000_000;
        break;
      }
    }
  }
  return { trxBalance, usdtBalance, activated: true };
}

// ── Fetch TRX transactions ────────────────────────────────────────────────────
export async function fetchTRXTransactions(address: string, limit = 20): Promise<TxRecord[]> {
  await rateWait();
  const res = await fetch(
    `${BASE}/v1/accounts/${address}/transactions?limit=${limit}&only_confirmed=true`,
    { headers: apiHeaders() }
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

// ── Fetch USDT (TRC20) transactions ──────────────────────────────────────────
export async function fetchUSDTTransactions(address: string, limit = 20): Promise<TxRecord[]> {
  await rateWait();
  const res = await fetch(
    `${BASE}/v1/accounts/${address}/transactions/trc20?limit=${limit}&contract_address=${USDT_CONTRACT}&only_confirmed=true`,
    { headers: apiHeaders() }
  );
  if (!res.ok) throw new Error(`TronGrid TRC20 error ${res.status}`);
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
  const res = await fetch(`${BASE}/wallet/broadcasttransaction`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify(signed),
  });
  if (!res.ok) throw new Error(`Broadcast error ${res.status}`);
  const result = await res.json();
  if (!result.result) throw new Error(result.message ?? "Transacción rechazada por la red.");
  return tx.txID;
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
  const res = await fetch(`${BASE}/wallet/createtransaction`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ owner_address: fromHex, to_address: toHex, amount: amountSun }),
  });
  if (!res.ok) throw new Error(`Error creando tx TRX (${res.status})`);
  const tx = await res.json();
  if (tx.Error) throw new Error(tx.Error);

  return broadcastSigned(tx, privKeyHex);
}

// ── Send USDT (TRC20) ─────────────────────────────────────────────────────────
export async function sendUSDT(
  from: string, to: string, amountUsdt: number, privKeyHex: string
): Promise<string> {
  if (amountUsdt <= 0) throw new Error("El monto debe ser mayor a 0.");
  if (!to.startsWith("T") || to.length < 30) throw new Error("Dirección destino inválida.");

  const fromHex     = tronAddrToHex(from);
  const contractHex = tronAddrToHex(USDT_CONTRACT);
  // ABI encode transfer(address,uint256): address is 20 bytes (drop 0x41 prefix), padded to 32
  const toHex20    = tronAddrToHex(to).slice(2); // drop "41"
  const toParam    = toHex20.padStart(64, "0");
  const amtRaw     = BigInt(Math.round(amountUsdt * 1_000_000));
  const amtParam   = amtRaw.toString(16).padStart(64, "0");
  const parameter  = toParam + amtParam;

  await rateWait();
  const res = await fetch(`${BASE}/wallet/triggersmartcontract`, {
    method: "POST",
    headers: apiHeaders(),
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
