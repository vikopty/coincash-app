// ── Shared risk analysis types ────────────────────────────────────────────────

export interface RiskResult {
  score:                 number;
  level:                 "LOW" | "MODERATE" | "HIGH";
  inBlacklist:           boolean;
  interactedWithFrozen:  boolean;
  hasSuspiciousTransfer: boolean;
  walletAgeDays:         number | null;
  reasons:               string[];
  senderAddress:         string;
}

// ── Persistence (keyed by tx ID) ──────────────────────────────────────────────

const RISK_KEY  = "wg_risk_results";
const MAX_CACHE = 500; // cap entries to keep localStorage lean

type RiskStore = Record<string, RiskResult>;

function readStore(): RiskStore {
  try {
    const raw = localStorage.getItem(RISK_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeStore(store: RiskStore): void {
  try {
    // Evict oldest keys beyond MAX_CACHE (arbitrary eviction — keep last N added)
    const keys = Object.keys(store);
    if (keys.length > MAX_CACHE) {
      const evict = keys.slice(0, keys.length - MAX_CACHE);
      evict.forEach(k => delete store[k]);
    }
    localStorage.setItem(RISK_KEY, JSON.stringify(store));
  } catch {}
}

/** Persist a risk result for a given transaction ID. */
export function saveRisk(txId: string, result: RiskResult): void {
  const store = readStore();
  store[txId] = result;
  writeStore(store);
}

/** Look up a previously stored risk result for a transaction ID. */
export function loadRisk(txId: string): RiskResult | null {
  return readStore()[txId] ?? null;
}

/** Load all stored risk results as a Map<txId, RiskResult>. */
export function loadAllRisks(): Map<string, RiskResult> {
  return new Map(Object.entries(readStore()));
}

// ── Risk call (shared fetch to backend) ──────────────────────────────────────

export async function fetchRiskAnalysis(senderAddress: string): Promise<RiskResult | null> {
  try {
    const res = await fetch("/api-server/api/risk/analyze", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ senderAddress }),
      signal:  AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    return await res.json() as RiskResult;
  } catch {
    return null;
  }
}
