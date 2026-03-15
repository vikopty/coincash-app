import { useEffect, useState, useCallback, useRef } from "react";
import { ArrowLeft, RefreshCw, Copy, CheckCheck, Ban, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

// ── Palette ────────────────────────────────────────────────────────────────────
const BG     = "#0B0F14";
const CARD   = "#121821";
const GREEN  = "#19C37D";
const DANGER = "#FF4D4F";
const AMBER  = "#F59E0B";
const BORDER = "rgba(255,255,255,0.06)";

// ── Types ─────────────────────────────────────────────────────────────────────
interface FrozenWallet {
  address:       string;
  chain:         string;
  freeze_balance: string;
  freeze_time:   string;
}

interface ApiResponse {
  wallets:   FrozenWallet[];
  cached:    boolean;
  stale?:    boolean;
  cacheAge:  number;
}

interface Props {
  onClose?: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function short(addr: string): string {
  if (addr.length <= 18) return addr;
  return `${addr.slice(0, 10)}…${addr.slice(-8)}`;
}

// ── Skeleton row ───────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr>
      <td className="px-3 py-3 border-b" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg animate-pulse shrink-0"
            style={{ background: "rgba(255,255,255,0.07)" }} />
          <div className="h-2.5 w-28 rounded-full animate-pulse"
            style={{ background: "rgba(255,255,255,0.06)" }} />
        </div>
      </td>
      <td className="px-3 py-3 border-b" style={{ borderColor: BORDER }}>
        <div className="h-2.5 w-20 rounded-full animate-pulse"
          style={{ background: "rgba(255,255,255,0.06)" }} />
      </td>
      <td className="px-3 py-3 border-b" style={{ borderColor: BORDER }}>
        <div className="h-2.5 w-16 rounded-full animate-pulse"
          style={{ background: "rgba(255,255,255,0.06)" }} />
      </td>
    </tr>
  );
}

// ── Wallet row ────────────────────────────────────────────────────────────────
function WalletRow({ wallet }: { wallet: FrozenWallet }) {
  const [copied, setCopied] = useState(false);
  const hasBal = wallet.freeze_balance !== "—";

  const copy = () => {
    navigator.clipboard.writeText(wallet.address).catch(() => {});
    setCopied(true);
    toast.success("Dirección copiada.");
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <tr className="transition-colors" style={{ background: "transparent" }}
      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.025)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>

      {/* Address */}
      <td className="px-3 py-3 border-b" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0"
            style={{ background: `${DANGER}15` }}>
            <Ban className="h-3.5 w-3.5" style={{ color: DANGER }} />
          </div>
          <span className="text-[11px] font-mono" style={{ color: "rgba(255,255,255,0.7)" }}>
            {short(wallet.address)}
          </span>
          <button onClick={copy}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-opacity active:opacity-50"
            style={{ background: "rgba(255,255,255,0.06)" }}>
            {copied
              ? <CheckCheck className="h-2.5 w-2.5" style={{ color: GREEN }} />
              : <Copy className="h-2.5 w-2.5" style={{ color: "rgba(255,255,255,0.3)" }} />}
          </button>
        </div>
      </td>

      {/* Frozen Balance */}
      <td className="px-3 py-3 border-b" style={{ borderColor: BORDER }}>
        <span className="text-[11px] font-mono font-semibold"
          style={{ color: hasBal ? AMBER : "rgba(255,255,255,0.2)" }}>
          {wallet.freeze_balance}
        </span>
      </td>

      {/* Freeze Date */}
      <td className="px-3 py-3 border-b" style={{ borderColor: BORDER }}>
        <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>
          {wallet.freeze_time}
        </span>
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BlacklistPage({ onClose }: Props) {
  const [wallets, setWallets]       = useState<FrozenWallet[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [meta, setMeta]             = useState<{ cached: boolean; cacheAge: number; stale?: boolean } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const countdownRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const [countdown, setCountdown] = useState(60);

  const REFRESH_INTERVAL = 60_000; // 60 seconds

  const fetchData = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api-server/api/bitrace-trc20-frozen");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ApiResponse = await res.json();
      setWallets(data.wallets ?? []);
      setMeta({ cached: data.cached, cacheAge: data.cacheAge, stale: data.stale });
      setLastUpdated(Date.now());
      setCountdown(60);
    } catch {
      setError("No se pudo obtener la lista de wallets congeladas.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load + 60s interval
  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Live countdown ticker
  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => (prev <= 1 ? 60 : prev - 1));
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [lastUpdated]);

  return (
    <div className="fixed inset-0 flex flex-col z-50" style={{ background: BG }}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 pt-10 pb-4 shrink-0">
        <button onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <ArrowLeft className="h-4 w-4" style={{ color: "rgba(255,255,255,0.6)" }} />
        </button>

        <div className="flex-1 mx-3">
          <p className="text-sm font-bold text-white leading-tight">Wallets Congeladas USDT</p>
          <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
            TRC20 · TRON Mainnet · {wallets.length} registros
          </p>
        </div>

        <button onClick={() => fetchData(true)} disabled={refreshing}
          className="flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-40"
          style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
            style={{ color: refreshing ? GREEN : "rgba(255,255,255,0.5)" }} />
        </button>
      </div>

      {/* ── Banner ─────────────────────────────────────────────────────────── */}
      <div className="mx-4 mb-3 rounded-2xl px-4 py-3.5 flex items-center gap-3 shrink-0"
        style={{ background: `${DANGER}0C`, border: `1px solid ${DANGER}25` }}>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0"
          style={{ background: `${DANGER}15` }}>
          <ShieldAlert className="h-5 w-5" style={{ color: DANGER }} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold" style={{ color: DANGER }}>Monitor de Congelamiento</p>
          <p className="text-[10px] leading-snug mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
            Fuente: eventos <em>AddedBlackList</em> on-chain · Caché 5 min
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-bold" style={{ color: DANGER }}>{loading ? "—" : wallets.length}</p>
          <p className="text-[9px]" style={{ color: "rgba(255,255,255,0.3)" }}>congeladas</p>
        </div>
      </div>

      {/* ── Status bar ────────────────────────────────────────────────────── */}
      <div className="mx-4 mb-2 flex items-center gap-2 shrink-0">
        {refreshing ? (
          <>
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                style={{ background: GREEN }} />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: GREEN }} />
            </span>
            <p className="text-[9px]" style={{ color: "rgba(255,255,255,0.25)" }}>Actualizando…</p>
          </>
        ) : lastUpdated ? (
          <>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta?.stale ? AMBER : GREEN }} />
            <p className="text-[9px]" style={{ color: "rgba(255,255,255,0.25)" }}>
              {meta?.cached ? `Caché · ${meta.cacheAge}s` : "En vivo"} · próximo en {countdown}s
            </p>
          </>
        ) : null}
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden mx-4 rounded-2xl flex flex-col"
        style={{ background: CARD, border: `1px solid ${BORDER}` }}>

        {/* Table header */}
        <div className="shrink-0">
          <table className="w-full table-fixed">
            <colgroup>
              <col style={{ width: "52%" }} />
              <col style={{ width: "28%" }} />
              <col style={{ width: "20%" }} />
            </colgroup>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                <th className="px-3 py-2.5 text-left">
                  <span className="text-[9px] font-semibold uppercase tracking-wide"
                    style={{ color: "rgba(255,255,255,0.3)" }}>Dirección</span>
                </th>
                <th className="px-3 py-2.5 text-left">
                  <span className="text-[9px] font-semibold uppercase tracking-wide"
                    style={{ color: "rgba(255,255,255,0.3)" }}>Balance Frozen</span>
                </th>
                <th className="px-3 py-2.5 text-left">
                  <span className="text-[9px] font-semibold uppercase tracking-wide"
                    style={{ color: "rgba(255,255,255,0.3)" }}>Fecha</span>
                </th>
              </tr>
            </thead>
          </table>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full table-fixed">
            <colgroup>
              <col style={{ width: "52%" }} />
              <col style={{ width: "28%" }} />
              <col style={{ width: "20%" }} />
            </colgroup>
            <tbody>
              {loading ? (
                [1,2,3,4,5,6,7,8].map(i => <SkeletonRow key={i} />)
              ) : error ? (
                <tr>
                  <td colSpan={3} className="py-16">
                    <div className="flex flex-col items-center gap-2 text-center px-6">
                      <Ban className="h-8 w-8 mx-auto" style={{ color: "rgba(255,255,255,0.1)" }} />
                      <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>{error}</p>
                      <button onClick={() => fetchData(true)}
                        className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-xl"
                        style={{ background: `${DANGER}15`, color: DANGER }}>
                        Reintentar
                      </button>
                    </div>
                  </td>
                </tr>
              ) : wallets.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-16">
                    <div className="flex flex-col items-center gap-2 text-center px-6">
                      <ShieldAlert className="h-8 w-8 mx-auto" style={{ color: "rgba(255,255,255,0.1)" }} />
                      <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.25)" }}>
                        Sin registros disponibles
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                wallets.map(w => <WalletRow key={w.address} wallet={w} />)
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div className="mx-4 my-3 px-3 py-2.5 rounded-xl flex items-start gap-2 shrink-0"
        style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${BORDER}` }}>
        <ShieldAlert className="h-3 w-3 shrink-0 mt-0.5" style={{ color: "rgba(255,255,255,0.18)" }} />
        <p className="text-[9px] leading-relaxed" style={{ color: "rgba(255,255,255,0.18)" }}>
          Datos on-chain · Contrato USDT TRC20 (<em>TR7NHq…Lj6t</em>) · Solo informativo · No constituye asesoría financiera.
        </p>
      </div>
    </div>
  );
}
