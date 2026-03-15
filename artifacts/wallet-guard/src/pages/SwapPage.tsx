import { useState, useEffect, useCallback } from "react";
import {
  ArrowDownUp, Loader2, ChevronDown, AlertTriangle,
  CheckCircle2, Copy, CheckCheck, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import {
  fetchSwapRate, getSwapQuote, executeSwap, fetchAccountInfo,
  type SwapDirection, type SwapQuote, type SwapResult, type SwapRate, type AccountInfo,
} from "@/lib/tronApi";
import { decryptPrivateKey, hasEncryptedKey } from "@/lib/security";
import type { SavedWallet } from "@/pages/WalletsPage";

// ── Theme tokens ──────────────────────────────────────────────────────────────
const PURPLE = "#7C3AED";
const GREEN  = "#19C37D";
const AMBER  = "#F59E0B";
const BORDER = "rgba(255,255,255,0.07)";
const CARD   = "#0e1520";
const CARD2  = "#111827";

type SwapStep = "form" | "confirm" | "signing" | "done";

function fmtAmt(n: number, dec = 4) {
  return n.toLocaleString("es-CO", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function truncAddr(a: string) {
  return a.length > 14 ? `${a.slice(0, 7)}…${a.slice(-5)}` : a;
}

interface Props {
  wallets: SavedWallet[];
}

export default function SwapPage({ wallets }: Props) {
  // Filter wallets that can sign (have encrypted private key)
  const signableWallets = wallets.filter(w => hasEncryptedKey(w.id));

  // ── State ──────────────────────────────────────────────────────────────────
  const [selectedId,    setSelectedId]    = useState<string>(signableWallets[0]?.id ?? "");
  const [swapDir,       setSwapDir]       = useState<SwapDirection>("usdt_to_trx");
  const [amount,        setAmount]        = useState("");
  const [step,          setStep]          = useState<SwapStep>("form");

  const [rate,          setRate]          = useState<SwapRate | null>(null);
  const [rateLoading,   setRateLoading]   = useState(false);

  const [info,          setInfo]          = useState<AccountInfo | null>(null);
  const [infoLoading,   setInfoLoading]   = useState(false);

  const [quote,         setQuote]         = useState<SwapQuote | null>(null);
  const [quoteLoading,  setQuoteLoading]  = useState(false);

  const [result,        setResult]        = useState<SwapResult | null>(null);
  const [swapLoading,   setSwapLoading]   = useState(false);

  const [copied,        setCopied]        = useState<string | null>(null);
  const [walletOpen,    setWalletOpen]    = useState(false);

  const selectedWallet = signableWallets.find(w => w.id === selectedId) ?? signableWallets[0];

  // ── Derived values ─────────────────────────────────────────────────────────
  const COINCASH_FEE_USDT = 1;           // flat CoinCash platform fee

  const sendToken    = swapDir === "usdt_to_trx" ? "USDT" : "TRX";
  const receiveToken = swapDir === "usdt_to_trx" ? "TRX"  : "USDT";
  const trxUsd       = rate?.trxUsd ?? 0;
  const inputAmt     = parseFloat(amount) || 0;

  // ── Fee-first calculation ──────────────────────────────────────────────────
  // USDT → TRX:  deduct 1 USDT CoinCash fee FIRST, then convert the remainder
  // TRX  → USDT: convert everything, then deduct 1 USDT from the USD output
  const swapAmt = swapDir === "usdt_to_trx"
    ? Math.max(0, inputAmt - COINCASH_FEE_USDT)   // USDT available for swap
    : inputAmt;                                     // TRX — fee comes out of output

  const grossOut = swapDir === "usdt_to_trx"
    ? (trxUsd > 0 ? swapAmt / trxUsd : 0)          // TRX before 2% swap fee
    : swapAmt * trxUsd;                             // USDT before fees

  const swapFeeOut = grossOut * 0.02;               // 2% swap fee (in receive token)

  const netOut = swapDir === "usdt_to_trx"
    ? grossOut * 0.98                               // TRX after 2% fee
    : Math.max(0, grossOut * 0.98 - COINCASH_FEE_USDT);  // USDT after 2% + 1 USDT fee

  const hasAmt       = inputAmt > 0 && trxUsd > 0;
  const enoughForFee = swapDir === "usdt_to_trx"
    ? inputAmt > COINCASH_FEE_USDT                 // must be strictly above 1 USDT
    : true;                                         // TRX → USDT: fee comes from output

  const sendBalance = sendToken === "USDT" ? (info?.usdtBalance ?? 0) : (info?.trxBalance ?? 0);
  // MAX: for USDT→TRX reserve 1 USDT fee; for TRX→USDT reserve 2 TRX for network
  const maxSend = sendToken === "TRX"
    ? Math.max(0, sendBalance - 2)
    : Math.max(0, sendBalance - COINCASH_FEE_USDT);

  // ── Live TRX price — tries CoinGecko directly, falls back to backend ──────────
  // Refresh every 10 seconds as requested.
  const loadRate = useCallback(async () => {
    setRateLoading(true);
    try {
      // Primary: hit CoinGecko directly from the browser (no API key needed)
      const cgRes = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=tron&vs_currencies=usd",
        { signal: AbortSignal.timeout(5_000) }
      );
      if (cgRes.ok) {
        const cgData = await cgRes.json();
        const trxUsd: number = cgData?.tron?.usd;
        if (trxUsd && trxUsd > 0) {
          // Merge into the existing rate object (keep swapAvailable etc from last backend call)
          setRate(prev => ({
            trxUsd,
            feeRate: prev?.feeRate ?? 0.02,
            swapAvailable: prev?.swapAvailable ?? true,
            relayerAddress: prev?.relayerAddress ?? "",
          }));
          setRateLoading(false);
          return;
        }
      }
    } catch { /* CoinGecko failed — fall through to backend */ }

    // Fallback: backend relay (caches its own CoinGecko call)
    try {
      const r = await fetchSwapRate();
      setRate(r);
    } catch { /* silently ignore */ }
    setRateLoading(false);
  }, []);

  useEffect(() => {
    loadRate();
    const id = setInterval(loadRate, 10_000);  // refresh every 10 s
    return () => clearInterval(id);
  }, [loadRate]);

  // ── Load wallet account info when wallet or direction changes ───────────────
  useEffect(() => {
    if (!selectedWallet) return;
    setInfoLoading(true);
    fetchAccountInfo(selectedWallet.address)
      .then(i => { setInfo(i); setInfoLoading(false); })
      .catch(() => setInfoLoading(false));
  }, [selectedWallet?.address]);

  // ── Reset form ─────────────────────────────────────────────────────────────
  const reset = () => {
    setStep("form");
    setAmount("");
    setQuote(null);
    setResult(null);
  };

  // ── Get quote → confirm ─────────────────────────────────────────────────────
  const handleContinue = async () => {
    if (!hasAmt) { toast.error("Ingresa un monto válido."); return; }

    // Minimum check: for USDT→TRX the user must send more than the 1 USDT CoinCash fee
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
      // Pass the full inputAmt — the backend deducts the 1 USDT CoinCash fee internally
      const q = await getSwapQuote(swapDir, inputAmt);
      setQuote(q);
      setStep("confirm");
    } catch (e: any) {
      toast.error(e?.message ?? "Error al obtener cotización.");
    } finally {
      setQuoteLoading(false);
    }
  };

  // ── Execute swap ────────────────────────────────────────────────────────────
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

  // ── No signable wallets ─────────────────────────────────────────────────────
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
    <div className="min-h-screen pb-24" style={{ background: "#080d14" }}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 px-5 pt-12 pb-4"
        style={{ background: "rgba(8,13,20,0.92)", backdropFilter: "blur(20px)", borderBottom: `1px solid ${BORDER}` }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xl font-black text-white tracking-tight">Swap</p>
            <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
              Convierte USDT ↔ TRX al instante
            </p>
          </div>
          <button onClick={() => loadRate()} disabled={rateLoading}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold"
            style={{ background: "rgba(255,255,255,0.05)", color: trxUsd > 0 ? GREEN : "rgba(255,255,255,0.4)" }}>
            {rateLoading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5" />
            }
            {trxUsd > 0
              ? <span>TRX <span className="font-black">${trxUsd.toFixed(4)}</span></span>
              : "Cargando…"
            }
          </button>
        </div>
      </div>

      <div className="px-5 pt-5">

        {/* ── DONE ──────────────────────────────────────────────────────────── */}
        {step === "done" && result && (
          <div className="flex flex-col items-center gap-5 pt-4">
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

            {/* Summary card — 5-line fee breakdown */}
            <div className="w-full rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}`, background: CARD2 }}>
              <div className="px-4 py-2" style={{ background: `${PURPLE}0A`, borderBottom: `1px solid ${BORDER}` }}>
                <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: PURPLE }}>Resumen</p>
              </div>
              {[
                ["Monto enviado",     `${quote?.inputAmount.toFixed(quote?.inputToken === "USDT" ? 2 : 4) ?? "—"} ${sendToken}`,  "white"],
                ["Comisión CoinCash", `−${(quote?.coinCashFeeUsdt ?? 1).toFixed(2)} USDT`,                                         AMBER],
                ["Monto convertido",  quote?.inputToken === "USDT"
                    ? `${(quote?.swapAmount ?? 0).toFixed(2)} USDT`
                    : `${(quote?.inputAmount ?? 0).toFixed(4)} TRX`,                                                               "white"],
                ["Tarifa swap (2%)",  `−${result.feeAmount.toFixed(receiveToken === "USDT" ? 2 : 4)} ${receiveToken}`,            AMBER],
                ["Recibiste",         `${result.outputAmount.toFixed(receiveToken === "USDT" ? 2 : 4)} ${receiveToken}`,           GREEN],
                ["Tasa utilizada",    `1 TRX = $${quote?.trxUsd.toFixed(4) ?? "—"} USD`,                                         "rgba(255,255,255,0.4)"],
              ].map(([lbl, val, col], i, arr) => (
                <div key={lbl} className="flex items-center justify-between px-4 py-2.5"
                  style={{ borderBottom: i < arr.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                  <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{lbl}</span>
                  <span className="text-xs font-bold" style={{ color: col as string }}>{val}</span>
                </div>
              ))}
            </div>

            {/* TX IDs */}
            {[
              { label: "TX de entrada", value: result.inputTxId },
              { label: "TX de salida",  value: result.outputTxId },
            ].map(({ label, value }) => (
              <div key={label} className="w-full rounded-2xl p-3.5"
                style={{ background: CARD2, border: `1px solid ${BORDER}` }}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide"
                    style={{ color: "rgba(255,255,255,0.3)" }}>{label}</p>
                  <button onClick={() => copyTx(value)}
                    className="p-1 rounded-lg" style={{ background: "rgba(255,255,255,0.06)" }}>
                    {copied === value
                      ? <CheckCheck className="h-3 w-3" style={{ color: GREEN }} />
                      : <Copy className="h-3 w-3" style={{ color: "rgba(255,255,255,0.4)" }} />
                    }
                  </button>
                </div>
                <p className="text-[10px] font-mono break-all leading-relaxed"
                  style={{ color: "rgba(255,255,255,0.55)" }}>{value}</p>
              </div>
            ))}

            <button onClick={reset}
              className="w-full rounded-2xl py-4 text-sm font-bold mt-2"
              style={{ background: PURPLE, color: "white", boxShadow: `0 0 24px ${PURPLE}40` }}>
              Hacer otro swap
            </button>
          </div>
        )}

        {/* ── SIGNING ───────────────────────────────────────────────────────── */}
        {step === "signing" && (
          <div className="flex flex-col items-center justify-center py-24 gap-5">
            <div className="relative h-20 w-20 rounded-full flex items-center justify-center"
              style={{ background: `${PURPLE}18`, border: `2px solid ${PURPLE}40` }}>
              <Loader2 className="h-9 w-9 animate-spin" style={{ color: PURPLE }} />
            </div>
            <div className="text-center">
              <p className="text-base font-bold text-white mb-2">Ejecutando swap…</p>
              <p className="text-xs max-w-[220px] mx-auto leading-relaxed"
                style={{ color: "rgba(255,255,255,0.4)" }}>
                Firmando y transmitiendo la transacción. No cierres la aplicación.
              </p>
            </div>
          </div>
        )}

        {/* ── CONFIRM ───────────────────────────────────────────────────────── */}
        {step === "confirm" && quote && (
          <div className="flex flex-col gap-5">
            <p className="text-base font-bold text-white">Confirmar Swap</p>

            {/* 5-line fee breakdown */}
            <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}`, background: CARD2 }}>
              {/* Header */}
              <div className="px-4 py-2.5" style={{ background: `${PURPLE}0A`, borderBottom: `1px solid ${BORDER}` }}>
                <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: PURPLE }}>
                  Desglose de la operación
                </p>
              </div>
              {[
                ["Monto ingresado",   `${quote.inputAmount.toFixed(quote.inputToken === "USDT" ? 2 : 4)} ${quote.inputToken}`,     "white"],
                ["Comisión CoinCash", `−${quote.coinCashFeeUsdt.toFixed(2)} USDT`,                                                  AMBER],
                ["Monto a convertir", quote.inputToken === "USDT"
                    ? `${quote.swapAmount.toFixed(2)} USDT`
                    : `${quote.inputAmount.toFixed(4)} TRX`,                                                                        "white"],
                ["Tarifa swap (2%)",  `−${quote.feeAmount.toFixed(quote.outputToken === "USDT" ? 2 : 4)} ${quote.outputToken}`,    AMBER],
                ["Recibirás ≈",       `${quote.outputAmount.toFixed(quote.outputToken === "USDT" ? 2 : 4)} ${quote.outputToken}`,  GREEN],
                ["Tasa de cambio",    `1 TRX = $${quote.trxUsd.toFixed(4)} USD`,                                                   "rgba(255,255,255,0.5)"],
                ["Red",               "Cubierta por CoinCash ✓",                                                                    GREEN],
              ].map(([lbl, val, col], i, arr) => (
                <div key={lbl} className="flex items-start justify-between px-4 py-3"
                  style={{ borderBottom: i < arr.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                  <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{lbl}</span>
                  <span className="text-xs font-semibold" style={{ color: col as string }}>{val}</span>
                </div>
              ))}
            </div>

            {/* Warning */}
            <div className="rounded-2xl p-3.5 flex gap-3"
              style={{ background: `${AMBER}08`, border: `1px solid ${AMBER}25` }}>
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: AMBER }} />
              <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
                Esta cotización expira en <span className="font-semibold" style={{ color: AMBER }}>60 segundos</span>.
                Las transacciones en blockchain son <span className="font-semibold" style={{ color: "#EF4444" }}>irreversibles</span>.
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
                style={{ background: PURPLE, color: "white", boxShadow: `0 0 20px ${PURPLE}40` }}>
                Convertir
              </button>
            </div>
          </div>
        )}

        {/* ── FORM ──────────────────────────────────────────────────────────── */}
        {step === "form" && (
          <div className="flex flex-col gap-4">

            {/* Wallet selector */}
            <div className="relative">
              <p className="text-[11px] font-semibold uppercase tracking-wide mb-2"
                style={{ color: "rgba(255,255,255,0.35)" }}>Billetera</p>
              <button
                onClick={() => setWalletOpen(o => !o)}
                className="w-full flex items-center justify-between rounded-2xl px-4 py-3.5"
                style={{ background: CARD2, border: `1px solid ${BORDER}` }}>
                <div className="text-left">
                  <p className="text-sm font-semibold text-white truncate max-w-[220px]">
                    {selectedWallet?.name ?? "Sin billetera"}
                  </p>
                  <p className="text-[10px] mt-0.5 font-mono" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {selectedWallet ? truncAddr(selectedWallet.address) : "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {infoLoading
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "rgba(255,255,255,0.3)" }} />
                    : <span className="text-xs font-bold" style={{ color: GREEN }}>
                        {sendToken === "USDT"
                          ? `${fmtAmt(info?.usdtBalance ?? 0, 2)} USDT`
                          : `${fmtAmt(info?.trxBalance ?? 0, 4)} TRX`
                        }
                      </span>
                  }
                  <ChevronDown className="h-4 w-4" style={{ color: "rgba(255,255,255,0.3)" }} />
                </div>
              </button>

              {walletOpen && (
                <div className="absolute top-full mt-1 left-0 right-0 z-20 rounded-2xl overflow-hidden"
                  style={{ background: CARD, border: `1px solid ${BORDER}`, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
                  {signableWallets.map(w => (
                    <button key={w.id}
                      onClick={() => { setSelectedId(w.id); setWalletOpen(false); setAmount(""); setInfo(null); }}
                      className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/5"
                      style={{ borderBottom: `1px solid ${BORDER}` }}>
                      <div>
                        <p className="text-sm font-semibold text-white">{w.name}</p>
                        <p className="text-[10px] font-mono mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                          {truncAddr(w.address)}
                        </p>
                      </div>
                      {w.id === selectedId && (
                        <span className="h-2 w-2 rounded-full" style={{ background: GREEN }} />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Token swap card */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide mb-2"
                style={{ color: "rgba(255,255,255,0.35)" }}>Tokens</p>
              <div className="rounded-2xl overflow-hidden relative"
                style={{ border: `1px solid ${BORDER}`, background: CARD2 }}>

                {/* Token to send */}
                <div className="px-4 py-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide mb-2"
                    style={{ color: "rgba(255,255,255,0.3)" }}>Envías</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-black"
                        style={{
                          background: sendToken === "USDT" ? "rgba(38,161,123,0.2)" : "rgba(255,0,0,0.15)",
                          color: sendToken === "USDT" ? "#26A17B" : "#FF4444",
                        }}>
                        {sendToken === "USDT" ? "₮" : "T"}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{sendToken}</p>
                        <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                          {sendToken === "USDT" ? "Tether USD" : "TRON"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.3)" }}>
                        Disponible: {fmtAmt(sendBalance, sendToken === "USDT" ? 2 : 4)}
                      </p>
                      <button
                        onClick={() => setSwapDir(d => d === "usdt_to_trx" ? "trx_to_usdt" : "usdt_to_trx")}
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-lg"
                        style={{ background: `${PURPLE}20`, color: PURPLE }}>
                        Cambiar
                      </button>
                    </div>
                  </div>
                </div>

                {/* Swap arrow */}
                <div className="absolute left-1/2 -translate-x-1/2 z-10"
                  style={{ top: "calc(50% - 16px)" }}>
                  <button
                    onClick={() => { setSwapDir(d => d === "usdt_to_trx" ? "trx_to_usdt" : "usdt_to_trx"); setAmount(""); }}
                    className="h-8 w-8 rounded-full flex items-center justify-center"
                    style={{ background: CARD, border: `2px solid ${BORDER}`, boxShadow: "0 2px 12px rgba(0,0,0,0.5)" }}>
                    <ArrowDownUp className="h-3.5 w-3.5" style={{ color: PURPLE }} />
                  </button>
                </div>

                {/* Token to receive */}
                <div className="px-4 py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wide mb-2"
                    style={{ color: "rgba(255,255,255,0.3)" }}>Recibirás</p>
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-black"
                      style={{
                        background: receiveToken === "USDT" ? "rgba(38,161,123,0.2)" : "rgba(255,0,0,0.15)",
                        color: receiveToken === "USDT" ? "#26A17B" : "#FF4444",
                      }}>
                      {receiveToken === "USDT" ? "₮" : "T"}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">{receiveToken}</p>
                      <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                        {receiveToken === "USDT" ? "Tether USD" : "TRON"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Amount input */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide"
                  style={{ color: "rgba(255,255,255,0.35)" }}>Monto a enviar</p>
                <button
                  onClick={() => setAmount(maxSend > 0 ? maxSend.toFixed(sendToken === "USDT" ? 2 : 6) : "0")}
                  className="text-[11px] font-bold px-2.5 py-1 rounded-lg"
                  style={{ background: `${PURPLE}18`, color: PURPLE }}>
                  MAX
                </button>
              </div>
              <div className="relative">
                <input
                  type="number" inputMode="decimal" placeholder="0.00"
                  value={amount} onChange={e => setAmount(e.target.value)}
                  className="w-full rounded-2xl px-4 py-4 pr-20 text-2xl font-black text-white outline-none text-center"
                  style={{ background: CARD2, border: `1px solid ${hasAmt ? PURPLE + "60" : BORDER}` }}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold"
                  style={{ color: "rgba(255,255,255,0.3)" }}>{sendToken}</span>
              </div>
            </div>

            {/* Rate + estimate card */}
            <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}`, background: CARD2 }}>

              {/* Header: live CoinGecko price */}
              <div className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: `1px solid ${BORDER}`, background: `${PURPLE}0A` }}>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: PURPLE }}>
                    Precio TRX · CoinGecko
                  </span>
                  {rateLoading && <Loader2 className="h-3 w-3 animate-spin" style={{ color: PURPLE }} />}
                </div>
                {trxUsd > 0
                  ? <span className="text-[12px] font-black" style={{ color: PURPLE }}>
                      1 TRX = ${trxUsd.toFixed(4)} USD
                    </span>
                  : <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>Cargando…</span>
                }
              </div>

              {/* Formula row — shows fee-first calculation when amount is entered */}
              {hasAmt && trxUsd > 0 && enoughForFee && (
                <div className="px-4 py-2.5"
                  style={{ borderBottom: `1px solid ${BORDER}`, background: "rgba(25,195,125,0.04)" }}>
                  {swapDir === "usdt_to_trx" ? (
                    <p className="text-[10px] font-mono text-center leading-relaxed"
                      style={{ color: "rgba(255,255,255,0.35)" }}>
                      ({inputAmt.toFixed(2)} − 1) USDT ÷ ${trxUsd.toFixed(4)} = {grossOut.toFixed(4)} TRX
                    </p>
                  ) : (
                    <p className="text-[10px] font-mono text-center leading-relaxed"
                      style={{ color: "rgba(255,255,255,0.35)" }}>
                      {inputAmt.toFixed(4)} TRX × ${trxUsd.toFixed(4)} = ${grossOut.toFixed(2)} USDT − 1 fee
                    </p>
                  )}
                </div>
              )}
              {hasAmt && trxUsd > 0 && !enoughForFee && (
                <div className="px-4 py-2.5"
                  style={{ borderBottom: `1px solid ${BORDER}`, background: "rgba(245,158,11,0.06)" }}>
                  <p className="text-[10px] text-center" style={{ color: AMBER }}>
                    Monto mínimo: {(COINCASH_FEE_USDT + 0.01).toFixed(2)} USDT (incluye comisión de 1 USDT)
                  </p>
                </div>
              )}

              {/* Recibirás ≈ — the key result */}
              <div className="flex items-center justify-between px-4 py-3.5"
                style={{ borderBottom: `1px solid ${BORDER}` }}>
                <div>
                  <span className="text-xs font-bold text-white">Recibirás ≈</span>
                  {hasAmt && (
                    <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
                      después de tarifa del 2%
                    </p>
                  )}
                </div>
                <span className="text-lg font-black" style={{ color: hasAmt ? GREEN : "rgba(255,255,255,0.15)" }}>
                  {hasAmt
                    ? `${netOut.toFixed(receiveToken === "USDT" ? 2 : 4)} ${receiveToken}`
                    : `— ${receiveToken}`
                  }
                </span>
              </div>

              {/* Swap fee 2% */}
              <div className="flex items-center justify-between px-4 py-2.5"
                style={{ borderBottom: `1px solid ${BORDER}` }}>
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Tarifa swap (2%)</span>
                <span className="text-xs font-semibold" style={{ color: AMBER }}>
                  {hasAmt
                    ? `−${swapFeeOut.toFixed(receiveToken === "USDT" ? 2 : 4)} ${receiveToken}`
                    : `0 ${receiveToken}`
                  }
                </span>
              </div>

              {/* CoinCash service fee */}
              <div className="flex items-center justify-between px-4 py-2.5"
                style={{ borderBottom: `1px solid ${BORDER}` }}>
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Comisión CoinCash</span>
                <span className="text-xs font-semibold" style={{ color: AMBER }}>−1 USDT</span>
              </div>

              {/* Network fee */}
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Tarifa de red</span>
                <span className="text-xs font-semibold" style={{ color: GREEN }}>Cubierta por CoinCash ✓</span>
              </div>
            </div>

            {/* Swap unavailable banner */}
            {rate && !rate.swapAvailable && (
              <div className="rounded-2xl p-3.5 flex gap-3"
                style={{ background: `${AMBER}0A`, border: `1px solid ${AMBER}30` }}>
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: AMBER }} />
                <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
                  El servicio de swap no está disponible en este momento. El relayer no está configurado.
                </p>
              </div>
            )}

            {/* CTA */}
            <button
              onClick={handleContinue}
              disabled={quoteLoading || !hasAmt || !rate?.swapAvailable}
              className="w-full rounded-2xl py-4 text-sm font-black disabled:opacity-40 transition-all"
              style={{
                background: PURPLE,
                color: "white",
                boxShadow: hasAmt && rate?.swapAvailable ? `0 0 28px ${PURPLE}50` : "none",
              }}>
              {quoteLoading
                ? <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Obteniendo cotización…
                  </span>
                : "Convertir"
              }
            </button>

            {/* Disclaimer */}
            <p className="text-center text-[10px] leading-relaxed pb-2"
              style={{ color: "rgba(255,255,255,0.2)" }}>
              Los swaps son operaciones irreversibles en la blockchain de TRON.
              CoinCash no asume responsabilidad por pérdidas.
            </p>

          </div>
        )}
      </div>
    </div>
  );
}
