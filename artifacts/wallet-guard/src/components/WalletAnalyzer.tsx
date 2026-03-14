import { useState, useEffect, useRef } from "react";
import { ScanSearch, Loader2, QrCode, X, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import TronAnalysisReport from "@/components/TronAnalysisReport";
import ScanningAnimation from "@/components/ScanningAnimation";
import QRScannerDialog from "@/components/QRScannerDialog";
import { toast } from "sonner";

const GREEN  = "#19C37D";
const CARD   = "#121821";
const BORDER = "rgba(255,255,255,0.07)";

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

const TRON_RETRY_DELAY_MS = 10_000; // wait 10 s on 429
const TRON_MAX_RETRIES    = 2;

async function tronRequest(
  url: string,
  options: RequestInit = {},
  onWaiting?: (msg: string | null) => void,
): Promise<any> {
  const apiKey = import.meta.env.VITE_TRON_API_KEY;
  const baseHeaders: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (apiKey) baseHeaders["TRON-PRO-API-KEY"] = apiKey;

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
        "https://api.trongrid.io/wallet/triggerconstantcontract",
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
        const res = await fetch(`/api-server/api/blacklist/check/${encodeURIComponent(ethHex)}`);
        if (!res.ok) return false;
        const data = await res.json();
        return data.found === true;
      } catch {
        return false;
      }
    };

    // 1. Account info + blacklist checks in parallel
    const [accountData, isFrozen, isInBlacklistDB] = await Promise.all([
      tronGridFetch(`https://api.trongrid.io/v1/accounts/${encodeURIComponent(addr)}`),
      checkUsdtBlacklist(addr),
      checkBlacklistDB(),
    ]);
    const account = accountData.data?.[0];
    if (!account) throw new Error("Dirección no encontrada en la red TRON");

    // Account type
    const accountTypeMap: Record<number, string> = {
      0: "Normal",
      1: "Emisor de Token",
      2: "Contrato",
    };
    const accountType = accountTypeMap[account.account_type as number] ?? "Normal";

    // USDT balance from trc20 map: { [contractAddress]: "amount_string" }
    const trc20Map: Record<string, string> = {};
    if (Array.isArray(account.trc20)) {
      account.trc20.forEach((entry: Record<string, string>) => {
        Object.assign(trc20Map, entry);
      });
    }
    const rawUsdt = trc20Map[usdtContract];
    const balanceUSDT = rawUsdt ? parseFloat(rawUsdt) / 1e6 : 0;
    const dateCreated: number = account.create_time || Date.now();

    // 2. Transaction counts via TronGrid
    //    txIn  = transactions where addr is RECEIVER (only_to=true)
    //    txOut = transactions where addr is SENDER   (only_from=true)
    let totalTx = 0;
    let txIn = 0;
    let txOut = 0;
    try {
      const base = `https://api.trongrid.io/v1/accounts/${encodeURIComponent(addr)}/transactions?limit=1&only_confirmed=true`;
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
        `https://api.trongrid.io/v1/accounts/${encodeURIComponent(addr)}/transactions/trc20?limit=1&contract_address=${usdtContract}&only_confirmed=true`
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
      let url = `https://api.trongrid.io/v1/accounts/${encodeURIComponent(addr)}/transactions/trc20?limit=50&contract_address=${usdtContract}&only_confirmed=true`;
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

    transfers.forEach((t: any) => {
      const decimals = parseInt(t.token_info?.decimals ?? "6", 10);
      const amount = parseFloat(t.value || "0") / Math.pow(10, decimals);
      if (t.to === addr) {
        totalInUSDT += amount;
      } else if (t.from === addr) {
        totalOutUSDT += amount;
      }
      if (t.from) uniqueWallets.add(t.from);
      if (t.to) uniqueWallets.add(t.to);

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
              const decimals = parseInt(t.token_info?.decimals ?? "6", 10);
              const amount = parseFloat(t.value || "0") / Math.pow(10, decimals);
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
    };
  };

  const handleAnalyze = async (e?: React.FormEvent | React.MouseEvent) => {
    e?.preventDefault();
    const trimmed = address.trim();
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
    toast.success("Dirección escaneada correctamente");
  };

  return (
    <div className="flex flex-col w-full px-4 mx-auto" style={{ maxWidth: "640px" }}>

      {/* ── Input card ── */}
      <div className="rounded-2xl p-4 mb-4"
        style={{ background: CARD, border: `1px solid ${BORDER}`, boxShadow: "0 4px 24px rgba(0,0,0,0.45)" }}>

        {/* Address input row */}
        <div className="relative flex items-center mb-3">
          <ScanSearch className="absolute left-3.5 h-4.5 w-4.5 pointer-events-none"
            style={{ color: "rgba(255,255,255,0.3)", width: 18, height: 18 }} />
          <input
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder="Dirección TRON (T...)"
            disabled={isAnalyzing}
            className="w-full rounded-xl text-sm text-white outline-none font-mono"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${address ? GREEN + "50" : BORDER}`,
              padding: "12px 40px 12px 40px",
              transition: "border-color 0.2s",
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

        {/* Action buttons */}
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => setIsScannerOpen(true)}
            disabled={isAnalyzing}
            className="flex items-center justify-center gap-2 rounded-xl py-3 px-4 text-sm font-medium transition-opacity active:opacity-70"
            style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, color: "rgba(255,255,255,0.6)", flex: "0 0 auto" }}>
            <QrCode style={{ width: 16, height: 16 }} />
            <span>Escanear QR</span>
          </button>

          <button
            id="wg-analyze-btn"
            type="button"
            onClick={() => handleAnalyze()}
            disabled={isAnalyzing}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 px-4 text-sm font-bold text-black transition-opacity active:opacity-80"
            style={{ background: GREEN, boxShadow: isAnalyzing ? "none" : `0 0 18px ${GREEN}44` }}>
            {isAnalyzing ? (
              <>
                <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" />
                <span>Analizando...</span>
              </>
            ) : (
              <>
                <ScanSearch style={{ width: 16, height: 16 }} />
                <span>Analizar dirección</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Results (only shown after analysis) ── */}
      <div ref={resultRef} className="w-full scroll-mt-4">
        {isAnalyzing ? (
          <ScanningAnimation isAnalyzing={isAnalyzing} waitingMessage={rateLimitMessage} />
        ) : showReport && reportData ? (
          <>
            {!reportData.isFrozen && !reportData.isInBlacklistDB && reportData.riskyCounterparties.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className="mb-4 flex items-start gap-3 rounded-2xl px-4 py-3.5"
                style={{ background: `${GREEN}12`, border: `1px solid ${GREEN}35` }}
              >
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" style={{ color: GREEN }} />
                <p className="text-sm leading-snug" style={{ color: "rgba(255,255,255,0.8)" }}>
                  <span className="font-semibold text-white">Análisis completado</span> — no se detectaron riesgos en esta wallet.
                </p>
              </motion.div>
            )}
            <TronAnalysisReport reportData={reportData} />
          </>
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
