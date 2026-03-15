import { useEffect, useState, useCallback, useRef } from "react";
import { ArrowLeft, RefreshCw, TrendingUp, TrendingDown, Minus, Info } from "lucide-react";

// ── Palette ────────────────────────────────────────────────────────────────────
const BG     = "#0B0F14";
const CARD   = "#121821";
const GREEN  = "#19C37D";
const DANGER = "#FF4D4F";
const AMBER  = "#F59E0B";
const BLUE   = "#3B82F6";
const BORDER = "rgba(255,255,255,0.06)";
const SHADOW = "0 4px 24px rgba(0,0,0,0.45)";

interface Props {
  onClose?: () => void;
}

interface TRMData {
  today:     number; // current rate USD → COP
  yesterday: number; // previous day rate
  change:    number; // absolute change
  changePct: number; // % change
  fetchedAt: number; // timestamp
}

// ── Format COP ────────────────────────────────────────────────────────────────
function fmtCOP(n: number): string {
  return n.toLocaleString("es-CO", { maximumFractionDigits: 2 });
}

// ── Yesterday date string (YYYY-MM-DD) ───────────────────────────────────────
function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ── Fetch from fawazahmed0 CDN (free, no API key, historical support) ─────────
async function fetchRate(date: "latest" | string): Promise<number> {
  const url =
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/usd.json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const rate = data?.usd?.cop;
  if (!rate || typeof rate !== "number") throw new Error("COP rate not found");
  return rate;
}

// ── Fallback: open.er-api.com ─────────────────────────────────────────────────
async function fetchRateFallback(): Promise<number> {
  const res = await fetch(
    "https://open.er-api.com/v6/latest/USD",
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const rate = data?.rates?.COP;
  if (!rate || typeof rate !== "number") throw new Error("COP rate not found");
  return rate;
}

// ── Main TRM fetch (today + yesterday → delta) ────────────────────────────────
async function fetchTRM(): Promise<TRMData> {
  let today: number;
  try {
    today = await fetchRate("latest");
  } catch {
    today = await fetchRateFallback();
  }

  let yesterday: number;
  try {
    yesterday = await fetchRate(yesterdayStr());
  } catch {
    // Fallback: yesterday ≈ today (no variation known)
    yesterday = today;
  }

  const change    = today - yesterday;
  const changePct = yesterday > 0 ? (change / yesterday) * 100 : 0;

  return { today, yesterday, change, changePct, fetchedAt: Date.now() };
}

// ── Skeleton pill ─────────────────────────────────────────────────────────────
function Skeleton({ w, h = 4 }: { w: number; h?: number }) {
  return (
    <div className={`animate-pulse rounded-full`}
      style={{ width: w, height: h * 4, background: "rgba(255,255,255,0.07)" }} />
  );
}

// ── Change chip ───────────────────────────────────────────────────────────────
function ChangeChip({ pct }: { pct: number }) {
  const up    = pct > 0;
  const flat  = Math.abs(pct) < 0.005;
  const color = flat ? BLUE : up ? GREEN : DANGER;
  const Icon  = flat ? Minus : up ? TrendingUp : TrendingDown;
  const label = flat
    ? "Sin cambio"
    : `${up ? "+" : ""}${pct.toFixed(2)}%`;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold"
      style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}>
      <Icon className="h-4 w-4" />
      {label}
    </span>
  );
}

// ── Info card ─────────────────────────────────────────────────────────────────
function InfoCard({ label, value, sub, color = "rgba(255,255,255,0.85)" }:
  { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="flex-1 flex flex-col gap-1 rounded-2xl p-4"
      style={{ background: CARD, border: `1px solid ${BORDER}`, boxShadow: SHADOW }}>
      <p className="text-[10px] font-semibold uppercase tracking-widest"
        style={{ color: "rgba(255,255,255,0.3)" }}>{label}</p>
      <p className="text-lg font-bold leading-tight" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>{sub}</p>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function TRMPage({ onClose }: Props) {
  const [data, setData]           = useState<TRMData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [countdown, setCountdown] = useState(60);
  const countdownRef              = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    setError(null);
    try {
      const result = await fetchTRM();
      setData(result);
      setCountdown(60);
    } catch {
      setError("No se pudo obtener la TRM. Verifica tu conexión.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load + 60s interval
  useEffect(() => {
    load();
    const t = setInterval(() => load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  // Countdown ticker
  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown(p => (p <= 1 ? 60 : p - 1));
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [data]);

  const isUp   = (data?.changePct ?? 0) > 0;
  const heroColor = !data ? GREEN
    : Math.abs(data.changePct) < 0.005 ? BLUE
    : isUp ? GREEN : DANGER;

  return (
    <div className="flex flex-col" style={{ background: BG, height: "100dvh", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)" }}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 pt-10 pb-4 shrink-0">
        <button onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <ArrowLeft className="h-4 w-4" style={{ color: "rgba(255,255,255,0.6)" }} />
        </button>

        <div className="flex-1 mx-3">
          <p className="text-sm font-bold text-white leading-tight">TRM Colombia 🇨🇴</p>
          <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
            Tasa Representativa del Mercado · USD → COP
          </p>
        </div>

        <button onClick={() => load(true)} disabled={refreshing}
          className="flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-40"
          style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
            style={{ color: refreshing ? GREEN : "rgba(255,255,255,0.5)" }} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 flex flex-col gap-4">

        {/* ── Hero TRM card ─────────────────────────────────────────────── */}
        <div className="rounded-3xl p-6 relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, #0e1e2e 0%, #0d1a14 100%)`,
            border: `1px solid ${BORDER}`,
            boxShadow: SHADOW,
          }}>

          {/* Background glow */}
          <div className="absolute -top-12 -right-12 h-48 w-48 rounded-full pointer-events-none"
            style={{ background: `radial-gradient(circle, ${heroColor}22 0%, transparent 70%)` }} />

          {/* Label */}
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl"
              style={{ background: `${heroColor}18` }}>
              <TrendingUp className="h-4 w-4" style={{ color: heroColor }} />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: "rgba(255,255,255,0.35)" }}>TRM HOY</p>
              <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.2)" }}>
                1 USD =
              </p>
            </div>
          </div>

          {/* Main rate */}
          {loading ? (
            <div className="mb-4">
              <Skeleton w={220} h={12} />
            </div>
          ) : error ? (
            <p className="text-2xl font-bold mb-4" style={{ color: DANGER }}>—</p>
          ) : (
            <div className="mb-4">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-extrabold tracking-tight text-white">
                  ${fmtCOP(data!.today)}
                </span>
                <span className="text-lg font-semibold" style={{ color: "rgba(255,255,255,0.4)" }}>COP</span>
              </div>
              <p className="text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.25)" }}>
                Equivale a {(1 / data!.today * 1e6).toFixed(4)} USD por millón de pesos
              </p>
            </div>
          )}

          {/* Variation chip */}
          {!loading && !error && data && (
            <ChangeChip pct={data.changePct} />
          )}
          {loading && <Skeleton w={100} h={5} />}
        </div>

        {/* ── Stats row ──────────────────────────────────────────────────── */}
        <div className="flex gap-3">
          {loading ? (
            <>
              <div className="flex-1 rounded-2xl p-4" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                <Skeleton w={60} h={2} /><div className="mt-2"><Skeleton w={100} h={5} /></div>
              </div>
              <div className="flex-1 rounded-2xl p-4" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                <Skeleton w={60} h={2} /><div className="mt-2"><Skeleton w={100} h={5} /></div>
              </div>
            </>
          ) : error ? null : (
            <>
              <InfoCard
                label="Cierre ayer"
                value={`$${fmtCOP(data!.yesterday)}`}
                sub="USD → COP"
                color="rgba(255,255,255,0.75)"
              />
              <InfoCard
                label="Variación"
                value={`${data!.changePct >= 0 ? "+" : ""}${data!.changePct.toFixed(2)}%`}
                sub={`${data!.change >= 0 ? "+" : ""}${fmtCOP(data!.change)} COP`}
                color={Math.abs(data!.changePct) < 0.005 ? BLUE : data!.changePct > 0 ? GREEN : DANGER}
              />
            </>
          )}
        </div>

        {/* ── Error state ────────────────────────────────────────────────── */}
        {error && (
          <div className="rounded-2xl p-5 flex flex-col items-center gap-3 text-center"
            style={{ background: `${DANGER}0C`, border: `1px solid ${DANGER}25` }}>
            <TrendingDown className="h-8 w-8" style={{ color: DANGER }} />
            <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.6)" }}>{error}</p>
            <button onClick={() => load(true)}
              className="text-xs font-semibold px-4 py-2 rounded-xl"
              style={{ background: `${DANGER}15`, color: DANGER }}>
              Reintentar
            </button>
          </div>
        )}

        {/* ── What is TRM ────────────────────────────────────────────────── */}
        <div className="rounded-2xl p-4 flex gap-3"
          style={{ background: `${BLUE}08`, border: `1px solid ${BLUE}20` }}>
          <Info className="h-4 w-4 shrink-0 mt-0.5" style={{ color: `${BLUE}99` }} />
          <div>
            <p className="text-xs font-semibold mb-1" style={{ color: `${BLUE}CC` }}>¿Qué es la TRM?</p>
            <p className="text-[10px] leading-relaxed" style={{ color: "rgba(255,255,255,0.3)" }}>
              La Tasa Representativa del Mercado (TRM) es el promedio ponderado del dólar americano en Colombia,
              calculado por el Banco de la República. Es la referencia oficial para convertir USD a COP y viceversa.
            </p>
          </div>
        </div>

        {/* ── Conversion quick-ref ───────────────────────────────────────── */}
        {!loading && !error && data && (
          <div className="rounded-2xl overflow-hidden"
            style={{ background: CARD, border: `1px solid ${BORDER}` }}>
            <div className="px-4 py-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
              <p className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: "rgba(255,255,255,0.3)" }}>Conversión rápida</p>
            </div>
            {[1, 10, 100, 1000, 5000, 10000].map((usd, i, arr) => (
              <div key={usd} className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: i < arr.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                <span className="text-sm font-mono font-semibold text-white">${usd} USD</span>
                <span className="text-sm font-mono" style={{ color: GREEN }}>
                  ${fmtCOP(usd * data.today)} COP
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── Bottom padding ─────────────────────────────────────────────── */}
        <div className="h-4" />
      </div>

      {/* ── Status bar ────────────────────────────────────────────────────── */}
      <div className="px-4 py-2.5 flex items-center gap-2 shrink-0"
        style={{ borderTop: `1px solid ${BORDER}` }}>
        {refreshing ? (
          <>
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                style={{ background: GREEN }} />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: GREEN }} />
            </span>
            <p className="text-[9px]" style={{ color: "rgba(255,255,255,0.25)" }}>Actualizando TRM…</p>
          </>
        ) : data ? (
          <>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: GREEN }} />
            <p className="text-[9px]" style={{ color: "rgba(255,255,255,0.25)" }}>
              Fuente: Banco de la República · Próxima actualización en {countdown}s
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
