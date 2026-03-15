// @ts-nocheck
import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowDownUp, Loader2, ChevronDown, AlertTriangle,
  CheckCircle2, Copy, CheckCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  fetchSwapRate, getSwapQuote, executeSwap, fetchAccountInfo,
  type SwapDirection, type SwapQuote, type SwapResult, type SwapRate, type AccountInfo,
} from "@/lib/tronApi";
import { decryptPrivateKey, hasEncryptedKey } from "@/lib/security";
import type { SavedWallet } from "@/pages/WalletsPage";

// ── Theme ──────────────────────────────────────────────────────────────────────
const PURPLE  = "#7C3AED";
const PURPLE2 = "#9F67FF";
const GREEN   = "#19C37D";
const AMBER   = "#F59E0B";
const RED     = "#EF4444";
const BORDER  = "rgba(255,255,255,0.07)";
const CARD    = "#0e1520";
const CARD2   = "#111827";
const CARD3   = "#0D1423";

type SwapStep = "form" | "confirm" | "signing" | "done";

function fmtAmt(n: number, dec = 4) {
  return n.toLocaleString("es-CO", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
/** Normalize a user-typed amount string: replace commas with dots, strip non-numeric chars. */
function normAmt(raw: string): string {
  return raw.replace(/,/g, ".").replace(/[^0-9.]/g, "");
}
function truncAddr(a: string) {
  return a.length > 14 ? `${a.slice(0, 7)}…${a.slice(-5)}` : a;
}

// Token icon components
function UsdtIcon({ size = 36 }: { size?: number }) {
  return (
    <div className="rounded-full flex items-center justify-center font-black text-sm"
      style={{ width: size, height: size, background: "rgba(38,161,123,0.2)", color: "#26A17B", fontSize: size * 0.38 }}>
      ₮
    </div>
  );
}
function TrxIcon({ size = 36 }: { size?: number }) {
  return (
    <div className="rounded-full flex items-center justify-center font-black"
      style={{ width: size, height: size, background: "rgba(255,60,60,0.15)", color: "#FF4B4B", fontSize: size * 0.38 }}>
      ◈
    </div>
  );
}

interface Props { wallets: SavedWallet[]; }

export default function SwapPage({ wallets }: Props) {
  const signableWallets = wallets.filter(w => hasEncryptedKey(w.id));

  // ── State ────────────────────────────────────────────────────────────────────
  const [selectedId,   setSelectedId]   = useState<string>(signableWallets[0]?.id ?? "");
  const [swapDir,      setSwapDir]      = useState<SwapDirection>("usdt_to_trx");
  const [amount,       setAmount]       = useState("");
  const [step,         setStep]         = useState<SwapStep>("form");

  const [rate,         setRate]         = useState<SwapRate | null>(null);
  const [rateLoading,  setRateLoading]  = useState(false);
  const [ratePulse,    setRatePulse]    = useState(false);   // flash animation on price update

  const [info,         setInfo]         = useState<AccountInfo | null>(null);
  const [infoLoading,  setInfoLoading]  = useState(false);

  const [quote,        setQuote]        = useState<SwapQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  const [result,       setResult]       = useState<SwapResult | null>(null);
  const [swapLoading,  setSwapLoading]  = useState(false);

  const [copied,       setCopied]       = useState<string | null>(null);
  const [walletOpen,   setWalletOpen]   = useState(false);
  const [flipping,     setFlipping]     = useState(false);    // switch-button spin animation
  const [showDetails,  setShowDetails]  = useState(false);    // collapsible breakdown

  const inputRef = useRef<HTMLInputElement>(null);

  const selectedWallet = signableWallets.find(w => w.id === selectedId) ?? signableWallets[0];

  // ── Derived ──────────────────────────────────────────────────────────────────
  const COINCASH_FEE_USDT = 1;
  const sendToken    = swapDir === "usdt_to_trx" ? "USDT" : "TRX";
  const receiveToken = swapDir === "usdt_to_trx" ? "TRX"  : "USDT";
  const trxUsd       = rate?.trxUsd ?? 0;
  const inputAmt     = parseFloat(normAmt(amount)) || 0;

  const swapAmt = swapDir === "usdt_to_trx"
    ? Math.max(0, inputAmt - COINCASH_FEE_USDT)
    : inputAmt;

  const grossOut = swapDir === "usdt_to_trx"
    ? (trxUsd > 0 ? swapAmt / trxUsd : 0)
    : swapAmt * trxUsd;

  const swapFeeOut = grossOut * 0.02;

  const netOut = swapDir === "usdt_to_trx"
    ? grossOut * 0.98
    : Math.max(0, grossOut * 0.98 - COINCASH_FEE_USDT);

  const hasAmt       = inputAmt > 0 && trxUsd > 0;
  const enoughForFee = swapDir === "usdt_to_trx" ? inputAmt > COINCASH_FEE_USDT : true;
  const sendBalance  = sendToken === "USDT" ? (info?.usdtBalance ?? 0) : (info?.trxBalance ?? 0);
  const maxSend      = sendToken === "TRX"
    ? Math.max(0, sendBalance - 2)
    : Math.max(0, sendBalance - COINCASH_FEE_USDT);

  // Market rate label: "1 USDT ≈ X TRX" or "1 TRX ≈ $X"
  const marketRateLabel = trxUsd > 0
    ? swapDir === "usdt_to_trx"
      ? `1 USDT ≈ ${(1 / trxUsd).toFixed(2)} TRX`
      : `1 TRX ≈ $${trxUsd.toFixed(4)}`
    : "Cargando precio…";

  // ── Live TRX price (CoinGecko → backend fallback, 10 s refresh) ──────────────
  const loadRate = useCallback(async () => {
    setRateLoading(true);
    try {
      const cgRes = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=tron&vs_currencies=usd",
        { signal: AbortSignal.timeout(5_000) }
      );
      if (cgRes.ok) {
        const cgData = await cgRes.json();
        const trxUsd: number = cgData?.tron?.usd;
        if (trxUsd && trxUsd > 0) {
          setRate(prev => ({
            trxUsd,
            feeRate: prev?.feeRate ?? 0.02,
            swapAvailable: prev?.swapAvailable ?? true,
            relayerAddress: prev?.relayerAddress ?? "",
          }));
          setRateLoading(false);
          setRatePulse(true);
          setTimeout(() => setRatePulse(false), 800);
          return;
        }
      }
    } catch { /* fall through */ }
    try {
      const r = await fetchSwapRate();
      setRate(r);
      setRatePulse(true);
      setTimeout(() => setRatePulse(false), 800);
    } catch { /* ignore */ }
    setRateLoading(false);
  }, []);

  useEffect(() => {
    loadRate();
    const id = setInterval(loadRate, 10_000);
    return () => clearInterval(id);
  }, [loadRate]);

  useEffect(() => {
    if (!selectedWallet) return;
    setInfoLoading(true);
    fetchAccountInfo(selectedWallet.address)
      .then(i => { setInfo(i); setInfoLoading(false); })
      .catch(() => setInfoLoading(false));
  }, [selectedWallet?.address]);

  const reset = () => { setStep("form"); setAmount(""); setQuote(null); setResult(null); };

  // ── Flip direction with animation ─────────────────────────────────────────────
  const flipDirection = () => {
    setFlipping(true);
    setTimeout(() => setFlipping(false), 350);
    setSwapDir(d => d === "usdt_to_trx" ? "trx_to_usdt" : "usdt_to_trx");
    setAmount("");
  };

  const handleContinue = async () => {
    if (!hasAmt) { toast.error("Ingresa un monto válido."); return; }
    if (!enoughForFee) {
      toast.error(`El monto mínimo para este swap es ${COINCASH_FEE_USDT + 0.01} USDT.`);
      return;
    }
    if (inputAmt > maxSend) {
      toast.error(`Saldo insuficiente. Disponible: ${fmtAmt(maxSend, sendToken === "USDT" ? 2 : 4)} ${sendToken}`);
      return;
    }
    if (!rate?.swapAvailable) {
      toast.error("El servicio de swap no está disponible en este momento.");
      return;
    }
    setQuoteLoading(true);
    try {
      const q = await getSwapQuote(swapDir, inputAmt);
      setQuote(q);
      setStep("confirm");
    } catch (e: any) {
      toast.error(e?.message ?? "Error al obtener cotización.");
    } finally {
      setQuoteLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!quote || !selectedWallet) return;
    setSwapLoading(true);
    setStep("signing");
    try {
      const privKey = await decryptPrivateKey(selectedWallet.id);
      const res = await executeSwap(selectedWallet.address, privKey, quote);
      setResult(res);
      setStep("done");
      toast.success("¡Swap completado exitosamente!");
    } catch (e: any) {
      toast.error(e?.message ?? "Error al ejecutar el swap.");
      setStep("confirm");
    } finally {
      setSwapLoading(false);
    }
  };

  const copyTx = (txid: string) => {
    navigator.clipboard.writeText(txid).then(() => {
      setCopied(txid);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  // ── No signable wallets ───────────────────────────────────────────────────────
  if (signableWallets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen pb-24 px-6 text-center gap-4"
        style={{ background: "#080d14" }}>
        <div className="h-14 w-14 rounded-full flex items-center justify-center"
          style={{ background: `${PURPLE}18`, border: `1px solid ${PURPLE}30` }}>
          <ArrowDownUp className="h-7 w-7" style={{ color: PURPLE }} />
        </div>
        <p className="text-lg font-bold text-white">Swap USDT ↔ TRX</p>
        <p className="text-sm leading-relaxed max-w-[260px]" style={{ color: "rgba(255,255,255,0.4)" }}>
          Necesitas al menos una billetera con clave privada para realizar swaps.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28" style={{ background: "#080d14" }}>

      <div className="px-4 pt-14">

        {/* ════════════════════════════════════════════════════════════════════
            DONE STEP
        ════════════════════════════════════════════════════════════════════ */}
        {step === "done" && result && (
          <div className="flex flex-col items-center gap-5 pt-4">
            {/* Success icon */}
            <div className="h-20 w-20 rounded-full flex items-center justify-center"
              style={{ background: `${PURPLE}18`, border: `2px solid ${PURPLE}50` }}>
              <CheckCircle2 className="h-10 w-10" style={{ color: PURPLE }} />
            </div>
            <div className="text-center">
              <p className="text-xl font-black text-white mb-1">¡Swap completado!</p>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
                Los tokens han sido enviados a tu billetera
              </p>
            </div>

            {/* Summary */}
            <div className="w-full rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}`, background: CARD2 }}>
              <div className="px-4 py-2.5" style={{ background: `${PURPLE}12`, borderBottom: `1px solid ${BORDER}` }}>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: PURPLE }}>Resumen del swap</p>
              </div>
              {[
                ["Monto enviado",     `${quote?.inputAmount?.toFixed(quote?.inputToken === "USDT" ? 2 : 4) ?? "—"} ${sendToken}`,  "white"],
                ["Comisión CoinCash", `−${(quote?.coinCashFeeUsdt ?? 1).toFixed(2)} USDT`,                                          AMBER],
                ["Monto convertido",  quote?.inputToken === "USDT"
                    ? `${(quote?.swapAmount ?? 0).toFixed(2)} USDT`
                    : `${(quote?.inputAmount ?? 0).toFixed(4)} TRX`,                                                                "white"],
                ["Tarifa swap (2%)",  `−${result.feeAmount.toFixed(receiveToken === "USDT" ? 2 : 4)} ${receiveToken}`,             AMBER],
                ["Recibiste ✓",       `${result.outputAmount.toFixed(receiveToken === "USDT" ? 2 : 4)} ${receiveToken}`,           GREEN],
                ["Tasa utilizada",    `1 TRX = $${quote?.trxUsd?.toFixed(4) ?? "—"} USD`,                                         "rgba(255,255,255,0.35)"],
              ].map(([lbl, val, col], i, arr) => (
                <div key={lbl} className="flex items-center justify-between px-4 py-2.5"
                  style={{ borderBottom: i < arr.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                  <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{lbl}</span>
                  <span className="text-xs font-bold" style={{ color: col as string }}>{val}</span>
                </div>
              ))}
            </div>

            {/* TX IDs */}
            {[{ label: "TX de entrada", value: result.inputTxId }, { label: "TX de salida", value: result.outputTxId }]
              .map(({ label, value }) => (
                <div key={label} className="w-full rounded-2xl p-3.5" style={{ background: CARD2, border: `1px solid ${BORDER}` }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.3)" }}>{label}</p>
                    <button onClick={() => copyTx(value)} className="p-1 rounded-lg" style={{ background: "rgba(255,255,255,0.06)" }}>
                      {copied === value
                        ? <CheckCheck className="h-3 w-3" style={{ color: GREEN }} />
                        : <Copy className="h-3 w-3" style={{ color: "rgba(255,255,255,0.4)" }} />}
                    </button>
                  </div>
                  <p className="text-[10px] font-mono break-all leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>{value}</p>
                </div>
              ))}

            <button onClick={reset} className="w-full rounded-2xl py-4 text-sm font-bold mt-1"
              style={{ background: `linear-gradient(135deg, ${PURPLE}, ${PURPLE2})`, color: "white", boxShadow: `0 0 24px ${PURPLE}50` }}>
              Hacer otro swap
            </button>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            SIGNING STEP
        ════════════════════════════════════════════════════════════════════ */}
        {step === "signing" && (
          <div className="flex flex-col items-center justify-center py-24 gap-5">
            <div className="relative h-20 w-20 rounded-full flex items-center justify-center"
              style={{ background: `${PURPLE}18`, border: `2px solid ${PURPLE}40` }}>
              <Loader2 className="h-9 w-9 animate-spin" style={{ color: PURPLE }} />
            </div>
            <div className="text-center">
              <p className="text-base font-bold text-white mb-2">Ejecutando swap…</p>
              <p className="text-xs max-w-[220px] mx-auto leading-relaxed" style={{ color: "rgba(255,255,255,0.4)" }}>
                Firmando y transmitiendo la transacción.<br />No cierres la aplicación.
              </p>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            CONFIRM STEP
        ════════════════════════════════════════════════════════════════════ */}
        {step === "confirm" && quote && (
          <div className="flex flex-col gap-4 pt-1">
            <p className="text-base font-bold text-white">Confirmar Swap</p>

            {/* Visual recap: from → to */}
            <div className="rounded-2xl p-4 flex items-center justify-between gap-3"
              style={{ background: CARD2, border: `1px solid ${BORDER}` }}>
              <div className="flex flex-col items-center gap-1">
                {quote.inputToken === "USDT" ? <UsdtIcon size={42} /> : <TrxIcon size={42} />}
                <p className="text-lg font-black text-white">
                  {quote.inputAmount.toFixed(quote.inputToken === "USDT" ? 2 : 4)}
                </p>
                <p className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.4)" }}>{quote.inputToken}</p>
              </div>
              <div className="flex-1 flex flex-col items-center gap-1">
                <ArrowDownUp className="h-5 w-5" style={{ color: PURPLE }} />
                <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.25)" }}>
                  1 TRX = ${quote.trxUsd.toFixed(4)}
                </span>
              </div>
              <div className="flex flex-col items-center gap-1">
                {quote.outputToken === "USDT" ? <UsdtIcon size={42} /> : <TrxIcon size={42} />}
                <p className="text-lg font-black" style={{ color: GREEN }}>
                  {quote.outputAmount.toFixed(quote.outputToken === "USDT" ? 2 : 4)}
                </p>
                <p className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.4)" }}>{quote.outputToken}</p>
              </div>
            </div>

            {/* 7-line breakdown */}
            <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}`, background: CARD2 }}>
              <div className="px-4 py-2.5" style={{ background: `${PURPLE}12`, borderBottom: `1px solid ${BORDER}` }}>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: PURPLE }}>Desglose</p>
              </div>
              {[
                ["Monto ingresado",    `${quote.inputAmount.toFixed(quote.inputToken === "USDT" ? 2 : 4)} ${quote.inputToken}`,    "white"],
                ["Comisión CoinCash",  `−${quote.coinCashFeeUsdt.toFixed(2)} USDT`,                                                AMBER],
                ["Monto a convertir",  quote.inputToken === "USDT"
                    ? `${quote.swapAmount.toFixed(2)} USDT`
                    : `${quote.inputAmount.toFixed(4)} TRX`,                                                                       "white"],
                ["Tarifa swap (2%)",   `−${quote.feeAmount.toFixed(quote.outputToken === "USDT" ? 2 : 4)} ${quote.outputToken}`,  AMBER],
                ["Recibirás ≈",        `${quote.outputAmount.toFixed(quote.outputToken === "USDT" ? 2 : 4)} ${quote.outputToken}`, GREEN],
                ["Tarifa de red",      "Cubierta por CoinCash ✓",                                                                  GREEN],
              ].map(([lbl, val, col], i, arr) => (
                <div key={lbl} className="flex items-center justify-between px-4 py-3"
                  style={{ borderBottom: i < arr.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                  <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{lbl}</span>
                  <span className="text-xs font-semibold" style={{ color: col as string }}>{val}</span>
                </div>
              ))}
            </div>

            {/* Warning */}
            <div className="rounded-2xl p-3.5 flex gap-3" style={{ background: `${AMBER}08`, border: `1px solid ${AMBER}25` }}>
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: AMBER }} />
              <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
                Cotización válida por <span className="font-semibold" style={{ color: AMBER }}>60 segundos</span>.
                Las transacciones en blockchain son <span className="font-semibold" style={{ color: RED }}>irreversibles</span>.
              </p>
            </div>

            <div className="flex gap-3">
              <button onClick={() => { setStep("form"); setQuote(null); }}
                className="flex-1 rounded-2xl py-4 text-sm font-medium"
                style={{ border: `1px solid ${BORDER}`, color: "rgba(255,255,255,0.5)" }}>
                Cancelar
              </button>
              <button onClick={handleExecute} disabled={swapLoading}
                className="flex-1 rounded-2xl py-4 text-sm font-bold"
                style={{ background: `linear-gradient(135deg, ${PURPLE}, ${PURPLE2})`, color: "white", boxShadow: `0 0 20px ${PURPLE}40` }}>
                Confirmar
              </button>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            FORM STEP  —  Professional Exchange Layout
        ════════════════════════════════════════════════════════════════════ */}
        {step === "form" && (
          <div className="flex flex-col gap-3">

            {/* ── Wallet selector (compact) ─────────────────────────────────── */}
            <div className="relative">
              <button onClick={() => setWalletOpen(o => !o)}
                className="w-full flex items-center justify-between rounded-xl px-3.5 py-2.5"
                style={{ background: CARD2, border: `1px solid ${BORDER}` }}>
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-black"
                    style={{ background: `${PURPLE}25`, color: PURPLE }}>
                    {selectedWallet?.name?.[0]?.toUpperCase() ?? "W"}
                  </div>
                  <span className="text-sm font-semibold text-white truncate max-w-[160px]">
                    {selectedWallet?.name ?? "Billetera"}
                  </span>
                  <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.3)" }}>
                    {selectedWallet ? truncAddr(selectedWallet.address) : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {infoLoading
                    ? <Loader2 className="h-3 w-3 animate-spin" style={{ color: "rgba(255,255,255,0.3)" }} />
                    : <span className="text-[11px] font-bold" style={{ color: GREEN }}>
                        {sendToken === "USDT"
                          ? `${fmtAmt(info?.usdtBalance ?? 0, 2)} USDT`
                          : `${fmtAmt(info?.trxBalance ?? 0, 4)} TRX`
                        }
                      </span>
                  }
                  <ChevronDown className="h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.3)" }} />
                </div>
              </button>
              {walletOpen && (
                <div className="absolute top-full mt-1 left-0 right-0 z-20 rounded-2xl overflow-hidden"
                  style={{ background: CARD, border: `1px solid ${BORDER}`, boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }}>
                  {signableWallets.map(w => (
                    <button key={w.id}
                      onClick={() => { setSelectedId(w.id); setWalletOpen(false); setAmount(""); setInfo(null); }}
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/5 transition-colors"
                      style={{ borderBottom: `1px solid ${BORDER}` }}>
                      <div>
                        <p className="text-sm font-semibold text-white">{w.name}</p>
                        <p className="text-[10px] font-mono mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
                          {truncAddr(w.address)}
                        </p>
                      </div>
                      {w.id === selectedId && <span className="h-2 w-2 rounded-full" style={{ background: GREEN }} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ══════════════════════════════════════════════════════════════
                EXCHANGE INPUT CARDS
            ══════════════════════════════════════════════════════════════ */}
            <div className="relative flex flex-col">

              {/* ── SEND CARD ─────────────────────────────────────────────── */}
              <div className="rounded-t-3xl rounded-b-none px-4 pt-4 pb-3"
                style={{ background: CARD2, border: `1px solid ${BORDER}`, borderBottom: "none" }}>

                {/* Row 1: label + balance */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold uppercase tracking-widest"
                    style={{ color: "rgba(255,255,255,0.35)" }}>Enviar</span>
                  <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                    Disponible:&nbsp;
                    <span className="font-semibold" style={{ color: "rgba(255,255,255,0.55)" }}>
                      {fmtAmt(sendBalance, sendToken === "USDT" ? 2 : 4)} {sendToken}
                    </span>
                  </span>
                </div>

                {/* Row 2: big amount input + token badge */}
                <div className="flex items-center gap-3">
                  <input
                    ref={inputRef}
                    type="number" inputMode="decimal" placeholder="0.00"
                    value={amount} onChange={e => setAmount(normAmt(e.target.value))}
                    className="flex-1 bg-transparent text-3xl font-black text-white outline-none placeholder:text-white/20 min-w-0"
                    style={{ letterSpacing: "-0.02em" }}
                  />
                  {/* Token pill */}
                  <div className="flex items-center gap-2 rounded-2xl px-3 py-2 shrink-0"
                    style={{ background: "rgba(255,255,255,0.07)", border: `1px solid ${BORDER}` }}>
                    {sendToken === "USDT" ? <UsdtIcon size={24} /> : <TrxIcon size={24} />}
                    <span className="text-sm font-bold text-white">{sendToken}</span>
                  </div>
                </div>

                {/* Row 3: rate label + MAX button */}
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                    {marketRateLabel}
                  </span>
                  <button
                    onClick={() => setAmount(maxSend > 0 ? maxSend.toFixed(sendToken === "USDT" ? 2 : 6) : "0")}
                    className="text-[10px] font-black px-2.5 py-1 rounded-lg tracking-wider"
                    style={{ background: `${PURPLE}20`, color: PURPLE, border: `1px solid ${PURPLE}40` }}>
                    MAX
                  </button>
                </div>
              </div>

              {/* ── SWITCH BUTTON (centered between cards) ────────────────── */}
              <div className="flex items-center justify-center" style={{ height: 0, zIndex: 10 }}>
                <button
                  onClick={flipDirection}
                  className="h-10 w-10 rounded-full flex items-center justify-center shadow-xl relative -mt-0.5 -mb-0.5"
                  style={{
                    background: `linear-gradient(135deg, ${PURPLE}, ${PURPLE2})`,
                    border: `3px solid #080d14`,
                    transform: flipping ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.35s cubic-bezier(0.4,0,0.2,1)",
                    boxShadow: `0 0 20px ${PURPLE}60`,
                    zIndex: 10,
                  }}>
                  <ArrowDownUp className="h-4 w-4 text-white" />
                </button>
              </div>

              {/* ── RECEIVE CARD ──────────────────────────────────────────── */}
              <div className="rounded-b-3xl rounded-t-none px-4 pt-3 pb-4"
                style={{ background: CARD3, border: `1px solid ${BORDER}`, borderTop: "none" }}>

                {/* Row 1: label */}
                <div className="flex items-center justify-between mb-2 mt-1">
                  <span className="text-[11px] font-semibold uppercase tracking-widest"
                    style={{ color: "rgba(255,255,255,0.35)" }}>Recibir</span>
                  {hasAmt && enoughForFee && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: `${GREEN}15`, color: GREEN, border: `1px solid ${GREEN}30` }}>
                      estimado
                    </span>
                  )}
                </div>

                {/* Row 2: estimated amount + token badge */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-3xl font-black truncate"
                      style={{
                        color: hasAmt && enoughForFee ? GREEN : "rgba(255,255,255,0.18)",
                        letterSpacing: "-0.02em",
                        transition: "color 0.3s",
                      }}>
                      {hasAmt && enoughForFee
                        ? `≈ ${netOut.toFixed(receiveToken === "USDT" ? 2 : 4)}`
                        : "0.00"
                      }
                    </p>
                  </div>
                  <div className="flex items-center gap-2 rounded-2xl px-3 py-2 shrink-0"
                    style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}` }}>
                    {receiveToken === "USDT" ? <UsdtIcon size={24} /> : <TrxIcon size={24} />}
                    <span className="text-sm font-bold text-white">{receiveToken}</span>
                  </div>
                </div>

                {/* Row 3: insufficient fee warning */}
                {hasAmt && !enoughForFee && (
                  <p className="text-[10px] mt-1.5" style={{ color: AMBER }}>
                    Monto mínimo: {(COINCASH_FEE_USDT + 0.01).toFixed(2)} USDT
                  </p>
                )}
              </div>
            </div>

            {/* ── SUMMARY PANEL ─────────────────────────────────────────────── */}
            <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}`, background: CARD2 }}>

              {/* Always-visible rows */}
              {/* Monto enviado */}
              <div className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: `1px solid ${BORDER}` }}>
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Monto enviado</span>
                <span className="text-xs font-semibold text-white">
                  {hasAmt && enoughForFee
                    ? `${inputAmt.toFixed(sendToken === "USDT" ? 2 : 4)} ${sendToken}`
                    : `— ${sendToken}`}
                </span>
              </div>

              {/* Recibirás ≈ */}
              <div className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: `1px solid ${BORDER}` }}>
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Recibirás ≈</span>
                <span className="text-xs font-black" style={{ color: hasAmt && enoughForFee ? GREEN : "rgba(255,255,255,0.15)", fontSize: 13 }}>
                  {hasAmt && enoughForFee
                    ? `${netOut.toFixed(receiveToken === "USDT" ? 2 : 4)} ${receiveToken}`
                    : `— ${receiveToken}`}
                </span>
              </div>

              {/* Comisión CoinCash */}
              <div className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: `1px solid ${BORDER}` }}>
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Comisión CoinCash</span>
                <span className="text-xs font-semibold" style={{ color: AMBER }}>−1.00 USDT</span>
              </div>

              {/* Tarifa de red */}
              <div className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: `1px solid ${BORDER}`, background: `${GREEN}06` }}>
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>Tarifa de red</span>
                <span className="text-xs font-semibold" style={{ color: GREEN }}>Cubierta por CoinCash ✓</span>
              </div>

              {/* Collapsible details toggle */}
              <button
                onClick={() => setShowDetails(v => !v)}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 transition-colors hover:bg-white/5"
                style={{ borderBottom: showDetails ? `1px solid ${BORDER}` : "none" }}>
                <span className="text-[11px] font-semibold" style={{ color: PURPLE }}>
                  {showDetails ? "Ocultar detalles" : "Ver detalles"}
                </span>
                <ChevronDown
                  className="h-3.5 w-3.5 transition-transform duration-300"
                  style={{ color: PURPLE, transform: showDetails ? "rotate(180deg)" : "rotate(0deg)" }}
                />
              </button>

              {/* Expanded details */}
              {showDetails && (
                <>
                  {[
                    {
                      label: "Monto convertido",
                      value: hasAmt && enoughForFee
                        ? swapDir === "usdt_to_trx"
                          ? `${swapAmt.toFixed(2)} USDT`
                          : `${inputAmt.toFixed(4)} TRX`
                        : `— ${sendToken}`,
                      color: "rgba(255,255,255,0.65)",
                    },
                    {
                      label: "Tarifa swap (2%)",
                      value: hasAmt && enoughForFee
                        ? `−${swapFeeOut.toFixed(receiveToken === "USDT" ? 2 : 4)} ${receiveToken}`
                        : `— ${receiveToken}`,
                      color: hasAmt && enoughForFee ? AMBER : "rgba(255,255,255,0.15)",
                    },
                    {
                      label: "Precio TRX",
                      value: trxUsd > 0 ? `$${trxUsd.toFixed(4)} USD` : "Cargando…",
                      color: "rgba(255,255,255,0.4)",
                    },
                  ].map(({ label, value, color }, i, arr) => (
                    <div key={label} className="flex items-center justify-between px-4 py-2.5"
                      style={{
                        borderBottom: i < arr.length - 1 ? `1px solid ${BORDER}` : "none",
                        background: "rgba(255,255,255,0.015)",
                      }}>
                      <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>{label}</span>
                      <span className="text-xs font-semibold" style={{ color }}>{value}</span>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* ── Swap unavailable banner ──────────────────────────────────── */}
            {rate && !rate.swapAvailable && (
              <div className="rounded-2xl p-3.5 flex gap-3"
                style={{ background: `${AMBER}0A`, border: `1px solid ${AMBER}30` }}>
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: AMBER }} />
                <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
                  El servicio de swap no está disponible en este momento. El relayer no está configurado.
                </p>
              </div>
            )}

            {/* ── CTA ─────────────────────────────────────────────────────── */}
            <button
              onClick={handleContinue}
              disabled={quoteLoading || !hasAmt || !enoughForFee || !rate?.swapAvailable}
              className="w-full rounded-2xl py-4 text-base font-black disabled:opacity-40 transition-all flex items-center justify-center gap-2.5"
              style={{
                background: `linear-gradient(135deg, ${PURPLE}, ${PURPLE2})`,
                color: "white",
                boxShadow: hasAmt && enoughForFee && rate?.swapAvailable
                  ? `0 4px 32px ${PURPLE}55`
                  : "none",
                transition: "box-shadow 0.3s",
              }}>
              {quoteLoading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Obteniendo cotización…</>
                : <><ArrowDownUp className="h-4 w-4" /> Convertir ahora</>
              }
            </button>

            {/* CoinGecko attribution + disclaimer */}
            <p className="text-center text-[10px] leading-relaxed pb-1"
              style={{ color: "rgba(255,255,255,0.18)" }}>
              Precio TRX · CoinGecko&nbsp;&nbsp;·&nbsp;&nbsp;Las operaciones de swap son irreversibles en TRON.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
