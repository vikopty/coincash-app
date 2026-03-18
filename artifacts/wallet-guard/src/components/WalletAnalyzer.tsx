import { useState, useEffect, useRef } from "react";
import { API_BASE } from "@/lib/apiConfig";
import { ScanSearch, Loader2, QrCode, X, CheckCircle2, AlertTriangle, ShieldAlert,
         Copy, CheckCheck, Activity, Zap, Hash, Shield } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import TronAnalysisReport from "@/components/TronAnalysisReport";
import ScanningAnimation from "@/components/ScanningAnimation";
import QRScannerDialog from "@/components/QRScannerDialog";
import { toast } from "sonner";

const GREEN  = "#19C37D";
const AMBER  = "#F59E0B";
const ORANGE = "#FF6B35";
const DANGER = "#FF4D4F";
const BLUE   = "#3B82F6";
const CARD   = "#121821";
const BORDER = "rgba(255,255,255,0.07)";

// ── Compute risk score from report data (mirrors TronAnalysisReport logic) ──────
function computeRiskScore(d: ReportData): number {
  const daysSinceCreation = (Date.now() - d.dateCreated) / 86_400_000;
  let score = 0;
  if (daysSinceCreation < 30)        score += 20;
  else if (daysSinceCreation <= 180) score += 10;
  const totalVolumeUSDT = d.totalInUSDT + d.totalOutUSDT;
  if (totalVolumeUSDT > 1_000_000)      score += 25;
  else if (totalVolumeUSDT > 100_000)   score += 15;
  if (d.uniqueWalletsCount > 200)       score += 20;
  else if (d.uniqueWalletsCount > 50)   score += 10;
  if (d.totalTx > 500)                  score += 20;
  else if (d.totalTx > 100)            score += 10;
  if (d.transfersAnalyzed > 0 && d.exchangeInteractions > d.transfersAnalyzed * 0.5) score -= 10;
  if (d.suspiciousInteractions >= 5)    score += 40;
  else if (d.suspiciousInteractions >= 2) score += 25;
  else if (d.suspiciousInteractions >= 1) score += 15;
  score = Math.max(0, Math.min(100, score));
  if (d.isFrozen) score = 100;
  return score;
}

function getRiskStatusConfig(score: number): { msg: string; color: string; Icon: React.ElementType } {
  if (score >= 80) return { msg: "Riesgo severo detectado",      color: DANGER,  Icon: ShieldAlert    };
  if (score >= 60) return { msg: "Riesgos detectados",           color: ORANGE,  Icon: ShieldAlert    };
  if (score >= 30) return { msg: "Actividad moderada detectada", color: AMBER,   Icon: AlertTriangle  };
  return            { msg: "No se detectaron riesgos",           color: GREEN,   Icon: CheckCircle2   };
}

function getScoreCardConfig(score: number): { label: string; color: string; bg: string } {
  if (score >= 80) return { label: "Riesgo severo",    color: DANGER,  bg: "linear-gradient(135deg,#200808 0%,#120404 100%)" };
  if (score >= 60) return { label: "Riesgo detectado", color: ORANGE,  bg: "linear-gradient(135deg,#1E0E04 0%,#120804 100%)" };
  if (score >= 30) return { label: "Riesgo moderado",  color: AMBER,   bg: "linear-gradient(135deg,#1A1000 0%,#0F0A00 100%)" };
  return             { label: "Bajo riesgo",           color: GREEN,   bg: "linear-gradient(135deg,#001A0E 0%,#000F08 100%)" };
}

// Daily stats helpers (localStorage)
interface DailyStats { date: string; analyzed: number; highRisk: number; }
function getDailyStats(): DailyStats {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const raw = localStorage.getItem("wg_daily_stats");
    if (raw) {
      const parsed: DailyStats = JSON.parse(raw);
      if (parsed.date === today) return parsed;
    }
  } catch {}
  return { date: today, analyzed: 0, highRisk: 0 };
}
function saveDailyStats(s: DailyStats) {
  try { localStorage.setItem("wg_daily_stats", JSON.stringify(s)); } catch {}
}

export interface RiskyCounterparty {
  address: string;
  value: number;
  label: "BLACKLISTED" | "STOLEN FUNDS" | "MONEY LAUNDERING" | "SANCTIONED WALLET" | "USDT BLACKLIST INTERACTION";
  level: "critical" | "high" | "medium";
}

interface ReportData {
  address: string;
  accountType: string;
  isFrozen: boolean;
  isInBlacklistDB: boolean;
  balanceTRX: number;
  balanceUSDT: number;
  totalTx: number;
  txIn: number;
  txOut: number;
  dateCreated: number;
  lastTxDate: number;
  totalInUSDT: number;
  totalOutUSDT: number;
  uniqueWalletsCount: number;
  transfersAnalyzed: number;
  exchangeInteractions: number;
  suspiciousInteractions: number;
  riskyCounterparties: RiskyCounterparty[];
  detectedViaTRC20?: boolean;
}

// Risk database: address → { label, level }
const RISK_DATABASE: Record<string, { label: RiskyCounterparty["label"]; level: RiskyCounterparty["level"] }> = {
  "TDCLbZMHJJYNVMLMBBf63tKRgRGUhSQMmk": { label: "MONEY LAUNDERING",  level: "critical" },
  "THFgNEBXCmXnprDRaEf4bArVLphCwN7xNh": { label: "STOLEN FUNDS",       level: "critical" },
  "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW": { label: "BLACKLISTED",        level: "critical" },
  "TUFMa4D3j3S8rWB4hWMerGJqDcNEpBjNNT": { label: "SANCTIONED WALLET",  level: "high"     },
  "TNaRAoLUyYEV2uF7GUrzSjRQTU3v6CHdXM": { label: "BLACKLISTED",        level: "critical" },
  "TXrkRCGqMjRhSfsFGr8bPxr7xHLGJFGJ2V": { label: "MONEY LAUNDERING",  level: "high"     },
  "TMuA6YqfCeX8EhbfYEg5y7S4DqzSJireY9": { label: "STOLEN FUNDS",       level: "critical" },
  "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7": { label: "SANCTIONED WALLET",  level: "high"     },
  "TYukBQZ2XXCcRCReAUgCiWScMT6SLFRFAs": { label: "MONEY LAUNDERING",  level: "medium"   },
  "TKVTdDBFUQH7FMnSQYELipCBYPegDhQwRJ": { label: "BLACKLISTED",        level: "critical" },
  "TUea3MVQCWrYmKpBHe7aWAzSHHQHBGMQqz": { label: "STOLEN FUNDS",       level: "high"     },
  "TVj7RNbeogwmasTB3fjnv75eV7teYmn74R": { label: "SANCTIONED WALLET",  level: "critical" },
  "TAPVF93s8dysXY8MzvqMoRdawoNMAPf7tL": { label: "MONEY LAUNDERING",  level: "high"     },
  "TWd4WrZ9wn84f5x1hZhL4DHvk738ns5jwH": { label: "BLACKLISTED",        level: "critical" },
  "TXmVpin9hDD7YJAuaECRiEJVXPDnuGSo9f": { label: "STOLEN FUNDS",       level: "critical" },
};

// ── TronGrid Rate Limiter ─────────────────────────────────────────────────────
// Max 10 requests/second. Each call reserves a 100 ms slot and waits its turn.
// Concurrent callers naturally queue behind each other without extra overhead.
let _nextSlot = 0;
function acquireRateLimit(): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, _nextSlot);
  _nextSlot = slot + 100; // 100 ms gap = 10 req/s
  const wait = slot - now;
  return wait > 0 ? new Promise((r) => setTimeout(r, wait)) : Promise.resolve();
}

// All TronGrid calls go through the backend proxy — API key stays on server,
// results are cached 30 s, so repeated scans never hit the rate limit.
const TRON_PROXY = `${API_BASE}/tron`;

const TRON_RETRY_DELAY_MS = 3_000; // 3 s between retries (server caches help a lot)
const TRON_MAX_RETRIES    = 3;

async function tronRequest(
  url: string,
  options: RequestInit = {},
  onWaiting?: (msg: string | null) => void,
): Promise<any> {
  const baseHeaders: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  for (let attempt = 0; attempt <= TRON_MAX_RETRIES; attempt++) {
    await acquireRateLimit();
    const res = await fetch(url, { ...options, headers: baseHeaders });

    if (res.status === 429) {
      if (attempt < TRON_MAX_RETRIES) {
        onWaiting?.("Esperando respuesta de blockchain...");
        await new Promise((r) => setTimeout(r, TRON_RETRY_DELAY_MS));
        onWaiting?.(null);
        continue;
      }
      throw new Error("Límite de velocidad alcanzado. Intente nuevamente en unos segundos.");
    }

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Error de API TronGrid (${res.status}): ${text}`);
    }

    return res.json();
  }
}

// Decode a TRON base58 address to Ethereum-style hex (0x + 20 bytes)
// Used to look up addresses in the blacklist DB which stores 0x-format from TronGrid events
const tronBase58ToEthHex = (address: string): string => {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = 0n;
  for (const c of address) {
    const idx = ALPHABET.indexOf(c);
    if (idx < 0) throw new Error("Invalid base58 character");
    n = n * 58n + BigInt(idx);
  }
  const hex = n.toString(16).padStart(50, "0");
  return "0x" + hex.slice(2, 42);
};

// Decode a base58-encoded TRON address into a 64-char ABI-encoded hex parameter
const tronBase58ToAbiParam = (address: string): string => {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = 0n;
  for (const c of address) {
    const idx = ALPHABET.indexOf(c);
    if (idx < 0) throw new Error("Invalid base58 character");
    n = n * 58n + BigInt(idx);
  }
  // 25 bytes: [0x41 prefix][20-byte address][4-byte checksum]
  const hex = n.toString(16).padStart(50, "0");
  const addressHex = hex.slice(2, 42);
  return addressHex.padStart(64, "0");
};

interface WalletAnalyzerProps {
  prefillAddress?: string;
  onAddressConsumed?: () => void;
}

const WalletAnalyzer = ({ prefillAddress, onAddressConsumed }: WalletAnalyzerProps = {}) => {
  const [address, setAddress] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStats>(() => getDailyStats());
  const [rateLimitMessage, setRateLimitMessage] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  // Sync daily stats from localStorage on mount
  useEffect(() => {
    setDailyStats(getDailyStats());
  }, []);

  // Pre-fill address from Wallets tab and auto-trigger analysis
  useEffect(() => {
    if (!prefillAddress) return;
    setAddress(prefillAddress);
    setShowReport(false);
    setReportData(null);
    onAddressConsumed?.();
    // Small delay so the input renders before we trigger the form
    setTimeout(() => {
      const btn = document.getElementById("wg-analyze-btn") as HTMLButtonElement | null;
      btn?.click();
    }, 100);
  }, [prefillAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  const isValidTronAddress = (addr: string) => {
    return /^T[a-zA-Z0-9]{33}$/.test(addr);
  };

  // Rate-limited GET wrapper — all TronGrid reads go through here
  const tronGridFetch = (url: string) =>
    tronRequest(url, { method: "GET" }, setRateLimitMessage);

  const checkUsdtBlacklist = async (addr: string): Promise<boolean> => {
    try {
      const usdtContract = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
      const param = tronBase58ToAbiParam(addr);
      const data = await tronRequest(
        `${TRON_PROXY}/wallet/triggerconstantcontract`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            owner_address: addr,
            contract_address: usdtContract,
            function_selector: "isBlackListed(address)",
            parameter: param,
            visible: true,
          }),
        },
        setRateLimitMessage,
      );
      if (!data?.result?.result) return false;
      const result: string = data.constant_result?.[0] ?? "";
      return result.length === 64 && /[^0]/.test(result);
    } catch {
      return false;
    }
  };

  const fetchTronData = async (addr: string): Promise<ReportData> => {
    if (!isValidTronAddress(addr)) {
      throw new Error("Formato de dirección TRON inválido");
    }
    const usdtContract = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

    // Helper: check DB blacklist (Ethereum hex format stored from TronGrid events)
    const checkBlacklistDB = async (): Promise<boolean> => {
      try {
        const ethHex = tronBase58ToEthHex(addr);
        const res = await fetch(`/api/blacklist/check/${encodeURIComponent(ethHex)}`);
        if (!res.ok) return false;
        const data = await res.json();
        return data.found === true;
      } catch {
        return false;
      }
    };

    // 1. Account info + blacklist checks in parallel
    const [accountData, isFrozen, isInBlacklistDB] = await Promise.all([
      tronGridFetch(`${TRON_PROXY}/v1/accounts/${encodeURIComponent(addr)}`),
      checkUsdtBlacklist(addr),
      checkBlacklistDB(),
    ]);
    const account = accountData.data?.[0];

    // Helper: query TRC20 balanceOf via triggerconstantcontract
    const fetchTRC20BalanceFallback = async (contractAddr: string): Promise<number> => {
      try {
        const param = tronBase58ToAbiParam(addr);
        const data = await tronRequest(
          `${TRON_PROXY}/wallet/triggerconstantcontract`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              owner_address: addr,
              contract_address: contractAddr,
              function_selector: "balanceOf(address)",
              parameter: param,
              visible: true,
            }),
          },
          setRateLimitMessage,
        );
        const hex: string = data?.constant_result?.[0] ?? "";
        if (!hex || hex.length !== 64) return 0;
        return Number(BigInt("0x" + hex)) / 1_000_000;
      } catch {
        return 0;
      }
    };

    const accountTypeMap: Record<number, string> = {
      0: "Normal",
      1: "Emisor de Token",
      2: "Contrato",
    };

    let accountType  = "Normal";
    let balanceTRX   = 0;
    let balanceUSDT  = 0;
    let dateCreated: number = Date.now();
    let detectedViaTRC20 = false;

    if (account) {
      // Standard path — account found via TronGrid /v1/accounts
      accountType = accountTypeMap[account.account_type as number] ?? "Normal";
      dateCreated = account.create_time || Date.now();

      // TRX balance: account.balance is in SUN (1 TRX = 1,000,000 SUN)
      balanceTRX = typeof account.balance === "number" ? account.balance / 1_000_000 : 0;

      const trc20Map: Record<string, string> = {};
      if (Array.isArray(account.trc20)) {
        account.trc20.forEach((entry: Record<string, string>) => {
          Object.assign(trc20Map, entry);
        });
      }
      const rawUsdt = trc20Map[usdtContract];
      balanceUSDT = rawUsdt ? parseFloat(rawUsdt) / 1e6 : 0;
    } else {
      // Fallback — wallet may hold USDT without any TRX history.
      // Query both known USDT contracts directly.
      const [b1, b2] = await Promise.all([
        fetchTRC20BalanceFallback("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"),
        fetchTRC20BalanceFallback("TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj"),
      ]);
      balanceUSDT = Math.max(b1, b2);
      // Even with 0 balance, the address is a valid TRON format — proceed to show the report.
      // A zero balance just means the wallet is new or has no recorded activity.
      detectedViaTRC20 = balanceUSDT > 0;
    }

    // 2. Transaction counts via TronGrid
    //    txIn  = transactions where addr is RECEIVER (only_to=true)
    //    txOut = transactions where addr is SENDER   (only_from=true)
    let totalTx = 0;
    let txIn = 0;
    let txOut = 0;
    try {
      const base = `${TRON_PROXY}/v1/accounts/${encodeURIComponent(addr)}/transactions?limit=1&only_confirmed=true`;
      const [txTotalData, txInData, txOutData] = await Promise.all([
        tronGridFetch(base),
        tronGridFetch(`${base}&only_to=true`),
        tronGridFetch(`${base}&only_from=true`),
      ]);
      totalTx = txTotalData.meta?.total || 0;
      txIn    = txInData.meta?.total   || 0;   // receiver = wallet → incoming (green)
      txOut   = txOutData.meta?.total  || 0;   // sender   = wallet → outgoing (red)
    } catch {
      // Non-fatal; continue with zeros
    }

    // 3. Latest TRC20 transfer timestamp for lastTxDate
    let lastTxDate = Date.now();
    try {
      const latestData = await tronGridFetch(
        `${TRON_PROXY}/v1/accounts/${encodeURIComponent(addr)}/transactions/trc20?limit=1&contract_address=${usdtContract}&only_confirmed=true`
      );
      const first = latestData.data?.[0];
      if (first?.block_timestamp) lastTxDate = first.block_timestamp;
    } catch {
      // Non-fatal; keep default
    }

    // 4. Fetch up to 3 pages of TRC20 USDT transfers
    let totalInUSDT = 0;
    let totalOutUSDT = 0;
    const uniqueWallets = new Set<string>();
    let transfers: any[] = [];
    let exchangeInteractions = 0;
    const riskyCounterparties: RiskyCounterparty[] = [];

    let fingerprint: string | null = null;
    const maxPages = 3;
    for (let i = 0; i < maxPages; i++) {
      let url = `${TRON_PROXY}/v1/accounts/${encodeURIComponent(addr)}/transactions/trc20?limit=50&contract_address=${usdtContract}&only_confirmed=true`;
      if (fingerprint) url += `&fingerprint=${encodeURIComponent(fingerprint)}`;
      try {
        const data = await tronGridFetch(url);
        const batch: any[] = data.data || [];
        transfers = transfers.concat(batch);
        fingerprint = data.meta?.fingerprint || null;
        if (batch.length < 50 || !fingerprint) break;
      } catch {
        break;
      }
    }

    // Derive TRC20-based tx counts — more accurate than the TRX endpoint for
    // TRC20-only wallets (which have 0 on the /transactions endpoint).
    let trc20TxIn  = 0;
    let trc20TxOut = 0;

    transfers.forEach((t: any) => {
      // USDT TRC20 always uses 6 decimals. Hardcode the divisor so we never
      // display raw uint256 blockchain values regardless of token_info content.
      const raw    = parseFloat(t.value || "0");
      const amount = Number.isFinite(raw) ? raw / 1_000_000 : 0;

      if (t.to === addr) {
        totalInUSDT  += amount;
        trc20TxIn    += 1;
      } else if (t.from === addr) {
        totalOutUSDT += amount;
        trc20TxOut   += 1;
      }
      if (t.from) uniqueWallets.add(t.from);
      if (t.to)   uniqueWallets.add(t.to);

      // Counterparty risk: check the other party against the static risk database
      const counterparty = t.to === addr ? t.from : t.to;
      if (counterparty && counterparty !== addr && RISK_DATABASE[counterparty]) {
        const risk = RISK_DATABASE[counterparty];
        const signedValue = t.to === addr ? amount : -amount;
        riskyCounterparties.push({
          address: counterparty,
          value: signedValue,
          label: risk.label,
          level: risk.level,
        });
      }
    });

    // Override TRX-based counters with TRC20 counts when the TRC20 data is
    // more informative (avoids showing "0 Transacciones" on USDT-only wallets).
    if (trc20TxIn + trc20TxOut > 0) {
      txIn    = trc20TxIn;
      txOut   = trc20TxOut;
      totalTx = trc20TxIn + trc20TxOut;
    }

    // Safety cap: prevent astronomical numbers from slipping through if the
    // blockchain ever returns unexpected raw values.
    totalInUSDT  = Number.isFinite(totalInUSDT)  ? Math.min(totalInUSDT,  1e12) : 0;
    totalOutUSDT = Number.isFinite(totalOutUSDT) ? Math.min(totalOutUSDT, 1e12) : 0;

    // Derive USDT balance from transfer sums so all 4 display values are
    // computed from the same source (prevents chain-field vs. transfer-sum drift).
    // Only override when we have actual transfer data; otherwise keep the
    // on-chain trc20 field value (accurate for wallets with no recent transfers).
    if (trc20TxIn + trc20TxOut > 0) {
      balanceUSDT = Math.max(0, totalInUSDT - totalOutUSDT);
    }

    // 5. Live USDT blacklist check for unique counterparties not already flagged
    try {
      const alreadyFlagged = new Set(riskyCounterparties.map((r) => r.address));
      const uniqueCounterparties = Array.from(
        new Set(
          transfers
            .map((t: any) => (t.to === addr ? t.from : t.to))
            .filter((cp: string) => cp && cp !== addr && !alreadyFlagged.has(cp))
        )
      ).slice(0, 30) as string[]; // cap at 30 to respect API rate limits

      const blacklistResults = await Promise.allSettled(
        uniqueCounterparties.map(async (cp) => {
          const isBl = await checkUsdtBlacklist(cp);
          return { cp, isBl };
        })
      );

      blacklistResults.forEach((result) => {
        if (result.status === "fulfilled" && result.value.isBl) {
          const cpAddr = result.value.cp;
          // Sum signed values across all transfers involving this counterparty
          let totalValue = 0;
          transfers.forEach((t: any) => {
            const cp = t.to === addr ? t.from : t.to;
            if (cp === cpAddr) {
              const raw    = parseFloat(t.value || "0");
              const amount = Number.isFinite(raw) ? raw / 1_000_000 : 0;
              totalValue += t.to === addr ? amount : -amount;
            }
          });
          riskyCounterparties.push({
            address: cpAddr,
            value: totalValue,
            label: "USDT BLACKLIST INTERACTION",
            level: "high",
          });
        }
      });
    } catch {
      // Non-fatal: continue with whatever was already collected
    }

    return {
      address: addr,
      accountType,
      isFrozen,
      isInBlacklistDB,
      balanceTRX,
      balanceUSDT,
      totalTx,
      txIn,
      txOut,
      dateCreated,
      lastTxDate,
      totalInUSDT,
      totalOutUSDT,
      uniqueWalletsCount: uniqueWallets.size,
      transfersAnalyzed: transfers.length,
      exchangeInteractions,
      suspiciousInteractions: riskyCounterparties.length,
      riskyCounterparties,
      detectedViaTRC20,
    };
  };

  const handleAnalyze = async (e?: React.FormEvent | React.MouseEvent, overrideAddr?: string) => {
    e?.preventDefault();
    const trimmed = (overrideAddr ?? address).trim();
    if (!trimmed) {
      toast.error("Por favor ingresa una dirección de billetera TRON");
      return;
    }
    if (!isValidTronAddress(trimmed)) {
      toast.error("Formato de dirección TRON inválido. Debe comenzar con T y tener 34 caracteres.");
      return;
    }

    setIsAnalyzing(true);
    setShowReport(false);
    setRateLimitMessage(null);
    try {
      const data = await fetchTronData(trimmed);
      setReportData(data);
      setShowReport(true);

      // Register scan analytics event (fire-and-forget)
      fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: trimmed }),
      }).catch(() => {});

      // Smooth-scroll to results so mobile users see them immediately
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);

      // Update daily stats
      const current = getDailyStats();
      const isHighRisk = data.isFrozen || data.isInBlacklistDB || data.riskyCounterparties.length > 0;
      const updated: DailyStats = {
        ...current,
        analyzed: current.analyzed + 1,
        highRisk: current.highRisk + (isHighRisk ? 1 : 0),
      };
      saveDailyStats(updated);
      setDailyStats(updated);
    } catch (error: any) {
      toast.error(error.message || "Error al analizar la dirección");
    } finally {
      setIsAnalyzing(false);
      setRateLimitMessage(null);
    }
  };

  const handleClear = () => {
    setAddress("");
    setReportData(null);
    setShowReport(false);
  };

  const handleScanSuccess = (result: string) => {
    setAddress(result);
    handleAnalyze(undefined, result);
  };

  const handleCopyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr).then(() => {
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    });
  };

  return (
    <div className="flex flex-col w-full px-4 mx-auto" style={{ maxWidth: "640px" }}>

      {/* ── Input card ── */}
      <div className="rounded-2xl p-4 mb-4"
        style={{
          background: "linear-gradient(160deg,#141A24 0%,#0D1117 100%)",
          border: `1px solid ${BORDER}`,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}>

        {/* Address input row */}
        <div className="relative flex items-center mb-3">
          <ScanSearch className="absolute left-3.5 pointer-events-none"
            style={{ color: "rgba(255,255,255,0.3)", width: 17, height: 17 }} />
          <input
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder="Dirección TRON (T...)"
            disabled={isAnalyzing}
            className="w-full rounded-xl text-sm text-white outline-none font-mono"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${address ? BLUE + "60" : BORDER}`,
              padding: "12px 36px 12px 38px",
              transition: "border-color 0.2s",
              letterSpacing: "0.02em",
            }}
          />
          {address && (
            <button type="button" onClick={handleClear} disabled={isAnalyzing}
              className="absolute right-3 flex items-center justify-center rounded-full"
              style={{ color: "rgba(255,255,255,0.3)", width: 20, height: 20 }}>
              <X style={{ width: 14, height: 14 }} />
            </button>
          )}
        </div>

        {/* Action buttons — stacked */}
        <div className="flex flex-col gap-2.5">
          <button
            id="wg-analyze-btn"
            type="button"
            onClick={() => handleAnalyze()}
            disabled={isAnalyzing}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 px-4 text-sm font-bold text-white transition-opacity active:opacity-80"
            style={{
              background: isAnalyzing
                ? "rgba(59,130,246,0.4)"
                : "linear-gradient(135deg,#2563EB 0%,#1D4ED8 100%)",
              boxShadow: isAnalyzing ? "none" : "0 0 20px rgba(59,130,246,0.35)",
            }}>
            {isAnalyzing ? (
              <>
                <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" />
                <span>Analizando...</span>
              </>
            ) : (
              <>
                <ScanSearch style={{ width: 16, height: 16 }} />
                <span>Analizar Wallet</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsScannerOpen(true)}
            disabled={isAnalyzing}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 px-4 text-sm font-semibold transition-opacity active:opacity-70"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${BORDER}`,
              color: "rgba(255,255,255,0.65)",
            }}>
            <QrCode style={{ width: 16, height: 16 }} />
            <span>Scan QR</span>
          </button>
        </div>
      </div>

      {/* ── Results (only shown after analysis) ── */}
      <div ref={resultRef} className="w-full scroll-mt-4">
        {isAnalyzing ? (
          <ScanningAnimation isAnalyzing={isAnalyzing} waitingMessage={rateLimitMessage} />
        ) : showReport && reportData ? (
          <AnimatePresence>
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              {/* ── Premium Risk Score Card ── */}
              {(() => {
                const score = computeRiskScore(reportData);
                const { label, color, bg } = getScoreCardConfig(score);
                return (
                  <div className="rounded-3xl p-6 mb-4"
                    style={{
                      background: bg,
                      border: `1px solid ${color}30`,
                      boxShadow: `0 8px 40px ${color}18`,
                    }}>

                    {/* Shield + score centred */}
                    <div className="flex flex-col items-center text-center mb-5">
                      {/* Icon container */}
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl mb-4"
                        style={{
                          background: `${color}18`,
                          border: `1px solid ${color}40`,
                          boxShadow: `0 0 24px ${color}22`,
                        }}>
                        <Shield style={{ color, width: 26, height: 26 }} />
                      </div>

                      {/* Label */}
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] mb-2.5"
                        style={{ color: "rgba(255,255,255,0.38)" }}>
                        RISK SCORE
                      </p>

                      {/* Big number */}
                      <div className="flex items-end leading-none mb-4">
                        <span className="font-black" style={{ fontSize: 72, color, lineHeight: 1 }}>
                          {score}
                        </span>
                        <span className="font-bold mb-1 ml-0.5" style={{ fontSize: 24, color: "rgba(255,255,255,0.28)" }}>
                          /100
                        </span>
                      </div>

                      {/* Badge */}
                      <span className="inline-flex items-center px-4 py-1.5 rounded-full text-sm font-bold"
                        style={{
                          background: `${color}1A`,
                          border: `1px solid ${color}50`,
                          color,
                          letterSpacing: "0.01em",
                        }}>
                        {label}
                      </span>
                    </div>

                    {/* Divider */}
                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", marginBottom: 16 }} />

                    {/* Wallet Address row */}
                    <p className="text-[9px] font-bold uppercase tracking-[0.18em] mb-2"
                      style={{ color: "rgba(255,255,255,0.28)" }}>
                      WALLET ADDRESS
                    </p>
                    <div className="flex items-center justify-between rounded-xl px-4 py-3"
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}>
                      <span className="text-sm font-mono text-white" style={{ letterSpacing: "0.04em" }}>
                        {reportData.address.slice(0, 8)}...{reportData.address.slice(-4)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyAddress(reportData.address)}
                        className="flex items-center justify-center rounded-lg transition-opacity active:opacity-60"
                        style={{
                          width: 32, height: 32,
                          background: "rgba(255,255,255,0.06)",
                          border: "1px solid rgba(255,255,255,0.1)",
                        }}>
                        {copiedAddress
                          ? <CheckCheck style={{ width: 14, height: 14, color: GREEN }} />
                          : <Copy style={{ width: 14, height: 14, color: "rgba(255,255,255,0.5)" }} />}
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* ── 2×2 Detail cards ── */}
              {(() => {
                const isActive = reportData.totalTx > 0 || reportData.balanceTRX > 0 || reportData.balanceUSDT > 0;
                const cards = [
                  {
                    Icon: Activity,
                    label: "NETWORK",
                    value: "TRON",
                    valueColor: "rgba(255,255,255,0.9)",
                  },
                  {
                    Icon: Activity,
                    label: "STATUS",
                    value: isActive ? "Activo" : "Inactivo",
                    valueColor: isActive ? GREEN : AMBER,
                    dot: true,
                    dotColor: isActive ? GREEN : AMBER,
                  },
                  {
                    Icon: Zap,
                    label: "TRX BALANCE",
                    value: `${reportData.balanceTRX.toFixed(2)} TRX`,
                    valueColor: "rgba(255,255,255,0.9)",
                  },
                  {
                    Icon: Hash,
                    label: "TX COUNT",
                    value: String(reportData.totalTx),
                    valueColor: "rgba(255,255,255,0.9)",
                  },
                ];
                return (
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {cards.map(({ Icon, label, value, valueColor, dot, dotColor }) => (
                      <div key={label} className="rounded-2xl p-4"
                        style={{
                          background: "linear-gradient(135deg,#141A24 0%,#0D1117 100%)",
                          border: "1px solid rgba(255,255,255,0.07)",
                          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                        }}>
                        {/* Icon + label row */}
                        <div className="flex items-center gap-1.5 mb-2.5">
                          <Icon style={{ width: 11, height: 11, color: "rgba(255,255,255,0.35)" }} />
                          <span className="text-[9px] font-bold uppercase tracking-[0.16em]"
                            style={{ color: "rgba(255,255,255,0.35)" }}>
                            {label}
                          </span>
                        </div>
                        {/* Value */}
                        <div className="flex items-center gap-1.5">
                          {dot && (
                            <span className="inline-block rounded-full"
                              style={{ width: 7, height: 7, background: dotColor, boxShadow: `0 0 6px ${dotColor}` }} />
                          )}
                          <span className="text-base font-bold" style={{ color: valueColor }}>
                            {value}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* ── Full analysis report ── */}
              <TronAnalysisReport reportData={reportData} />
            </motion.div>
          </AnimatePresence>
        ) : null}
      </div>

      <QRScannerDialog
        open={isScannerOpen}
        onOpenChange={setIsScannerOpen}
        onScanSuccess={handleScanSuccess}
      />
    </div>
  );
};

export default WalletAnalyzer;
