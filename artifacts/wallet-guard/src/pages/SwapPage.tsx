// @ts-nocheck
import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowDownUp, Loader2, ChevronDown, AlertTriangle,
  CheckCircle2, Copy, CheckCheck, Clock, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";
import {
  fetchSwapRate, getSwapQuote, executeSwap, createExternalOrder,
  fetchOrderStatus, fetchAccountInfo,
  type SwapDirection, type SwapQuote, type SwapResult, type SwapRate,
  type AccountInfo, type ExternalOrderResult, type OrderStatus,
} from "@/lib/tronApi";
import { decryptPrivateKey, hasEncryptedKey } from "@/lib/security";
import type { SavedWallet } from "@/pages/WalletsPage";

// ── Shared wallet balance cache (same key as WalletDetailSheet) ───────────────
// Reads the last-known balance from localStorage instantly so Swap never shows
// 0 while the live fetch is in progress — or if the live fetch silently fails.
interface WalletCache { info: AccountInfo; txs: unknown[]; ts: number; }
function swapCacheKey(addr: string) { return `wg_wallet_cache_${addr}`; }
function readSwapCache(addr: string): AccountInfo | null {
  try {
    const raw = localStorage.getItem(swapCacheKey(addr));
    if (!raw) return null;
    const parsed: WalletCache = JSON.parse(raw);
    return parsed?.info ?? null;
  } catch { return null; }
}

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

type SwapStep = "form" | "confirm" | "signing" | "done" | "deposit";
type SwapMode = "wallet" | "external";

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

interface Props { wallets: SavedWallet[]; activeTab?: string; }

export default function SwapPage({ wallets, activeTab }: Props) {
  const signableWallets = wallets.filter(w => hasEncryptedKey(w.id));

  // ── State ────────────────────────────────────────────────────────────────────
  const [swapMode,     setSwapMode]     = useState<SwapMode>(signableWallets.length > 0 ? "wallet" : "external");
  const [selectedId,   setSelectedId]   = useState<string>(signableWallets[0]?.id ?? "");
  const [swapDir,      setSwapDir]      = useState<SwapDirection>("usdt_to_trx");
  const [amount,       setAmount]       = useState("");
  const [step,         setStep]         = useState<SwapStep>("form");

  // External swap state
  const [destAddr,     setDestAddr]     = useState("");
  const [extOrder,     setExtOrder]     = useState<ExternalOrderResult | null>(null);
  const [extLoading,   setExtLoading]   = useState(false);
  const [orderStatus,  setOrderStatus]  = useState<OrderStatus | null>(null);
  const [qrDataUrl,    setQrDataUrl]    = useState<string>("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
  const sendToken    = swapDir === "usdt_to_trx" ? "USDT" : "TRX";
  const receiveToken = swapDir === "usdt_to_trx" ? "TRX"  : "USDT";
  const trxUsd       = rate?.trxUsd ?? 0;
  const inputAmt     = parseFloat(normAmt(amount)) || 0;

  // No CoinCash fee — FF swap uses full inputAmt
  const swapAmt = inputAmt;

  const grossOut = swapDir === "usdt_to_trx"
    ? (trxUsd > 0 ? swapAmt / trxUsd : 0)
    : swapAmt * trxUsd;

  // ~2% FF spread estimate
  const netOut = grossOut * 0.98;

  const hasAmt      = inputAmt > 0 && trxUsd > 0;
  const sendBalance = sendToken === "USDT" ? (info?.usdtBalance ?? 0) : (info?.trxBalance ?? 0);
  const maxSend     = sendToken === "TRX"
    ? Math.max(0, sendBalance - 2)
    : Math.max(0, sendBalance);

  // Single reference price — always expressed as "1 USDT ≈ X TRX" for clarity.
  // Derived from the same trxUsd source used for all swap calculations.
  const usdtPerTrx      = trxUsd > 0 ? 1 / trxUsd : 0;
  const marketRateLabel = trxUsd > 0
    ? `1 USDT ≈ ${usdtPerTrx.toFixed(2)} TRX`
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

  // ── Balance loader — callable from anywhere ───────────────────────────────────
  // Strategy:
  //   1. Show the localStorage cache instantly (same data WalletDetailSheet writes)
  //   2. Run a live fetchAccountInfo in the background
  //   3. Merge: keep the HIGHER USDT / TRX value so a silently-zeroed live call
  //      never overwrites a valid cached balance.
  const loadBalance = useCallback(async (address: string) => {
    // Step 1 — populate from cache so the UI never starts at 0
    const cached = readSwapCache(address);
    if (cached) setInfo(cached);

    setInfoLoading(true);
    try {
      const live = await fetchAccountInfo(address);
      setInfo(prev => {
        // If the live call returned 0 USDT but we had a valid cached / prior value,
        // keep the better number. The live USDT balance should only go down if we're
        // sure it really is 0 (i.e., the live result is fresh and the cache has 0 too).
        const bestUsdt = (live.usdtBalance > 0 || (prev?.usdtBalance ?? 0) === 0)
          ? live.usdtBalance
          : Math.max(live.usdtBalance, prev?.usdtBalance ?? 0);
        const bestTrx  = live.trxBalance > 0
          ? live.trxBalance
          : Math.max(live.trxBalance, prev?.trxBalance ?? 0);
        return { ...live, usdtBalance: bestUsdt, trxBalance: bestTrx };
      });
    } catch { /* silently keep whatever is already shown */ }
    setInfoLoading(false);
  }, []);

  // Refresh on wallet change
  useEffect(() => {
    if (!selectedWallet) return;
    loadBalance(selectedWallet.address);
  }, [selectedWallet?.address, loadBalance]);

  // Refresh every time the Swap tab becomes active
  useEffect(() => {
    if (activeTab !== "swap" || !selectedWallet) return;
    loadBalance(selectedWallet.address);
  }, [activeTab, loadBalance]);  // selectedWallet?.address covered by the effect above

  // Periodic refresh every 30 s while the Swap tab is visible
  useEffect(() => {
    if (activeTab !== "swap" || !selectedWallet) return;
    const id = setInterval(() => loadBalance(selectedWallet.address), 30_000);
    return () => clearInterval(id);
  }, [activeTab, selectedWallet?.address, loadBalance]);

  // ── QR code generation when deposit step opens ───────────────────────────────
  useEffect(() => {
    if (step !== "deposit" || !extOrder?.depositAddress) { setQrDataUrl(""); return; }
    QRCode.toDataURL(extOrder.depositAddress, {
      width:  180, margin: 1,
      color: { dark: "#7C3AED", light: "#111827" },
    }).then(setQrDataUrl).catch(() => setQrDataUrl(""));
  }, [step, extOrder?.depositAddress]);

  // ── Order status polling (every 12 s while deposit step is open) ─────────────
  useEffect(() => {
    if (step !== "deposit" || !extOrder?.orderId || !extOrder?.ffToken) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    const poll = async () => {
      try {
        const s = await fetchOrderStatus(extOrder.orderId, extOrder.ffToken);
        setOrderStatus(s);
        if (s.status === "DONE" || s.status === "EXPIRED" || s.status === "EMERGENCY") {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        }
      } catch { /* silent — don't spam error toasts on polling failures */ }
    };
    poll(); // immediate first poll
    pollRef.current = setInterval(poll, 12_000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [step, extOrder?.orderId, extOrder?.ffToken]);

  const reset = () => {
    setStep("form"); setAmount(""); setQuote(null); setResult(null);
    setExtOrder(null); setDestAddr(""); setOrderStatus(null); setQrDataUrl("");
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  // ── Flip direction with animation ─────────────────────────────────────────────
  const flipDirection = () => {
    setFlipping(true);
    setTimeout(() => setFlipping(false), 350);
    setSwapDir(d => d === "usdt_to_trx" ? "trx_to_usdt" : "usdt_to_trx");
    setAmount("");
  };

  const handleContinue = async () => {
    if (!hasAmt) { toast.error("Ingresa un monto válido."); return; }

    // ── External swap mode: no wallet needed ─────────────────────────────────
    if (swapMode === "external") {
      const dest = destAddr.trim();
      if (!dest || !dest.startsWith("T") || dest.length < 30) {
        toast.error("Ingresa una dirección TRON de destino válida (empieza con T).");
        return;
      }
      if (!rate?.ffConfigured) {
        toast.error("El servicio de intercambio no está disponible en este momento.");
        return;
      }
      setExtLoading(true);
      try {
        const order = await createExternalOrder(swapDir, inputAmt, dest);
        setExtOrder(order);
        setStep("deposit");
      } catch (e: any) {
        toast.error(e?.message ?? "Error al crear la orden de intercambio.");
      } finally {
        setExtLoading(false);
      }
      return;
    }

    // ── Wallet swap mode: create FF order using wallet address as destination ──
    if (!selectedWallet) {
      toast.error("Selecciona una billetera CoinCash.");
      return;
    }
    if (inputAmt > maxSend) {
      toast.error(`Saldo insuficiente. Disponible: ${fmtAmt(maxSend, sendToken === "USDT" ? 2 : 4)} ${sendToken}`);
      return;
    }
    if (!rate?.ffConfigured) {
      toast.error("El servicio de intercambio no está disponible en este momento.");
      return;
    }
    setExtLoading(true);
    try {
      const order = await createExternalOrder(swapDir, inputAmt, selectedWallet.address);
      setExtOrder(order);
      setStep("deposit");
    } catch (e: any) {
      toast.error(e?.message ?? "Error al crear la orden de intercambio.");
    } finally {
      setExtLoading(false);
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
      // Refresh balance so the new amount is visible when the user returns to form
      loadBalance(selectedWallet.address);
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

  // ── No signable wallets → auto-switch to external mode ──────────────────────
  if (false && signableWallets.length === 0) {
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
                    : `${(quote?.swapAmount ?? 0).toFixed(4)} TRX`,                                                                 "white"],
                ["Procesado por",      "CoinCash",                                                                                   "rgba(255,255,255,0.5)"],
                ["Recibiste ✓",       `${result.outputAmount.toFixed(receiveToken === "USDT" ? 2 : 4)} ${receiveToken}`,            GREEN],
                ["Tasa utilizada",    quote?.trxPerUsdt
                    ? `1 USDT ≈ ${quote.trxPerUsdt.toFixed(2)} TRX`
                    : quote?.trxUsd ? `1 USDT ≈ ${(1 / quote.trxUsd).toFixed(2)} TRX` : "—",                                      "rgba(255,255,255,0.35)"],
              ].map(([lbl, val, col], i, arr) => (
                <div key={lbl} className="flex items-center justify-between px-4 py-2.5"
                  style={{ borderBottom: i < arr.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                  <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{lbl}</span>
                  <span className="text-xs font-bold" style={{ color: col as string }}>{val}</span>
                </div>
              ))}
            </div>

            {/* TX IDs + FF Order ID */}
            {[
              { label: "TX de entrada",        value: result.inputTxId,    mono: true },
              { label: "TX de salida",           value: result.relayTxId,    mono: true },
              ...(result.ffOrderId ? [{ label: "ID de orden",      value: result.ffOrderId, mono: false }] : []),
            ].map(({ label, value, mono }) => (
                <div key={label} className="w-full rounded-2xl p-3.5" style={{ background: CARD2, border: `1px solid ${BORDER}` }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.3)" }}>{label}</p>
                    <button onClick={() => copyTx(value)} className="p-1 rounded-lg" style={{ background: "rgba(255,255,255,0.06)" }}>
                      {copied === value
                        ? <CheckCheck className="h-3 w-3" style={{ color: GREEN }} />
                        : <Copy className="h-3 w-3" style={{ color: "rgba(255,255,255,0.4)" }} />}
                    </button>
                  </div>
                  <p className={`text-[10px] break-all leading-relaxed ${mono ? "font-mono" : "font-medium"}`}
                    style={{ color: mono ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.7)" }}>{value}</p>
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
                <span className="text-[10px] font-mono text-center" style={{ color: "rgba(255,255,255,0.25)" }}>
                  {quote.trxUsd > 0
                    ? `1 USDT ≈ ${(1 / quote.trxUsd).toFixed(2)} TRX`
                    : "—"}
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
                    : `${quote.swapAmount.toFixed(4)} TRX`,                                                                        "white"],
                ["Procesado por",       "Swap procesado por CoinCash",                                                               "rgba(255,255,255,0.5)"],
                ["Recibirás ≈",        `${quote.outputAmount.toFixed(quote.outputToken === "USDT" ? 2 : 4)} ${quote.outputToken}`,  GREEN],
                ["Tarifa de red",      "Cubierta por CoinCash ✓",                                                                   GREEN],
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
            DEPOSIT STEP  —  External swap: show deposit address to user
        ════════════════════════════════════════════════════════════════════ */}
        {step === "deposit" && extOrder && (() => {
          // ── Status badge helper ───────────────────────────────────────────────
          const statusMeta: Record<string, { label: string; color: string; bg: string }> = {
            NEW:       { label: "Esperando depósito", color: "#60A5FA", bg: "#1E3A5F" },
            PENDING:   { label: "Depósito recibido",  color: AMBER,      bg: "#3B2800" },
            EXCHANGE:  { label: "Procesando",         color: PURPLE2,    bg: "#2D1760" },
            WITHDRAW:  { label: "Enviando fondos",    color: PURPLE2,    bg: "#2D1760" },
            DONE:      { label: "¡Completado!",       color: GREEN,      bg: "#0A2E1E" },
            EXPIRED:   { label: "Expirada",           color: RED,        bg: "#2E0A0A" },
            EMERGENCY: { label: "Requiere atención",  color: RED,        bg: "#2E0A0A" },
          };
          const live       = orderStatus?.status ?? "NEW";
          const meta       = statusMeta[live] ?? { label: live, color: "rgba(255,255,255,0.5)", bg: "transparent" };
          const isDone     = live === "DONE";
          const isExpired  = live === "EXPIRED" || live === "EMERGENCY";
          const outputAmt  = orderStatus?.toAmount
            ? parseFloat(orderStatus.toAmount)
            : extOrder.expectedOutput;

          return (
            <div className="flex flex-col items-center gap-4 pt-2">
              {/* Header icon + title + live status badge */}
              <div className="flex flex-col items-center gap-2">
                <div className="rounded-full flex items-center justify-center"
                  style={{ background: isDone ? `${GREEN}18` : `${PURPLE}18`, border: `2px solid ${isDone ? GREEN : PURPLE}50`, width: 72, height: 72 }}>
                  {isDone
                    ? <CheckCircle2 className="h-9 w-9" style={{ color: GREEN }} />
                    : <Clock className="h-9 w-9" style={{ color: PURPLE }} />}
                </div>
                <p className="text-xl font-black text-white">
                  {isDone ? "¡Completado!" : "¡Orden creada!"}
                </p>
                <div className="flex items-center gap-1.5 rounded-xl px-3 py-1.5"
                  style={{ background: meta.bg, border: `1px solid ${meta.color}30` }}>
                  {!isDone && !isExpired && <RefreshCw className="h-3 w-3 animate-spin" style={{ color: meta.color }} />}
                  {isDone && <CheckCircle2 className="h-3 w-3" style={{ color: meta.color }} />}
                  {isExpired && <AlertTriangle className="h-3 w-3" style={{ color: meta.color }} />}
                  <span className="text-xs font-bold" style={{ color: meta.color }}>{meta.label}</span>
                </div>
              </div>

              {/* QR code */}
              {qrDataUrl && !isDone && (
                <div className="rounded-2xl p-3 flex flex-col items-center gap-2"
                  style={{ background: CARD2, border: `1px solid ${BORDER}` }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>
                    Escanea para enviar
                  </p>
                  <img src={qrDataUrl} alt="QR depósito" width={160} height={160}
                    style={{ borderRadius: 10, imageRendering: "pixelated" }} />
                </div>
              )}

              {/* Deposit address card */}
              {!isDone && (
                <div className="w-full rounded-2xl overflow-hidden" style={{ border: `1px solid ${PURPLE}40`, background: CARD2 }}>
                  <div className="px-4 py-2.5" style={{ background: `${PURPLE}15`, borderBottom: `1px solid ${BORDER}` }}>
                    <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: PURPLE }}>
                      Envía exactamente {extOrder.fromAmount} {extOrder.fromToken} a:
                    </p>
                  </div>
                  <div className="px-4 py-3.5 flex items-start justify-between gap-3">
                    <p className="text-xs font-mono break-all leading-relaxed flex-1" style={{ color: "rgba(255,255,255,0.85)" }}>
                      {extOrder.depositAddress}
                    </p>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(extOrder.depositAddress);
                        setCopied(extOrder.depositAddress);
                        setTimeout(() => setCopied(null), 2000);
                        toast.success("Dirección copiada");
                      }}
                      className="shrink-0 p-2 rounded-xl transition-colors"
                      style={{ background: `${PURPLE}20`, border: `1px solid ${PURPLE}40` }}>
                      {copied === extOrder.depositAddress
                        ? <CheckCheck className="h-4 w-4" style={{ color: GREEN }} />
                        : <Copy className="h-4 w-4" style={{ color: PURPLE }} />}
                    </button>
                  </div>
                </div>
              )}

              {/* Order details */}
              <div className="w-full rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}`, background: CARD2 }}>
                <div className="px-4 py-2.5" style={{ background: `${PURPLE}08`, borderBottom: `1px solid ${BORDER}` }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: PURPLE }}>Detalles del intercambio</p>
                </div>
                {[
                  ["Enviando",       `${extOrder.fromAmount} ${extOrder.fromToken}`,                                                    "white"],
                  ["Recibirás ≈",   outputAmt > 0 ? `${outputAmt.toFixed(extOrder.toToken === "USDT" ? 2 : 2)} ${extOrder.toToken}` : `— ${extOrder.toToken}`, GREEN],
                  ["Tasa",          extOrder.trxUsd > 0 ? `1 USDT ≈ ${(1/extOrder.trxUsd).toFixed(2)} TRX` : "—",                     "rgba(255,255,255,0.4)"],
                  ["ID de orden",   extOrder.orderId,                                                                                    "rgba(255,255,255,0.5)"],
                ].map(([lbl, val, col], i, arr) => (
                  <div key={lbl} className="flex items-center justify-between px-4 py-2.5"
                    style={{ borderBottom: i < arr.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                    <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{lbl}</span>
                    <span className={`text-xs font-semibold ${lbl === "ID de orden" ? "font-mono" : ""} max-w-[180px] text-right truncate`}
                      style={{ color: col as string }}>{val}</span>
                  </div>
                ))}
              </div>

              {/* Destination card */}
              <div className="w-full rounded-2xl p-3.5" style={{ background: `${GREEN}08`, border: `1px solid ${GREEN}25` }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: GREEN }}>
                  {extOrder.toToken} será enviado a
                </p>
                <p className="text-xs font-mono break-all leading-relaxed" style={{ color: "rgba(255,255,255,0.7)" }}>
                  {extOrder.destinationAddress}
                </p>
              </div>

              {/* Warning / completion banner */}
              {!isDone && !isExpired && (
                <div className="w-full rounded-2xl p-3.5 flex gap-3" style={{ background: `${AMBER}08`, border: `1px solid ${AMBER}25` }}>
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: AMBER }} />
                  <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
                    Una vez que envíes exactamente <span className="font-semibold text-white">{extOrder.fromAmount} {extOrder.fromToken}</span>,
                    el intercambio se procesará automáticamente.
                    Las operaciones en blockchain son <span className="font-semibold" style={{ color: AMBER }}>irreversibles</span>.
                  </p>
                </div>
              )}
              {isDone && (
                <div className="w-full rounded-2xl p-3.5 flex gap-3" style={{ background: `${GREEN}08`, border: `1px solid ${GREEN}30` }}>
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" style={{ color: GREEN }} />
                  <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
                    El intercambio fue completado exitosamente. Los fondos han sido enviados a tu dirección de destino.
                  </p>
                </div>
              )}

              <button onClick={reset} className="w-full rounded-2xl py-4 text-sm font-bold mt-1"
                style={{ background: `linear-gradient(135deg, ${PURPLE}, ${PURPLE2})`, color: "white", boxShadow: `0 0 24px ${PURPLE}50` }}>
                Nuevo intercambio
              </button>
            </div>
          );
        })()}

        {/* ════════════════════════════════════════════════════════════════════
            FORM STEP  —  Professional Exchange Layout
        ════════════════════════════════════════════════════════════════════ */}
        {step === "form" && (
          <div className="flex flex-col gap-3">

            {/* ── Mode toggle ───────────────────────────────────────────────── */}
            <div className="flex rounded-2xl overflow-hidden" style={{ background: CARD2, border: `1px solid ${BORDER}` }}>
              <button
                onClick={() => { setSwapMode("wallet"); setDestAddr(""); }}
                className="flex-1 py-2.5 text-xs font-bold transition-all"
                style={{
                  background: swapMode === "wallet" ? `${PURPLE}25` : "transparent",
                  color: swapMode === "wallet" ? PURPLE : "rgba(255,255,255,0.35)",
                  borderRight: `1px solid ${BORDER}`,
                }}>
                Mi billetera CoinCash
              </button>
              <button
                onClick={() => setSwapMode("external")}
                className="flex-1 py-2.5 text-xs font-bold transition-all"
                style={{
                  background: swapMode === "external" ? `${PURPLE}25` : "transparent",
                  color: swapMode === "external" ? PURPLE : "rgba(255,255,255,0.35)",
                }}>
                Intercambio externo
              </button>
            </div>

            {/* ── Wallet selector (only in wallet mode) ─────────────────────── */}
            {swapMode === "wallet" && <div className="relative">
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
            </div>}

            {/* ── Destination address (only in external mode) ─────────────── */}
            {swapMode === "external" && (
              <div className="rounded-2xl overflow-hidden" style={{ background: CARD2, border: `1px solid ${BORDER}` }}>
                <div className="px-4 py-2.5" style={{ background: `${PURPLE}10`, borderBottom: `1px solid ${BORDER}` }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: PURPLE }}>
                    Dirección TRON de destino
                  </p>
                </div>
                <div className="px-4 py-3">
                  <input
                    type="text"
                    value={destAddr}
                    onChange={e => setDestAddr(e.target.value.trim())}
                    placeholder="T..."
                    className="w-full bg-transparent text-sm font-mono outline-none placeholder:text-white/20"
                    style={{ color: "rgba(255,255,255,0.85)" }}
                  />
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                EXCHANGE INPUT CARDS
            ══════════════════════════════════════════════════════════════ */}
            <div className="relative flex flex-col">

              {/* ── SEND CARD ─────────────────────────────────────────────── */}
              <div className="rounded-t-3xl rounded-b-none px-4 pt-4 pb-3"
                style={{ background: CARD2, border: `1px solid ${BORDER}`, borderBottom: "none" }}>

                {/* Row 1: label + balance (wallet mode only) */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold uppercase tracking-widest"
                    style={{ color: "rgba(255,255,255,0.35)" }}>Enviar</span>
                  {swapMode === "wallet" && (
                    <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                      Disponible:&nbsp;
                      <span className="font-semibold" style={{ color: "rgba(255,255,255,0.55)" }}>
                        {fmtAmt(sendBalance, sendToken === "USDT" ? 2 : 4)} {sendToken}
                      </span>
                    </span>
                  )}
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

                {/* Row 3: rate label + MAX button (wallet mode only) */}
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                    {marketRateLabel}
                  </span>
                  {swapMode === "wallet" && (
                    <button
                      onClick={() => setAmount(maxSend > 0 ? maxSend.toFixed(sendToken === "USDT" ? 2 : 6) : "0")}
                      className="text-[10px] font-black px-2.5 py-1 rounded-lg tracking-wider"
                      style={{ background: `${PURPLE}20`, color: PURPLE, border: `1px solid ${PURPLE}40` }}>
                      MAX
                    </button>
                  )}
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
                  {hasAmt && (
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
                        color: hasAmt ? GREEN : "rgba(255,255,255,0.18)",
                        letterSpacing: "-0.02em",
                        transition: "color 0.3s",
                      }}>
                      {hasAmt
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
                  {hasAmt
                    ? `${inputAmt.toFixed(sendToken === "USDT" ? 2 : 4)} ${sendToken}`
                    : `— ${sendToken}`}
                </span>
              </div>

              {/* Recibirás ≈ */}
              <div className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: `1px solid ${BORDER}` }}>
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Recibirás ≈</span>
                <span className="text-xs font-black" style={{ color: hasAmt ? GREEN : "rgba(255,255,255,0.15)", fontSize: 13 }}>
                  {hasAmt
                    ? `${netOut.toFixed(receiveToken === "USDT" ? 2 : 4)} ${receiveToken}`
                    : `— ${receiveToken}`}
                </span>
              </div>

              {/* Sin comisión CoinCash — both modes use FF directly */}
              <div className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: `1px solid ${BORDER}`, background: `${GREEN}06` }}>
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>Sin comisión CoinCash</span>
                <span className="text-xs font-semibold" style={{ color: GREEN }}>Intercambio directo ✓</span>
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
                      value: hasAmt
                        ? swapDir === "usdt_to_trx"
                          ? `${swapAmt.toFixed(2)} USDT`
                          : `${inputAmt.toFixed(4)} TRX`
                        : `— ${sendToken}`,
                      color: "rgba(255,255,255,0.65)",
                    },
                    {
                      label: "Tasa de cambio",
                      value: trxUsd > 0
                        ? `1 USDT ≈ ${usdtPerTrx.toFixed(2)} TRX`
                        : "Cargando…",
                      color: "rgba(255,255,255,0.4)",
                    },
                    {
                      label: "Procesado por",
                      value: "Swap procesado por CoinCash",
                      color: "rgba(255,255,255,0.35)",
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
            {(() => {
              const isDisabled = swapMode === "external"
                ? extLoading || inputAmt <= 0 || !destAddr.trim()
                : extLoading || !hasAmt || !selectedWallet;
              return (
                <button
                  onClick={handleContinue}
                  disabled={isDisabled}
                  className="w-full rounded-2xl py-4 text-base font-black disabled:opacity-40 transition-all flex items-center justify-center gap-2.5"
                  style={{
                    background: `linear-gradient(135deg, ${PURPLE}, ${PURPLE2})`,
                    color: "white",
                    boxShadow: !isDisabled ? `0 4px 32px ${PURPLE}55` : "none",
                    transition: "box-shadow 0.3s",
                  }}>
                  {extLoading
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Creando orden…</>
                    : <><ArrowDownUp className="h-4 w-4" />
                        {swapMode === "external" ? "Crear orden de intercambio" : "Convertir ahora"}
                      </>
                  }
                </button>
              );
            })()}

            {/* CoinCash disclaimer */}
            <p className="text-center text-[10px] leading-relaxed pb-1"
              style={{ color: "rgba(255,255,255,0.18)" }}>
              Swap procesado por&nbsp;<span style={{ color: "rgba(255,255,255,0.32)" }}>CoinCash</span>&nbsp;·&nbsp;Las operaciones son irreversibles en TRON.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
