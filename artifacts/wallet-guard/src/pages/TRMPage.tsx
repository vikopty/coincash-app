import { useEffect, useState, useCallback, useRef } from "react";
import { ArrowLeft, RefreshCw, TrendingUp, TrendingDown, Minus, Activity, ArrowUp, ArrowDown } from "lucide-react";
import { setUsdCopRate } from "@/lib/rateStore";

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

// ── localStorage ──────────────────────────────────────────────────────────────
const CLOSE_KEY = "wg_usdcop_close";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

interface CloseRecord {
  price: number;
  date:  string;
}

function loadStoredClose(): CloseRecord | null {
  try {
    return JSON.parse(localStorage.getItem(CLOSE_KEY) || "null");
  } catch { return null; }
}

function saveClose(price: number): void {
  const rec: CloseRecord = { price, date: todayStr() };
  localStorage.setItem(CLOSE_KEY, JSON.stringify(rec));
}

// ── Fetch live spot price from open.er-api.com ────────────────────────────────
async function fetchSpot(): Promise<number> {
  const res = await fetch("https://open.er-api.com/v6/latest/USD", {
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const rate = data?.rates?.COP;
  if (!rate || typeof rate !== "number") throw new Error("COP rate not found");
  return rate;
}

// ── Format COP ────────────────────────────────────────────────────────────────
function fmtCOP(n: number, decimals = 2): string {
  return n.toLocaleString("es-CO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// ── Skeleton pill ─────────────────────────────────────────────────────────────
function Skeleton({ w, h = 4 }: { w: number; h?: number }) {
  return (
    <div className="animate-pulse rounded-full"
      style={{ width: w, height: h * 4, background: "rgba(255,255,255,0.07)" }} />
  );
}

// ── Metric card ───────────────────────────────────────────────────────────────
function MetricCard({
  label, value, sub, color, accent, icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  accent?: string;
  icon?: React.ElementType;
}) {
  const border = accent ?? BORDER;
  return (
    <div
      className="flex flex-col gap-2 rounded-2xl p-4"
      style={{
        background: CARD,
        border: `1px solid ${border}`,
        boxShadow: SHADOW,
      }}
    >
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3 shrink-0" style={{ color: "rgba(255,255,255,0.3)" }} />}
        <p className="text-[9px] font-bold uppercase tracking-widest"
          style={{ color: "rgba(255,255,255,0.28)" }}>{label}</p>
      </div>
      <p className="text-base font-extrabold leading-tight tracking-tight" style={{ color }}>{value}</p>
      {sub && (
        <p className="text-[10px] font-semibold" style={{ color: "rgba(255,255,255,0.35)" }}>{sub}</p>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
const REFRESH_SECS = 20;

export default function TRMPage({ onClose }: Props) {
  const [spot, setSpot]             = useState<number | null>(null);
  const [prevSpot, setPrevSpot]     = useState<number | null>(null);
  const [flash, setFlash]           = useState(false);
  const [close, setClose]           = useState<number | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [countdown, setCountdown]   = useState(REFRESH_SECS);
  const countdownRef                = useRef<ReturnType<typeof setInterval> | null>(null);
  const closeSetRef                 = useRef(false);
  const spotRef                     = useRef<number | null>(null);

  useEffect(() => {
    const stored = loadStoredClose();
    if (stored) {
      setClose(stored.price);
      closeSetRef.current = true;
    }
  }, []);

  useEffect(() => { spotRef.current = spot; }, [spot]);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    setError(null);
    try {
      const price = await fetchSpot();
      setPrevSpot(spotRef.current);
      setSpot(price);
      setUsdCopRate(price);
      setFlash(true);
      setTimeout(() => setFlash(false), 700);
      if (!closeSetRef.current) {
        setClose(price);
        closeSetRef.current = true;
      }
      saveClose(price);
      setCountdown(REFRESH_SECS);
    } catch {
      setError("No se pudo obtener el precio. Verifica tu conexión.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => load(), REFRESH_SECS * 1000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown(p => (p <= 1 ? REFRESH_SECS : p - 1));
    }, 1_000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [spot]);

  // ── Derived values ─────────────────────────────────────────────────────────
  const change    = spot !== null && close !== null ? spot - close : null;
  const changePct = change !== null && close        ? (change / close) * 100 : null;
  const isUp      = (changePct ?? 0) >  0.005;
  const isDown    = (changePct ?? 0) < -0.005;

  const tickDir: "up" | "down" | "neutral" =
    prevSpot === null || spot === null ? "neutral"
    : spot > prevSpot ? "up"
    : spot < prevSpot ? "down"
    : "neutral";

  const tickColor   = tickDir === "up" ? GREEN : tickDir === "down" ? DANGER : BLUE;
  const changeColor = changePct === null ? BLUE : Math.abs(changePct) < 0.005 ? BLUE : isUp ? GREEN : DANGER;
  const heroColor   = loading || spot === null ? GREEN : isUp ? GREEN : isDown ? DANGER : BLUE;

  // Color for the Cambio % metric card accent border
  const pctAccent = changeColor === BLUE ? "rgba(59,130,246,0.30)"
    : changeColor === GREEN ? "rgba(25,195,125,0.30)"
    : "rgba(255,77,79,0.30)";

  return (
    <div className="flex flex-col"
      style={{ background: BG, height: "100dvh", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)" }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 pt-10 pb-4 shrink-0">
        <button onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <ArrowLeft className="h-4 w-4" style={{ color: "rgba(255,255,255,0.6)" }} />
        </button>

        <div className="flex-1 mx-3">
          <p className="text-sm font-bold text-white leading-tight">USD/COP Mercado 🇨🇴</p>
          <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
            Precio spot en tiempo real · Actualización cada {REFRESH_SECS}s
          </p>
        </div>

        <button onClick={() => load(true)} disabled={refreshing}
          className="flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-40"
          style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
            style={{ color: refreshing ? GREEN : "rgba(255,255,255,0.5)" }} />
        </button>
      </div>

      {/* ── Scrollable body ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 flex flex-col gap-4">

        {/* ── Hero price card ──────────────────────────────────────────────── */}
        <div className="rounded-3xl p-6 relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #0e1e2e 0%, #0d1a14 100%)",
            border: `1px solid ${BORDER}`,
            boxShadow: SHADOW,
          }}>

          <div className="absolute -top-12 -right-12 h-48 w-48 rounded-full pointer-events-none"
            style={{ background: `radial-gradient(circle, ${heroColor}22 0%, transparent 70%)` }} />

          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl"
              style={{ background: `${heroColor}18` }}>
              <Activity className="h-4 w-4" style={{ color: heroColor }} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest"
                style={{ color: "rgba(255,255,255,0.35)" }}>PRECIO ACTUAL</p>
              <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.2)" }}>1 USD =</p>
            </div>
          </div>

          {loading ? (
            <div className="mb-4 flex flex-col gap-2">
              <Skeleton w={220} h={12} />
              <Skeleton w={140} h={3} />
            </div>
          ) : error ? (
            <p className="text-2xl font-bold mb-4" style={{ color: DANGER }}>—</p>
          ) : (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-0.5">
                {tickDir === "up"   && <ArrowUp   className="h-6 w-6 shrink-0" style={{ color: GREEN }}  />}
                {tickDir === "down" && <ArrowDown  className="h-6 w-6 shrink-0" style={{ color: DANGER }} />}
                <span
                  className="text-4xl font-extrabold tracking-tight"
                  style={{
                    color: prevSpot === null ? "white" : tickColor,
                    textShadow: flash && tickDir !== "neutral" ? `0 0 24px ${tickColor}90` : "none",
                    transition: "color 0.4s ease, text-shadow 0.4s ease",
                  }}>
                  {fmtCOP(spot!)}
                </span>
                <span className="text-lg font-semibold" style={{ color: "rgba(255,255,255,0.35)" }}>COP</span>
              </div>
              <p className="text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.22)" }}>
                {(1_000_000 / spot!).toFixed(4)} USD por millón de pesos
              </p>
            </div>
          )}

          {/* Change chip inside hero */}
          {!loading && !error && changePct !== null && (() => {
            const up    = changePct >  0.005;
            const down  = changePct < -0.005;
            const color = up ? GREEN : down ? DANGER : BLUE;
            const Icon  = up ? TrendingUp : down ? TrendingDown : Minus;
            const label = Math.abs(changePct) < 0.005
              ? "Sin cambio"
              : `${up ? "+" : ""}${changePct.toFixed(3)}%`;
            return (
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold"
                style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}>
                <Icon className="h-4 w-4" />
                {label}
              </span>
            );
          })()}
          {loading && <Skeleton w={110} h={5} />}
        </div>

        {/* ── 2×2 Metric grid ──────────────────────────────────────────────── */}
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {[0,1,2,3].map(i => (
              <div key={i} className="rounded-2xl p-4 flex flex-col gap-2"
                style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                <Skeleton w={60} h={2} />
                <Skeleton w={100} h={5} />
              </div>
            ))}
          </div>
        ) : error ? null : (
          <div className="grid grid-cols-2 gap-3">

            {/* Precio actual */}
            <MetricCard
              label="Precio actual"
              value={`${fmtCOP(spot!)} COP`}
              sub="1 USD"
              color={prevSpot !== null ? tickColor : "rgba(255,255,255,0.9)"}
              accent={prevSpot !== null ? `${tickColor}30` : BORDER}
              icon={tickDir === "up" ? ArrowUp : tickDir === "down" ? ArrowDown : Minus}
            />

            {/* Precio cierre */}
            <MetricCard
              label="Precio cierre"
              value={close !== null ? `${fmtCOP(close)} COP` : "—"}
              sub="Referencia"
              color="rgba(255,255,255,0.75)"
              accent={BORDER}
            />

            {/* Cambio % */}
            <MetricCard
              label="Cambio %"
              value={changePct !== null
                ? `${changePct >= 0 ? "+" : ""}${changePct.toFixed(3)}%`
                : "—"}
              sub={isUp ? "Precio subió" : isDown ? "Precio bajó" : "Sin variación"}
              color={changeColor}
              accent={pctAccent}
              icon={isUp ? TrendingUp : isDown ? TrendingDown : Minus}
            />

            {/* Cambio COP */}
            <MetricCard
              label="Cambio COP"
              value={change !== null
                ? `${change >= 0 ? "+" : ""}${fmtCOP(change)} COP`
                : "—"}
              sub="vs. cierre"
              color={changeColor}
              accent={pctAccent}
            />
          </div>
        )}

        {/* ── Error state ───────────────────────────────────────────────── */}
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

        {/* ── Conversion quick-ref ──────────────────────────────────────── */}
        {!loading && !error && spot !== null && (
          <div className="rounded-2xl overflow-hidden"
            style={{ background: CARD, border: `1px solid ${BORDER}` }}>
            <div className="px-4 py-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
              <p className="text-[10px] font-bold uppercase tracking-widest"
                style={{ color: "rgba(255,255,255,0.28)" }}>Conversión rápida</p>
            </div>
            {[1, 10, 100, 500, 1000, 5000, 10000].map((usd, i, arr) => (
              <div key={usd}
                className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: i < arr.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                <span className="text-sm font-mono font-semibold text-white">${usd.toLocaleString()} USD</span>
                <span className="text-sm font-mono font-semibold" style={{ color: GREEN }}>
                  ${fmtCOP(usd * spot!)} COP
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="h-2" />
      </div>

      {/* ── Status bar ───────────────────────────────────────────────────────── */}
      <div className="px-4 py-2.5 flex items-center gap-2 shrink-0"
        style={{ borderTop: `1px solid ${BORDER}` }}>
        {refreshing ? (
          <>
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                style={{ background: AMBER }} />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: AMBER }} />
            </span>
            <p className="text-[9px]" style={{ color: "rgba(255,255,255,0.25)" }}>Actualizando precio…</p>
          </>
        ) : spot !== null ? (
          <>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: GREEN }} />
            <p className="text-[9px]" style={{ color: "rgba(255,255,255,0.25)" }}>
              Fuente: open.er-api.com · Próxima actualización en {countdown}s
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
