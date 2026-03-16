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

// ── Quote shape ───────────────────────────────────────────────────────────────
interface Quote {
  price:         number;
  previousClose: number;
  change:        number;
  percentChange: number;
}

// ── REST fetch — used once on mount and on manual refresh ─────────────────────
// Provides previousClose so the WebSocket-only price updates can derive change %.
async function fetchQuote(): Promise<Quote> {
  const res = await fetch(
    "https://api.twelvedata.com/quote?symbol=USD/COP&apikey=demo",
    { signal: AbortSignal.timeout(12_000) }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.status === "error") throw new Error(data.message ?? "TwelveData error");
  const price         = parseFloat(data.price          ?? data.close ?? "0");
  const previousClose = parseFloat(data.previous_close ?? data.close ?? "0");
  const change        = parseFloat(data.change         ?? "0");
  const percentChange = parseFloat(data.percent_change ?? "0");
  if (!price) throw new Error("Price not found");
  return { price, previousClose, change, percentChange };
}

// ── Format COP ────────────────────────────────────────────────────────────────
function fmtCOP(n: number, decimals = 2): string {
  return n.toLocaleString("es-CO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
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
  label: string; value: string; sub?: string;
  color: string; accent?: string; icon?: React.ElementType;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl p-4"
      style={{ background: CARD, border: `1px solid ${accent ?? BORDER}`, boxShadow: SHADOW }}>
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3 shrink-0" style={{ color: "rgba(255,255,255,0.3)" }} />}
        <p className="text-[9px] font-bold uppercase tracking-widest"
          style={{ color: "rgba(255,255,255,0.28)" }}>{label}</p>
      </div>
      <p className="text-base font-extrabold leading-tight tracking-tight" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px] font-semibold" style={{ color: "rgba(255,255,255,0.35)" }}>{sub}</p>}
    </div>
  );
}

// ── WebSocket URL ─────────────────────────────────────────────────────────────
const WS_URL = "wss://ws.twelvedata.com/v1/quotes/price?apikey=demo";
// Reconnect delay (ms) after an unexpected close
const RECONNECT_MS = 3_000;

// ── Page ──────────────────────────────────────────────────────────────────────
type WsStatus = "connecting" | "live" | "disconnected";

export default function TRMPage({ onClose }: Props) {
  const [quote, setQuote]           = useState<Quote | null>(null);
  const [prevPrice, setPrevPrice]   = useState<number | null>(null);
  const [flash, setFlash]           = useState(false);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [wsStatus, setWsStatus]     = useState<WsStatus>("connecting");

  // Stable ref — always holds latest quote without causing stale closures
  const quoteRef = useRef<Quote | null>(null);
  useEffect(() => { quoteRef.current = quote; }, [quote]);

  // ── REST: initial load + manual refresh ──────────────────────────────────
  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    setError(null);
    try {
      const q = await fetchQuote();
      setPrevPrice(quoteRef.current?.price ?? null);
      setQuote(q);
      setUsdCopRate(q.price);
      setFlash(true);
      setTimeout(() => setFlash(false), 700);
    } catch {
      if (!quoteRef.current) {
        setError("No se pudo obtener el precio. Verifica tu conexión.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Fetch initial quote on mount (provides previousClose for WS-derived change %)
  useEffect(() => { load(); }, [load]);

  // ── WebSocket: real-time price stream ────────────────────────────────────
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      setWsStatus("connecting");
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        ws!.send(JSON.stringify({
          action: "subscribe",
          params: { symbols: "USD/COP" },
        }));
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data as string);

          // Live price tick
          if (msg.event === "price" && msg.symbol === "USD/COP") {
            const newPrice = parseFloat(msg.price);
            if (!newPrice || !isFinite(newPrice)) return;

            setWsStatus("live");
            setPrevPrice(quoteRef.current?.price ?? null);

            setQuote(prev => {
              if (!prev) return prev;               // wait for initial REST load
              const previousClose  = prev.previousClose;
              const change         = newPrice - previousClose;
              const percentChange  = previousClose ? (change / previousClose) * 100 : 0;
              return { ...prev, price: newPrice, change, percentChange };
            });

            setUsdCopRate(newPrice);
            setFlash(true);
            setTimeout(() => setFlash(false), 700);
          }

          // Subscription confirmed
          if (msg.event === "subscribe-status") {
            if (msg.status === "ok") setWsStatus("live");
          }
        } catch { /* malformed frame — ignore */ }
      };

      ws.onerror = () => {
        ws?.close();
      };

      ws.onclose = () => {
        if (cancelled) return;
        setWsStatus("disconnected");
        reconnectTimer = setTimeout(connect, RECONNECT_MS);
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  // ── Derived display values ─────────────────────────────────────────────────
  const pct      = quote?.percentChange ?? 0;
  const isUp     = pct >  0.005;
  const isDown   = pct < -0.005;

  const tickDir: "up" | "down" | "neutral" =
    prevPrice === null || quote === null ? "neutral"
    : quote.price > prevPrice ? "up"
    : quote.price < prevPrice ? "down"
    : "neutral";

  const tickColor   = tickDir === "up" ? GREEN : tickDir === "down" ? DANGER : BLUE;
  const changeColor = Math.abs(pct) < 0.005 ? BLUE : isUp ? GREEN : DANGER;
  const heroColor   = loading || !quote ? GREEN : isUp ? GREEN : isDown ? DANGER : BLUE;
  const pctAccent   = changeColor === BLUE  ? "rgba(59,130,246,0.30)"
                    : changeColor === GREEN ? "rgba(25,195,125,0.30)"
                    : "rgba(255,77,79,0.30)";

  // Status bar label & dot color
  const statusDot   = wsStatus === "live" ? GREEN : wsStatus === "connecting" ? AMBER : DANGER;
  const statusLabel =
    wsStatus === "live"         ? "En vivo · twelvedata.com"
    : wsStatus === "connecting" ? "Conectando…"
    : "Reconectando…";

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
            Streaming en tiempo real · WebSocket
          </p>
        </div>

        {/* Manual refresh — re-fetches previousClose from REST */}
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
          ) : error && !quote ? (
            <p className="text-2xl font-bold mb-4" style={{ color: DANGER }}>—</p>
          ) : (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-0.5">
                {tickDir === "up"   && <ArrowUp   className="h-6 w-6 shrink-0" style={{ color: GREEN }}  />}
                {tickDir === "down" && <ArrowDown  className="h-6 w-6 shrink-0" style={{ color: DANGER }} />}
                <span className="text-4xl font-extrabold tracking-tight"
                  style={{
                    color: prevPrice === null ? "white" : tickColor,
                    textShadow: flash && tickDir !== "neutral" ? `0 0 24px ${tickColor}90` : "none",
                    transition: "color 0.4s ease, text-shadow 0.4s ease",
                  }}>
                  {fmtCOP(quote!.price)}
                </span>
                <span className="text-lg font-semibold" style={{ color: "rgba(255,255,255,0.35)" }}>COP</span>
              </div>
              <p className="text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.22)" }}>
                {(1_000_000 / quote!.price).toFixed(4)} USD por millón de pesos
              </p>
            </div>
          )}

          {/* Change chip */}
          {!loading && quote && (() => {
            const up    = pct >  0.005;
            const down  = pct < -0.005;
            const color = up ? GREEN : down ? DANGER : BLUE;
            const Icon  = up ? TrendingUp : down ? TrendingDown : Minus;
            const label = Math.abs(pct) < 0.005
              ? "Sin cambio"
              : `${up ? "+" : ""}${pct.toFixed(3)}%`;
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
        ) : quote ? (
          <div className="grid grid-cols-2 gap-3">
            <MetricCard
              label="Precio actual"
              value={`${fmtCOP(quote.price)} COP`}
              sub="1 USD"
              color={prevPrice !== null ? tickColor : "rgba(255,255,255,0.9)"}
              accent={prevPrice !== null ? `${tickColor}30` : BORDER}
              icon={tickDir === "up" ? ArrowUp : tickDir === "down" ? ArrowDown : Minus}
            />
            <MetricCard
              label="Precio cierre"
              value={`${fmtCOP(quote.previousClose)} COP`}
              sub="Cierre anterior"
              color="rgba(255,255,255,0.75)"
              accent={BORDER}
            />
            <MetricCard
              label="Cambio %"
              value={`${quote.percentChange >= 0 ? "+" : ""}${quote.percentChange.toFixed(3)}%`}
              sub={isUp ? "Precio subió" : isDown ? "Precio bajó" : "Sin variación"}
              color={changeColor}
              accent={pctAccent}
              icon={isUp ? TrendingUp : isDown ? TrendingDown : Minus}
            />
            <MetricCard
              label="Cambio COP"
              value={`${quote.change >= 0 ? "+" : ""}${fmtCOP(quote.change)} COP`}
              sub="vs. cierre anterior"
              color={changeColor}
              accent={pctAccent}
            />
          </div>
        ) : null}

        {/* ── Error state ───────────────────────────────────────────────────── */}
        {error && !quote && (
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

        {/* ── Conversion quick-ref ─────────────────────────────────────────── */}
        {quote && (
          <div className="rounded-2xl overflow-hidden"
            style={{ background: CARD, border: `1px solid ${BORDER}` }}>
            <div className="px-4 py-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
              <p className="text-[10px] font-bold uppercase tracking-widest"
                style={{ color: "rgba(255,255,255,0.28)" }}>Conversión rápida</p>
            </div>
            {[1, 10, 100, 500, 1000, 5000, 10000].map((usd, i, arr) => (
              <div key={usd} className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: i < arr.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                <span className="text-sm font-mono font-semibold text-white">${usd.toLocaleString()} USD</span>
                <span className="text-sm font-mono font-semibold" style={{ color: GREEN }}>
                  ${fmtCOP(usd * quote.price)} COP
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
        {wsStatus === "live" ? (
          /* Pulsing dot when connected live */
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
              style={{ background: GREEN }} />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: GREEN }} />
          </span>
        ) : (
          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: statusDot }} />
        )}
        <p className="text-[9px]" style={{ color: "rgba(255,255,255,0.25)" }}>{statusLabel}</p>

        {/* Refreshing overlay */}
        {refreshing && (
          <p className="ml-auto text-[9px]" style={{ color: AMBER }}>Actualizando cierre…</p>
        )}
      </div>
    </div>
  );
}
