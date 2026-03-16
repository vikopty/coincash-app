import { useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import type { SavedWallet } from "@/pages/WalletsPage";
import { showRiskAlert } from "@/components/RiskAlertToast";
import { saveRisk, fetchRiskAnalysis } from "@/lib/riskCache";

// ── Config ────────────────────────────────────────────────────────────────────
const USDT_CONTRACTS   = [
  "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj",
];
const POLL_INTERVAL_MS = 10_000;
const SEEN_KEY         = "wg_monitor_seen";
const MAX_SEEN         = 2_000;
const TRON_KEY         = (import.meta as any).env?.VITE_TRON_API_KEY ?? "";

// ── Seen-tx persistence ───────────────────────────────────────────────────────
function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}
function saveSeen(seen: Set<string>): void {
  try {
    const arr = Array.from(seen);
    const trimmed = arr.length > MAX_SEEN ? arr.slice(arr.length - MAX_SEEN) : arr;
    localStorage.setItem(SEEN_KEY, JSON.stringify(trimmed));
  } catch {}
}

// ── Hex address utilities ─────────────────────────────────────────────────────
function ensure41(hex: string): string {
  if (hex.startsWith("41") && hex.length === 42) return hex;
  if (hex.length === 40) return "41" + hex;
  return hex;
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
async function hexToB58(hex41: string): Promise<string | null> {
  try {
    const h = ensure41(hex41);
    if (h.length !== 42) return null;
    const raw = new Uint8Array(h.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
    const h1  = new Uint8Array(await crypto.subtle.digest("SHA-256", raw));
    const h2  = new Uint8Array(await crypto.subtle.digest("SHA-256", h1));
    const full = new Uint8Array(25);
    full.set(raw); full.set(h2.slice(0, 4), 21);
    let n = 0n;
    for (const b of full) n = n * 256n + BigInt(b);
    let result = "";
    while (n > 0n) { result = B58[Number(n % 58n)] + result; n /= 58n; }
    let leading = 0;
    for (const b of full) { if (b !== 0) break; leading++; }
    return "1".repeat(leading) + result;
  } catch { return null; }
}

// ── Transfer shape shared by both token types ─────────────────────────────────
interface IncomingTransfer {
  txId:   string;
  sender: string;
  amount: string;
  token:  "TRX" | "USDT";
}

// ── TronGrid fetch helpers ────────────────────────────────────────────────────
function tgHeaders(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  if (TRON_KEY) h["TRON-PRO-API-KEY"] = TRON_KEY;
  return h;
}

async function fetchIncomingUSDT(address: string): Promise<IncomingTransfer[]> {
  const results: IncomingTransfer[] = [];
  for (const contract of USDT_CONTRACTS) {
    try {
      const url =
        `https://api.trongrid.io/v1/accounts/${encodeURIComponent(address)}/transactions/trc20` +
        `?contract_address=${contract}&limit=10&only_confirmed=true&order_by=block_timestamp,desc`;
      const res = await fetch(url, { headers: tgHeaders(), signal: AbortSignal.timeout(8_000) });
      if (!res.ok) continue;
      const json = await res.json();
      for (const tx of json.data ?? []) {
        if ((tx.to ?? "").toLowerCase() !== address.toLowerCase()) continue;
        const dec = tx.token_info?.decimals ?? 6;
        const n   = parseFloat(tx.value ?? "0") / Math.pow(10, dec);
        const amt = n.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " USDT";
        results.push({ txId: tx.transaction_id, sender: tx.from, amount: amt, token: "USDT" });
      }
    } catch { /* continue */ }
    await new Promise<void>(r => setTimeout(r, 100));
  }
  // De-duplicate by txId
  const seen = new Set<string>();
  return results.filter(t => { if (seen.has(t.txId)) return false; seen.add(t.txId); return true; });
}

async function fetchIncomingTRX(address: string): Promise<IncomingTransfer[]> {
  try {
    const url =
      `https://api.trongrid.io/v1/accounts/${encodeURIComponent(address)}/transactions` +
      `?limit=10&only_confirmed=true&order_by=block_timestamp,desc`;
    const res = await fetch(url, { headers: tgHeaders(), signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return [];
    const json = await res.json();
    const results: IncomingTransfer[] = [];
    for (const tx of json.data ?? []) {
      try {
        const contract = tx.raw_data?.contract?.[0];
        if (contract?.type !== "TransferContract") continue;
        const val   = contract.parameter?.value ?? {};
        const toB58 = await hexToB58(ensure41(val.to_address ?? ""));
        if (!toB58 || toB58.toLowerCase() !== address.toLowerCase()) continue;
        const fromB58 = await hexToB58(ensure41(val.owner_address ?? ""));
        if (!fromB58) continue;
        const amt = ((val.amount ?? 0) / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " TRX";
        results.push({ txId: tx.txID, sender: fromB58, amount: amt, token: "TRX" });
      } catch { /* skip malformed */ }
    }
    return results;
  } catch { return []; }
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useTransactionMonitor(
  wallets: SavedWallet[],
  onScanSender?: (address: string) => void,
): void {
  const initialSeen = loadSeen();
  const seenRef     = useRef<Set<string>>(initialSeen);
  // If seen was empty on first load → seed run (mark existing txs, don't alert)
  const seededRef   = useRef(initialSeen.size > 0);
  const walletsRef  = useRef<SavedWallet[]>(wallets);
  const onScanRef   = useRef(onScanSender);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => { onScanRef.current  = onScanSender; }, [onScanSender]);
  useEffect(() => { walletsRef.current = wallets;      }, [wallets]);

  const poll = useCallback(async () => {
    const current   = walletsRef.current;
    const isSeedRun = !seededRef.current;
    if (!current.length) return;

    for (const wallet of current) {
      // Fetch USDT + TRX incoming transfers in parallel
      const [usdtTxs, trxTxs] = await Promise.all([
        fetchIncomingUSDT(wallet.address),
        fetchIncomingTRX(wallet.address),
      ]);

      for (const tx of [...usdtTxs, ...trxTxs]) {
        if (seenRef.current.has(tx.txId)) continue;
        seenRef.current.add(tx.txId);
        saveSeen(seenRef.current);
        if (isSeedRun) continue;

        const { sender, amount, token } = tx;
        // Guard against duplicate in-flight analyses for the same sender
        if (inFlightRef.current.has(sender)) continue;
        inFlightRef.current.add(sender);

        // ── Phase 1: "scanning" notification ────────────────────────────────
        const scanId = toast.loading("Nuevo depósito detectado", {
          description: `${amount} recibido · Escaneando billetera remitente…`,
          duration:    Infinity,
          position:    "top-center",
        });

        // ── Phase 2: risk analysis → dismiss phase 1 → show result ──────────
        fetchRiskAnalysis(sender)
          .then(result => {
            if (result) saveRisk(tx.txId, result);
            toast.dismiss(scanId);
            showRiskAlert({
              walletName:   wallet.name,
              amount,
              token,
              sender,
              risk:         result,
              onScanSender: onScanRef.current,
            });
          })
          .catch(() => {
            toast.dismiss(scanId);
            toast.info(`+${amount} recibido en ${wallet.name}`, {
              description: "Análisis de riesgo no disponible temporalmente.",
              duration:    6_000,
            });
          })
          .finally(() => {
            inFlightRef.current.delete(sender);
          });
      }

      await new Promise<void>(r => setTimeout(r, 150));
    }

    seededRef.current = true;
  }, []);

  useEffect(() => {
    if (!wallets.length) return;
    const startDelay = setTimeout(() => {
      poll();
      timerRef.current = setInterval(poll, POLL_INTERVAL_MS);
    }, 3_000);
    return () => {
      clearTimeout(startDelay);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poll, wallets.length > 0]);
}
