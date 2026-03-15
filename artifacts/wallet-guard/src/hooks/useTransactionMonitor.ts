import { useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import type { SavedWallet } from "@/pages/WalletsPage";
import { showRiskAlert } from "@/components/RiskAlertToast";
import { saveRisk, fetchRiskAnalysis } from "@/lib/riskCache";

// ── Config ────────────────────────────────────────────────────────────────────
const CONTRACTS = [
  "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", // primary USDT
  "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj", // secondary USDT
];
const POLL_INTERVAL_MS = 10_000;
const SEEN_KEY         = "wg_monitor_seen";
const MAX_SEEN         = 2_000;

// ── Seen-tx persistence ───────────────────────────────────────────────────────
function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>): void {
  try {
    const arr     = Array.from(seen);
    const trimmed = arr.length > MAX_SEEN ? arr.slice(arr.length - MAX_SEEN) : arr;
    localStorage.setItem(SEEN_KEY, JSON.stringify(trimmed));
  } catch {}
}

// ── TronGrid TRC20 transfer shape ─────────────────────────────────────────────
interface Trc20Transfer {
  transaction_id:  string;
  from:            string;
  to:              string;
  value:           string;
  block_timestamp: number;
  token_info?:     { symbol: string; decimals: number };
}

// ── TronGrid fetch (both USDT contracts, last 10 each) ────────────────────────
const TRON_KEY = import.meta.env.VITE_TRON_API_KEY ?? "";

async function fetchRecentTransfers(address: string): Promise<Trc20Transfer[]> {
  const results: Trc20Transfer[] = [];

  for (const contract of CONTRACTS) {
    try {
      const url =
        `https://api.trongrid.io/v1/accounts/${encodeURIComponent(address)}/transactions/trc20` +
        `?contract_address=${contract}&limit=10&only_confirmed=true&order_by=block_timestamp,desc`;
      const hdrs: Record<string, string> = { Accept: "application/json" };
      if (TRON_KEY) hdrs["TRON-PRO-API-KEY"] = TRON_KEY;
      const res = await fetch(url, { headers: hdrs, signal: AbortSignal.timeout(8_000) });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.data)) results.push(...json.data);
      }
    } catch {
      // Network error for this contract — continue with the other
    }
    // Small gap between requests to respect rate limits
    await new Promise<void>(r => setTimeout(r, 120));
  }

  // De-duplicate by transaction_id (same tx may appear for both contracts)
  const seen = new Set<string>();
  return results.filter(tx => {
    if (seen.has(tx.transaction_id)) return false;
    seen.add(tx.transaction_id);
    return true;
  });
}

// ── Format amount from raw micros ─────────────────────────────────────────────
function fmtAmount(raw: string, decimals = 6): string {
  const n = parseFloat(raw) / Math.pow(10, decimals);
  if (isNaN(n)) return "? USDT";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " USDT";
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useTransactionMonitor(
  wallets: SavedWallet[],
  onScanSender?: (address: string) => void,
): void {
  // Load seen set from storage; note if it was empty (fresh session)
  const initialSeen  = loadSeen();
  const seenRef      = useRef<Set<string>>(initialSeen);
  // If the seen set was empty at startup, the very first poll is a "seed" run —
  // we add tx IDs to the set but do NOT fire alerts (those are old transactions).
  const seededRef    = useRef(initialSeen.size > 0);

  const walletsRef   = useRef<SavedWallet[]>(wallets);
  const onScanRef    = useRef(onScanSender);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef  = useRef<Set<string>>(new Set());

  useEffect(() => { onScanRef.current  = onScanSender; }, [onScanSender]);
  useEffect(() => { walletsRef.current = wallets;      }, [wallets]);

  const poll = useCallback(async () => {
    const current   = walletsRef.current;
    const isSeedRun = !seededRef.current;

    if (!current.length) return;

    for (const wallet of current) {
      const transfers = await fetchRecentTransfers(wallet.address);

      for (const tx of transfers) {
        // Skip already processed
        if (seenRef.current.has(tx.transaction_id)) continue;

        // Always mark seen to prevent re-processing
        seenRef.current.add(tx.transaction_id);
        saveSeen(seenRef.current);

        // Seed run: just mark existing transactions, don't alert
        if (isSeedRun) continue;

        // Only alert for INCOMING transfers
        const recipient = (tx.to ?? "").toLowerCase();
        const myAddr    = wallet.address.toLowerCase();
        if (recipient !== myAddr) continue;

        const sender = tx.from;
        const amount = fmtAmount(tx.value, tx.token_info?.decimals ?? 6);

        // Avoid two simultaneous analyses for the same sender
        if (inFlightRef.current.has(sender)) continue;
        inFlightRef.current.add(sender);

        // Run risk analysis in background, save result, then show alert
        fetchRiskAnalysis(sender)
          .then(result => {
            if (result) {
              // Persist so TxList can read it later
              saveRisk(tx.transaction_id, result);
            }
            showRiskAlert({
              walletName:   wallet.name,
              amount,
              sender,
              risk:         result,
              onScanSender: onScanRef.current,
            });
          })
          .catch(() => {
            toast.info(`+${amount} recibido en ${wallet.name}`, {
              description: "Análisis de riesgo no disponible temporalmente.",
              duration:    6_000,
            });
          })
          .finally(() => {
            inFlightRef.current.delete(sender);
          });
      }

      // Gap between wallet checks
      await new Promise<void>(r => setTimeout(r, 150));
    }

    // Mark seeding complete after first poll
    seededRef.current = true;
  }, []);

  useEffect(() => {
    if (!wallets.length) return;

    // Small startup delay, then poll immediately + schedule repeating
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
