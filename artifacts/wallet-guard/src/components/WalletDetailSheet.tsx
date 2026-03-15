import { useState, useEffect, useCallback, useRef } from "react";
import {
  X, ArrowLeft, Copy, CheckCheck, ArrowDownLeft, ArrowUpRight,
  Loader2, QrCode, Send, RefreshCw, AlertTriangle, Clock,
  ChevronRight, Wallet, ShieldAlert, Pencil,
} from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  fetchAccountInfo, fetchAllTransactions,
  sendTRX, sendUSDT, relayUSDTTransfer, fetchRelayStatus,
  estimateUSDTTransferFee,
  type AccountInfo, type TxRecord, type RelayResult, type FeeEstimate,
} from "@/lib/tronApi";
import { decryptPrivateKey, hasEncryptedKey } from "@/lib/security";
import type { SavedWallet } from "@/pages/WalletsPage";
import { loadAllRisks, saveRisk, fetchRiskAnalysis, type RiskResult } from "@/lib/riskCache";

// ── Palette ───────────────────────────────────────────────────────────────────
const BG     = "#0B0F14";
const CARD   = "#121821";
const SHEET  = "#0f1923";
const GREEN  = "#19C37D";
const BLUE   = "#3B82F6";
const PURPLE = "#A78BFA";
const DANGER = "#FF4D4F";
const AMBER  = "#F59E0B";
const TEAL   = "#2DD4BF";
const BORDER = "rgba(255,255,255,0.06)";

type View = "overview" | "receive" | "send" | "history";
type SendStep = "form" | "confirm" | "signing" | "done";
type Token = "TRX" | "USDT";

interface Props {
  wallet: SavedWallet;
  onClose: () => void;
  onRename?: (name: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function short(addr: string) { return `${addr.slice(0, 8)}…${addr.slice(-6)}`; }
function fmtAmt(n: number, decimals = 4) {
  return n < 0.0001 && n > 0 ? "<0.0001" : n.toFixed(Math.min(decimals, 6));
}
function fmtDate(ts: number) {
  try { return format(new Date(ts), "d MMM yyyy, HH:mm", { locale: es }); }
  catch { return "—"; }
}

function TokenIcon({ token, size = 18 }: { token: Token; size?: number }) {
  const color = token === "TRX" ? "#FF2D55" : TEAL;
  const label = token === "TRX" ? "TRX" : "₮";
  return (
    <div className="flex items-center justify-center rounded-full font-bold shrink-0"
      style={{ width: size, height: size, background: `${color}20`, color, fontSize: size * 0.45 }}>
      {label}
    </div>
  );
}

// Skeleton shimmer block — used instead of spinners while first-ever data loads
function Skeleton({ w, h = "h-5", radius = "rounded-lg" }: { w: string; h?: string; radius?: string }) {
  return (
    <div className={`${w} ${h} ${radius} animate-pulse`}
      style={{ background: "rgba(255,255,255,0.07)" }} />
  );
}

// ── Wallet data cache (localStorage) ─────────────────────────────────────────
// Stores the last known balances + transactions per address so the UI can
// render instantly on open while the live fetch runs in the background.
interface WalletCache {
  info: AccountInfo;
  txs:  TxRecord[];
  ts:   number;
}
function cacheKey(addr: string)  { return `wg_wallet_cache_${addr}`; }
function readCache(addr: string): WalletCache | null {
  try { const r = localStorage.getItem(cacheKey(addr)); return r ? JSON.parse(r) : null; }
  catch { return null; }
}
function writeCache(addr: string, info: AccountInfo, txs: TxRecord[]) {
  try { localStorage.setItem(cacheKey(addr), JSON.stringify({ info, txs, ts: Date.now() })); }
  catch {}
}

// ── Main component ────────────────────────────────────────────────────────────
export default function WalletDetailSheet({ wallet, onClose, onRename }: Props) {
  const [view, setView]           = useState<View>("overview");
  const [info, setInfo]           = useState<AccountInfo | null>(null);
  const [txs, setTxs]             = useState<TxRecord[]>([]);
  // refreshing = pulsing dot shown while background fetch is running
  const [refreshing, setRefreshing] = useState(false);
  // loadError = true only after ALL fallback nodes failed; never shown with cached data unless user triggers manual retry
  const [loadError, setLoadError]   = useState(false);
  // ts of the last successful live fetch (shown as "Actualizado ahora / Hace X min")
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied]       = useState(false);

  // ── Rename ─────────────────────────────────────────────────────────────────
  const [localName, setLocalName]   = useState(wallet.name);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");

  // Keep localName in sync if parent passes a different wallet
  useEffect(() => { setLocalName(wallet.name); }, [wallet.name]);

  // Send state
  const [sendStep, setSendStep]   = useState<SendStep>("form");
  const [sendToken, setSendToken] = useState<Token>("TRX");
  const [sendTo, setSendTo]       = useState("");
  const [sendAmt, setSendAmt]     = useState("");
  const [sendLoading, setSendLoading] = useState(false);
  const [sentTxId, setSentTxId]         = useState("");
  const [sentSponsored, setSentSponsored] = useState(false);
  const [relayActive, setRelayActive]   = useState(false);

  // Fee abstraction state (USDT transfers only)
  const [feeEstimate, setFeeEstimate]   = useState<FeeEstimate | null>(null);
  const [feeLoading, setFeeLoading]     = useState(false);

  const canSend = wallet.type !== "watch" && hasEncryptedKey(wallet.id);

  // ── Risk analysis state ────────────────────────────────────────────────────
  // Map<txId, RiskResult> — populated from cache + background analyses
  const [risks, setRisks] = useState<Map<string, RiskResult>>(() => loadAllRisks());
  // Set of txIds currently being analyzed — prevents duplicate requests
  const analyzingRef = useRef<Set<string>>(new Set());

  // Prevent stale-closure double-fetch on fast wallet switches
  const fetchingRef = useRef(false);

  // ── Background live fetch — always runs silently ───────────────────────────
  // Shows only the subtle refresh dot. Retries up to 3× with fallback nodes.
  // On success: updates state + writes to cache. On full failure: sets loadError.
  const loadWalletData = useCallback(async () => {
    if (fetchingRef.current) return;     // don't overlap fetches
    fetchingRef.current = true;
    setRefreshing(true);
    setLoadError(false);

    const MAX_ATTEMPTS = 3;
    let attempt = 0;

    while (attempt < MAX_ATTEMPTS) {
      try {
        const [accountData, txData] = await Promise.all([
          fetchAccountInfo(wallet.address),
          fetchAllTransactions(wallet.address),
        ]);
        writeCache(wallet.address, accountData, txData);
        setInfo(accountData);
        setTxs(txData);
        setLastUpdated(Date.now());
        setRefreshing(false);
        setLoadError(false);
        fetchingRef.current = false;
        return;
      } catch {
        attempt++;
        if (attempt < MAX_ATTEMPTS) {
          await new Promise(r => setTimeout(r, 1000 * attempt));
        } else {
          setRefreshing(false);
          setLoadError(true);
          fetchingRef.current = false;
        }
      }
    }
  }, [wallet.address]);

  // ── On open: paint cache instantly, then sync live in the background ────────
  useEffect(() => {
    fetchingRef.current = false;

    // Restore last known state from cache — renders in the same frame, no spinner
    const cached = readCache(wallet.address);
    if (cached) {
      setInfo(cached.info);
      setTxs(cached.txs);
      setLastUpdated(cached.ts);
    }
    // Reset error so stale error from a previous wallet doesn't show
    setLoadError(false);

    // Background live sync — always runs, never blocks the UI
    loadWalletData();
    fetchRelayStatus().then(s => setRelayActive(s.relayerActive)).catch(() => {});
  }, [wallet.address, loadWalletData]);

  // ── Auto-retry every 3 seconds on connection failure ──────────────────────
  useEffect(() => {
    if (!loadError) return;
    const id = setTimeout(() => loadWalletData(), 3_000);
    return () => clearTimeout(id);
  }, [loadError, loadWalletData]);

  // ── Auto-refresh every 60 seconds while the sheet is open ─────────────────
  useEffect(() => {
    const id = setInterval(() => loadWalletData(), 60_000);
    return () => clearInterval(id);
  }, [loadWalletData]);

  // ── Load fee estimate when USDT is selected or send view opens ────────────
  useEffect(() => {
    if (view !== "send" || sendToken !== "USDT") { setFeeEstimate(null); return; }
    let cancelled = false;
    setFeeLoading(true);
    estimateUSDTTransferFee()
      .then(f => { if (!cancelled) { setFeeEstimate(f); setFeeLoading(false); } })
      .catch(() => { if (!cancelled) setFeeLoading(false); });
    return () => { cancelled = true; };
  }, [view, sendToken]);

  // ── Risk analysis — triggers automatically when transactions are loaded ─────
  // Refreshes the risk map from cache, then queues analyses for any incoming
  // USDT txs that don't yet have a stored result.
  useEffect(() => {
    if (!txs.length) return;

    // Always sync from cache first (the monitor hook may have stored results)
    const cached = loadAllRisks();
    setRisks(cached);

    // Find incoming txs that don't have a risk result yet
    const pending = txs.filter(tx =>
      tx.type === "in" &&
      !cached.has(tx.id) &&
      !analyzingRef.current.has(tx.id)
    );

    for (const tx of pending) {
      if (!tx.counterpart) continue;
      analyzingRef.current.add(tx.id);

      fetchRiskAnalysis(tx.counterpart)
        .then(result => {
          if (!result) return;
          saveRisk(tx.id, result);
          setRisks(prev => {
            const next = new Map(prev);
            next.set(tx.id, result);
            return next;
          });
        })
        .finally(() => {
          analyzingRef.current.delete(tx.id);
        });
    }
  }, [txs]);

  // ── QR code ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (view !== "receive") return;
    QRCode.toDataURL(wallet.address, {
      margin: 2, width: 220, color: { dark: "#ffffff", light: "#0f1923" },
    }).then(setQrDataUrl).catch(() => {});
  }, [view, wallet.address]);

  const copyAddr = () => {
    navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
    toast.success("Dirección copiada.");
  };

  // ── Send flow ──────────────────────────────────────────────────────────────
  // For USDT: recipient gets exactly sendAmt; wallet pays sendAmt + fee
  const totalAmount = (() => {
    if (sendToken !== "USDT" || !feeEstimate) return null;
    const amt = parseFloat(sendAmt) || 0;
    return parseFloat((amt + feeEstimate.feeUSDT).toFixed(6));
  })();

  const validateSend = () => {
    if (!sendTo.startsWith("T") || sendTo.length < 30) {
      toast.error("Dirección TRON inválida."); return false;
    }
    const amt = parseFloat(sendAmt);
    if (!amt || amt <= 0) { toast.error("Monto inválido."); return false; }
    const bal = sendToken === "TRX" ? (info?.trxBalance ?? 0) : (info?.usdtBalance ?? 0);
    // For USDT, validate against total (amount + fee)
    const required = sendToken === "USDT" && feeEstimate ? amt + feeEstimate.feeUSDT : amt;
    if (required > bal) {
      if (sendToken === "USDT" && feeEstimate) {
        toast.error(`Saldo insuficiente. Necesitas ${required.toFixed(2)} USDT (incluye tarifa de ${feeEstimate.feeUSDT.toFixed(2)} USDT).`);
      } else {
        toast.error("Saldo insuficiente.");
      }
      return false;
    }
    return true;
  };

  const executeSend = async () => {
    setSendLoading(true);
    setSendStep("signing");
    try {
      const privKey = await decryptPrivateKey(wallet.id);
      const amt = parseFloat(sendAmt);
      if (sendToken === "TRX") {
        const txId = await sendTRX(wallet.address, sendTo, amt, privKey);
        setSentTxId(txId);
        setSentSponsored(false);
      } else {
        // USDT gas abstraction:
        // – Recipient gets exactly `amt` (what the user typed)
        // – The fee (feeUSDT) is deducted from the wallet on top of amt
        // – Relay pays TRX energy cost; we've already validated wallet has amt + fee
        const result: RelayResult = await relayUSDTTransfer(wallet.address, sendTo, amt, privKey);
        setSentTxId(result.txId);
        setSentSponsored(result.sponsored);
      }
      setSendStep("done");
      toast.success("Transacción enviada a la red TRON.");
      // Refresh balances + history after a successful send
      setTimeout(() => loadWalletData(), 3000);
    } catch (e: any) {
      toast.error(e?.message ?? "Error al enviar la transacción.");
      setSendStep("confirm");
    } finally {
      setSendLoading(false);
    }
  };

  const resetSend = () => {
    setSendStep("form"); setSendTo(""); setSendAmt(""); setSentTxId(""); setSentSponsored(false);
  };

  // ── Back navigation ────────────────────────────────────────────────────────
  const goBack = () => {
    setView("overview");
    resetSend();
  };

  const badgeLabel = wallet.type === "created" ? "Creada"
    : wallet.type === "imported" ? "Importada" : "Watch";
  const badgeColor = wallet.type === "created" ? PURPLE
    : wallet.type === "imported" ? BLUE : GREEN;

  // ── Layout wrapper ─────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-end"
      style={{ background: "rgba(0,0,0,0.78)", backdropFilter: "blur(4px)" }}
      onClick={onClose}>
      <div className="w-full rounded-t-[22px]"
        style={{
          height: "92vh", background: SHEET, borderTop: `1px solid ${BORDER}`,
          overflowY: "auto", WebkitOverflowScrolling: "touch" as any,
          paddingBottom: "env(safe-area-inset-bottom, 12px)",
        }}
        onClick={e => e.stopPropagation()}>

        {/* ── Drag handle ── */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full" style={{ background: "rgba(255,255,255,0.15)" }} />
        </div>

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 pt-2 pb-3">
          {view !== "overview" ? (
            <button onClick={goBack} className="flex items-center gap-1.5 text-sm font-medium"
              style={{ color: "rgba(255,255,255,0.55)" }}>
              <ArrowLeft className="h-4 w-4" /> Volver
            </button>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold"
                style={{ background: `${badgeColor}22`, color: badgeColor }}>
                {localName.slice(0, 1).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => { setRenameDraft(localName); setRenameOpen(true); }}
                    className="flex items-center gap-1 group"
                  >
                    <span className="text-base font-bold text-white">{localName}</span>
                    <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity"
                      style={{ color: "rgba(255,255,255,0.6)" }} />
                  </button>
                  <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase"
                    style={{ background: `${badgeColor}20`, color: badgeColor }}>
                    {badgeLabel}
                  </span>
                </div>
                <p className="text-[11px] font-mono" style={{ color: "rgba(255,255,255,0.35)" }}>
                  {short(wallet.address)}
                </p>
              </div>
            </div>
          )}
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{ background: "rgba(255,255,255,0.06)" }}>
            <X className="h-4 w-4" style={{ color: "rgba(255,255,255,0.4)" }} />
          </button>
        </div>

        {/* ════════════════════════════════════════
            VIEW: OVERVIEW
        ════════════════════════════════════════ */}
        {view === "overview" && (
          <div className="px-4 pb-6">

            {/* Offline notice — only shown when every fallback node has failed */}
            {loadError && (
              <div className="flex items-center gap-2 rounded-xl px-3 py-2 mb-3"
                style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${AMBER}25` }}>
                <span className="h-1.5 w-1.5 rounded-full shrink-0 animate-pulse"
                  style={{ background: AMBER }} />
                <p className="text-[10px] flex-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                  Sin conexión — reintentando…
                </p>
                <button onClick={() => loadWalletData()}
                  className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md shrink-0"
                  style={{ color: AMBER }}>
                  Reintentar
                </button>
              </div>
            )}

            {/* ── Balance cards — always rendered; skeleton when info is null ── */}
            <>
              {/* Section header */}
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: "rgba(255,255,255,0.25)" }}>Saldo</p>
                <div className="flex items-center gap-1.5">
                  {refreshing && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                        style={{ background: GREEN }} />
                      <span className="relative inline-flex h-2 w-2 rounded-full"
                        style={{ background: GREEN }} />
                    </span>
                  )}
                  {lastUpdated && !refreshing && (
                    <p className="text-[9px]" style={{ color: "rgba(255,255,255,0.18)" }}>
                      {(() => {
                        const s = Math.floor((Date.now() - lastUpdated) / 1000);
                        if (s < 60) return "Actualizado ahora";
                        return `Hace ${Math.floor(s / 60)} min`;
                      })()}
                    </p>
                  )}
                </div>
              </div>

              {/* TRX card */}
              <div className="rounded-2xl p-4 mb-3"
                style={{ background: "linear-gradient(135deg,#FF2D5520 0%,#FF2D5508 100%)", border: "1px solid #FF2D5530" }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full font-bold text-sm"
                      style={{ background: "#FF2D5520", color: "#FF2D55" }}>TRX</div>
                    <div>
                      <p className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>TRON</p>
                      {info
                        ? <p className="text-xl font-bold text-white">{fmtAmt(info.trxBalance, 4)}</p>
                        : <Skeleton w="w-24" h="h-6" />}
                    </div>
                  </div>
                  <p className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.3)" }}>TRX</p>
                </div>
              </div>

              {/* USDT card */}
              <div className="rounded-2xl p-4 mb-4"
                style={{ background: `linear-gradient(135deg,${TEAL}20 0%,${TEAL}08 100%)`, border: `1px solid ${TEAL}30` }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full font-bold text-sm"
                      style={{ background: `${TEAL}20`, color: TEAL }}>₮</div>
                    <div>
                      <p className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>USDT TRC20</p>
                      {info
                        ? <p className="text-xl font-bold text-white">{fmtAmt(info.usdtBalance, 2)}</p>
                        : <Skeleton w="w-28" h="h-6" />}
                    </div>
                  </div>
                  <p className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.3)" }}>USDT</p>
                </div>
              </div>

              {info && !info.activated && (
                <div className="rounded-2xl p-3 mb-4 flex gap-2.5"
                  style={{ background: `${AMBER}0C`, border: `1px solid ${AMBER}30` }}>
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: AMBER }} />
                  <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
                    Esta wallet no tiene transacciones en la red TRON aún.
                  </p>
                </div>
              )}
            </>

            {/* Action buttons */}
            <div className="flex gap-3 mb-6">
              <button onClick={() => setView("receive")}
                className="flex-1 flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-black"
                style={{ background: GREEN, boxShadow: `0 0 18px ${GREEN}40` }}>
                <QrCode className="h-4 w-4" /> Recibir
              </button>
              {canSend ? (
                <button onClick={() => setView("send")}
                  className="flex-1 flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-black"
                  style={{ background: BLUE, boxShadow: `0 0 18px ${BLUE}40` }}>
                  <Send className="h-4 w-4" /> Enviar
                </button>
              ) : (
                <div className="flex-1 flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-medium"
                  style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.25)", border: `1px solid ${BORDER}` }}>
                  <ShieldAlert className="h-4 w-4" />
                  {wallet.type === "watch" ? "Solo lectura" : "Sin clave"}
                </div>
              )}
            </div>

            {/* Transactions */}
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-white">Transacciones recientes</p>
              <div className="flex items-center gap-2">
                <button onClick={() => loadWalletData()}
                  disabled={refreshing}
                  className="flex items-center gap-1 text-[11px] font-medium active:opacity-60 disabled:opacity-30"
                  style={{ color: "rgba(255,255,255,0.35)" }}>
                  {refreshing
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <RefreshCw className="h-3 w-3" />
                  } Actualizar
                </button>
                {txs.length > 5 && (
                  <button onClick={() => setView("history")}
                    className="flex items-center gap-0.5 text-[11px] font-medium"
                    style={{ color: GREEN }}>
                    Ver todo <ChevronRight className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            {info === null ? (
              /* Skeleton rows — shown only the very first time, before any data arrives */
              <div className="flex flex-col gap-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center gap-3 px-1">
                    <Skeleton w="w-9" h="h-9" radius="rounded-full" />
                    <div className="flex-1 flex flex-col gap-1.5">
                      <Skeleton w="w-32" h="h-3.5" />
                      <Skeleton w="w-20" h="h-2.5" />
                    </div>
                    <Skeleton w="w-16" h="h-3.5" />
                  </div>
                ))}
              </div>
            ) : txs.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Clock className="h-8 w-8" style={{ color: "rgba(255,255,255,0.12)" }} />
                <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>
                  Sin transacciones aún
                </p>
              </div>
            ) : (
              <TxList txs={txs.slice(0, 8)} address={wallet.address} risks={risks} analyzing={analyzingRef.current} />
            )}
          </div>
        )}

        {/* ════════════════════════════════════════
            VIEW: RECEIVE
        ════════════════════════════════════════ */}
        {view === "receive" && (
          <div className="flex flex-col items-center px-6 pb-10">
            <p className="text-base font-bold text-white mb-1">Recibir fondos</p>
            <p className="text-[11px] mb-6 text-center" style={{ color: "rgba(255,255,255,0.4)" }}>
              Envía TRX o tokens TRC20 a esta dirección
            </p>

            {/* QR */}
            <div className="rounded-3xl p-3 mb-5"
              style={{ background: SHEET, border: `2px solid ${GREEN}30`, boxShadow: `0 0 30px ${GREEN}15` }}>
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR" width={200} height={200} className="rounded-2xl" />
              ) : (
                <div className="flex h-[200px] w-[200px] items-center justify-center rounded-2xl"
                  style={{ background: "rgba(255,255,255,0.04)" }}>
                  <Loader2 className="h-8 w-8 animate-spin" style={{ color: GREEN }} />
                </div>
              )}
            </div>

            {/* Address */}
            <div className="w-full rounded-2xl p-3.5 mb-4"
              style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}` }}>
              <p className="text-[10px] font-semibold uppercase tracking-wide mb-1"
                style={{ color: "rgba(255,255,255,0.35)" }}>Dirección TRON</p>
              <p className="text-xs font-mono break-all text-white">{wallet.address}</p>
            </div>

            {/* Copy button */}
            <button onClick={copyAddr}
              className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-black mb-4"
              style={{ background: GREEN, boxShadow: `0 0 18px ${GREEN}40` }}>
              {copied ? <CheckCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "¡Copiado!" : "Copiar dirección"}
            </button>

            {/* Warning */}
            <div className="w-full rounded-2xl p-3 flex gap-2.5"
              style={{ background: `${AMBER}0C`, border: `1px solid ${AMBER}25` }}>
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: AMBER }} />
              <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
                Solo envía <span className="font-semibold" style={{ color: AMBER }}>TRX o tokens TRC20</span> a esta dirección. Enviar otras criptomonedas resultará en pérdida permanente de fondos.
              </p>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════
            VIEW: SEND
        ════════════════════════════════════════ */}
        {view === "send" && (
          <div className="px-5 pb-10">
            {/* Done state */}
            {sendStep === "done" && (
              <div className="flex flex-col items-center py-8 text-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full"
                  style={{ background: `${GREEN}20`, border: `2px solid ${GREEN}40` }}>
                  <CheckCheck className="h-8 w-8" style={{ color: GREEN }} />
                </div>
                <div>
                  <p className="text-lg font-bold text-white mb-1">¡Transacción enviada!</p>
                  <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                    Fue transmitida a la red TRON y se confirmará en breve.
                  </p>
                </div>

                {/* USDT fee receipt — shown after a successful USDT send */}
                {sendToken === "USDT" && feeEstimate && (
                  <div className="w-full rounded-2xl overflow-hidden"
                    style={{ border: `1px solid ${BORDER}` }}>
                    {[
                      ["Destinatario recibió", `${parseFloat(sendAmt).toFixed(2)} USDT`, GREEN],
                      ["Tarifa de red", `${feeEstimate.feeUSDT.toFixed(2)} USDT`, AMBER],
                      ["Total descontado", totalAmount !== null ? `${totalAmount.toFixed(2)} USDT` : "—", BLUE],
                    ].map(([label, value, color], i, arr) => (
                      <div key={label} className="flex items-center justify-between px-4 py-2.5"
                        style={{
                          borderBottom: i < arr.length - 1 ? `1px solid ${BORDER}` : "none",
                          background: i === arr.length - 1 ? `${BLUE}08` : "transparent",
                        }}>
                        <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>{label}</span>
                        <span className="text-[10px] font-bold" style={{ color }}>{value}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* TRX energy sponsorship badge */}
                {sentSponsored && sendToken !== "USDT" && (
                  <div className="w-full rounded-2xl px-4 py-3 flex items-center gap-3"
                    style={{ background: `${GREEN}0A`, border: `1px solid ${GREEN}25` }}>
                    <ShieldAlert className="h-3.5 w-3.5 shrink-0" style={{ color: GREEN }} />
                    <div className="text-left">
                      <p className="text-[11px] font-bold" style={{ color: GREEN }}>Gas Fee: 0 TRX</p>
                      <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>Patrocinado por CoinCash</p>
                    </div>
                  </div>
                )}

                <div className="w-full rounded-2xl p-3"
                  style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}` }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide mb-1"
                    style={{ color: "rgba(255,255,255,0.3)" }}>TX ID</p>
                  <p className="text-[10px] font-mono break-all" style={{ color: "rgba(255,255,255,0.6)" }}>
                    {sentTxId}
                  </p>
                </div>
                <button onClick={() => { resetSend(); setView("overview"); }}
                  className="w-full rounded-2xl py-3.5 text-sm font-bold text-black mt-2"
                  style={{ background: GREEN }}>
                  Volver al inicio
                </button>
              </div>
            )}

            {/* Signing state */}
            {sendStep === "signing" && (
              <div className="flex flex-col items-center py-12 gap-4">
                <Loader2 className="h-10 w-10 animate-spin" style={{ color: BLUE }} />
                <p className="text-sm font-semibold text-white">
                  {sendToken === "USDT" ? "Firmando y retransmitiendo…" : "Firmando y transmitiendo…"}
                </p>
                <p className="text-xs text-center max-w-[200px] leading-relaxed" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {sendToken === "USDT"
                    ? "CoinCash está procesando el gas por ti"
                    : "No cierres la app"}
                </p>
              </div>
            )}

            {/* Confirm state */}
            {sendStep === "confirm" && (
              <>
                <p className="text-base font-bold text-white mb-4">Confirmar envío</p>
                <div className="rounded-2xl overflow-hidden mb-5"
                  style={{ border: `1px solid ${BORDER}`, background: CARD }}>
                  {(sendToken === "TRX"
                    ? [
                        ["Token", "TRX", "white"],
                        ["Monto", `${sendAmt} TRX`, "white"],
                        ["Tarifa de red", "~1 TRX (bandwidth)", AMBER],
                        ["Desde", short(wallet.address), "white"],
                        ["Hacia", short(sendTo), "white"],
                      ]
                    : [
                        ["Monto a enviar", `${parseFloat(sendAmt).toFixed(2)} USDT`, "white"],
                        ["Tarifa de red", feeEstimate ? `+ ${feeEstimate.feeUSDT.toFixed(2)} USDT` : "—", AMBER],
                        ["Total a descontar", totalAmount !== null ? `${totalAmount.toFixed(2)} USDT` : "—", BLUE],
                        ["Destinatario recibe", `${parseFloat(sendAmt).toFixed(2)} USDT`, GREEN],
                        ["Hacia", short(sendTo), "white"],
                      ]
                  ).map(([label, value, color], i, arr) => (
                    <div key={label} className="flex items-start justify-between px-4 py-3"
                      style={{
                        borderBottom: i < arr.length - 1 ? `1px solid ${BORDER}` : "none",
                        background: label === "Total a descontar" ? `${BLUE}08` : "transparent",
                      }}>
                      <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{label}</span>
                      <span className="text-xs font-semibold text-right max-w-[55%] break-all"
                        style={{ color }}>{value}</span>
                    </div>
                  ))}
                </div>
                <div className="rounded-2xl p-3 mb-5 flex gap-2.5"
                  style={{ background: `${DANGER}0A`, border: `1px solid ${DANGER}25` }}>
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: DANGER }} />
                  <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
                    Las transacciones en blockchain son <span className="font-semibold" style={{ color: DANGER }}>irreversibles</span>. Verifica la dirección antes de confirmar.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setSendStep("form")}
                    className="flex-1 rounded-2xl py-3.5 text-sm font-medium"
                    style={{ border: `1px solid ${BORDER}`, color: "rgba(255,255,255,0.5)" }}>
                    Cancelar
                  </button>
                  <button onClick={executeSend} disabled={sendLoading}
                    className="flex-1 rounded-2xl py-3.5 text-sm font-bold text-black"
                    style={{ background: BLUE, boxShadow: `0 0 18px ${BLUE}40` }}>
                    Confirmar y enviar
                  </button>
                </div>
              </>
            )}

            {/* Form state */}
            {sendStep === "form" && (
              <>
                <p className="text-base font-bold text-white mb-4">Enviar fondos</p>

                {/* Token selector */}
                <div className="flex gap-1 rounded-2xl p-1 mb-4"
                  style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}` }}>
                  {(["TRX", "USDT"] as Token[]).map(t => (
                    <button key={t} onClick={() => { setSendToken(t); setSendAmt(""); }}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all"
                      style={{ background: sendToken === t ? (t === "TRX" ? "#FF2D55" : TEAL) : "transparent",
                        color: sendToken === t ? "white" : "rgba(255,255,255,0.4)" }}>
                      <TokenIcon token={t} size={16} />
                      {t}
                    </button>
                  ))}
                </div>

                {/* Available balance */}
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide"
                    style={{ color: "rgba(255,255,255,0.4)" }}>
                    Disponible
                  </p>
                  <button onClick={() => {
                    const b = sendToken === "TRX" ? (info?.trxBalance ?? 0) : (info?.usdtBalance ?? 0);
                    // TRX: reserve 1 TRX for bandwidth fee
                    // USDT: reserve feeUSDT so total (amount + fee) doesn't exceed balance
                    const fee = sendToken === "USDT" && feeEstimate ? feeEstimate.feeUSDT : 0;
                    const max = sendToken === "TRX" ? Math.max(0, b - 1) : Math.max(0, b - fee);
                    setSendAmt(max > 0 ? fmtAmt(max, 6) : "0");
                  }} className="text-[11px] font-semibold px-2 py-0.5 rounded-lg"
                    style={{ background: `${GREEN}18`, color: GREEN }}>
                    {sendToken === "TRX"
                      ? `${fmtAmt(info?.trxBalance ?? 0, 4)} TRX`
                      : `${fmtAmt(info?.usdtBalance ?? 0, 2)} USDT`
                    } · MAX
                  </button>
                </div>

                {/* Amount field */}
                <div className="relative mb-4">
                  <input
                    type="number"
                    placeholder="0.00"
                    value={sendAmt}
                    onChange={e => setSendAmt(e.target.value)}
                    className="w-full rounded-2xl px-4 py-4 text-2xl font-bold text-white outline-none text-center"
                    style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}` }}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold"
                    style={{ color: "rgba(255,255,255,0.3)" }}>
                    {sendToken}
                  </span>
                </div>

                {/* Destination */}
                <label className="text-[11px] font-semibold uppercase tracking-wide mb-1.5 block"
                  style={{ color: "rgba(255,255,255,0.4)" }}>
                  Dirección destino
                </label>
                <input
                  type="text"
                  placeholder="T..."
                  value={sendTo}
                  onChange={e => setSendTo(e.target.value)}
                  className="w-full rounded-2xl px-4 py-3.5 text-sm text-white outline-none font-mono mb-4"
                  style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}` }}
                />

                {sendToken === "USDT" && (
                  <div className="rounded-2xl overflow-hidden mb-4"
                    style={{ border: `1px solid ${BORDER}`, background: CARD }}>
                    {/* Amount to send */}
                    <div className="flex items-center justify-between px-4 py-3"
                      style={{ borderBottom: `1px solid ${BORDER}` }}>
                      <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                        Monto a enviar
                      </span>
                      <span className="text-[11px] font-bold text-white">
                        {parseFloat(sendAmt) > 0 ? `${parseFloat(sendAmt).toFixed(2)} USDT` : "—"}
                      </span>
                    </div>
                    {/* Network fee */}
                    <div className="flex items-center justify-between px-4 py-3"
                      style={{ borderBottom: `1px solid ${BORDER}` }}>
                      <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                        Tarifa de red
                      </span>
                      {feeLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin" style={{ color: "rgba(255,255,255,0.3)" }} />
                      ) : feeEstimate ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-bold" style={{ color: AMBER }}>
                            + {feeEstimate.feeUSDT.toFixed(2)} USDT
                          </span>
                          <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,0.25)" }}>
                            ≈ {feeEstimate.feeTRX.toFixed(1)} TRX
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.25)" }}>—</span>
                      )}
                    </div>
                    {/* Total charged */}
                    <div className="flex items-center justify-between px-4 py-3"
                      style={{ background: `${BLUE}0A` }}>
                      <span className="text-[11px] font-semibold" style={{ color: "rgba(255,255,255,0.6)" }}>
                        Total a pagar
                      </span>
                      {feeLoading || !feeEstimate ? (
                        <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.25)" }}>—</span>
                      ) : (
                        <span className="text-[11px] font-bold" style={{ color: BLUE }}>
                          {totalAmount !== null && totalAmount > 0
                            ? `${totalAmount.toFixed(2)} USDT`
                            : "—"}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <button onClick={() => { if (validateSend()) setSendStep("confirm"); }}
                  className="w-full rounded-2xl py-3.5 text-sm font-bold text-black"
                  style={{ background: BLUE, boxShadow: `0 0 18px ${BLUE}40` }}>
                  Continuar
                </button>
              </>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════
            VIEW: HISTORY
        ════════════════════════════════════════ */}
        {view === "history" && (
          <div className="px-4 pb-10">
            <div className="flex items-center justify-between mb-4">
              <p className="text-base font-bold text-white">Historial completo</p>
              <button onClick={() => loadWalletData()}
                disabled={refreshing}
                className="flex items-center gap-1 text-[11px] font-medium disabled:opacity-30"
                style={{ color: "rgba(255,255,255,0.35)" }}>
                {refreshing
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <RefreshCw className="h-3 w-3" />
                } Actualizar
              </button>
            </div>
            {txs.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <Wallet className="h-10 w-10" style={{ color: "rgba(255,255,255,0.1)" }} />
                <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>
                  Sin transacciones aún
                </p>
                <p className="text-xs max-w-[200px] leading-relaxed" style={{ color: "rgba(255,255,255,0.18)" }}>
                  Esta wallet no tiene transacciones en la red TRON aún.
                </p>
              </div>
            ) : (
              <TxList txs={txs} address={wallet.address} risks={risks} analyzing={analyzingRef.current} />
            )}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════
          RENAME MODAL
      ══════════════════════════════════════════════ */}
      {renameOpen && (
        <div
          className="absolute inset-0 flex items-center justify-center px-6"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", zIndex: 60 }}
          onClick={() => setRenameOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl p-6"
            style={{ background: CARD, border: `1px solid ${BORDER}` }}
            onClick={e => e.stopPropagation()}
          >
            {/* Title */}
            <p className="text-base font-bold text-white mb-1">Editar nombre de wallet</p>
            <p className="text-[11px] mb-5" style={{ color: "rgba(255,255,255,0.35)" }}>
              El nombre solo se guarda en tu dispositivo.
            </p>

            {/* Input */}
            <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: "rgba(255,255,255,0.3)" }}>
              Nombre de wallet
            </label>
            <input
              autoFocus
              value={renameDraft}
              onChange={e => setRenameDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  const trimmed = renameDraft.trim();
                  if (!trimmed) return;
                  setLocalName(trimmed);
                  onRename?.(trimmed);
                  setRenameOpen(false);
                  toast.success("Nombre actualizado.");
                }
              }}
              maxLength={40}
              placeholder="Ej: Ahorros, Trading…"
              className="w-full rounded-2xl px-4 py-3 text-sm font-medium outline-none mb-5"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: `1px solid rgba(255,255,255,0.1)`,
                color: "#fff",
              }}
            />

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setRenameOpen(false)}
                className="flex-1 rounded-2xl py-3 text-sm font-medium"
                style={{ border: `1px solid rgba(255,255,255,0.1)`, color: "rgba(255,255,255,0.5)" }}
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const trimmed = renameDraft.trim();
                  if (!trimmed) { toast.error("El nombre no puede estar vacío."); return; }
                  setLocalName(trimmed);
                  onRename?.(trimmed);
                  setRenameOpen(false);
                  toast.success("Nombre actualizado.");
                }}
                className="flex-1 rounded-2xl py-3 text-sm font-bold"
                style={{ background: GREEN, color: "#fff" }}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Transaction list sub-component ────────────────────────────────────────────
interface TxListProps {
  txs:       TxRecord[];
  address:   string;
  risks?:    Map<string, RiskResult>;
  analyzing?: Set<string>;
}

function RiskBadge({ result, pending }: { result: RiskResult | undefined; pending: boolean }) {
  if (pending && !result) {
    return (
      <span className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
        style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.3)" }}>
        <Loader2 className="h-2.5 w-2.5 animate-spin" /> riesgo…
      </span>
    );
  }
  if (!result) return null;

  const { level } = result;
  const color = level === "HIGH" ? DANGER : level === "MODERATE" ? AMBER : GREEN;
  const label = level === "HIGH" ? "ALTO" : level === "MODERATE" ? "MOD" : "BAJO";

  return (
    <span className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold"
      style={{ background: `${color}18`, color }}>
      {label}
    </span>
  );
}

function TxList({ txs, address, risks, analyzing }: TxListProps) {
  const [copiedTx, setCopiedTx] = useState<string | null>(null);

  const copyTxId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedTx(id);
    setTimeout(() => setCopiedTx(null), 1500);
    toast.success("TX ID copiado.");
  };

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}`, background: CARD }}>
      {txs.map((tx, i) => {
        const isIn       = tx.type === "in";
        const color      = isIn ? GREEN : DANGER;
        const tokenColor = tx.token === "USDT" ? TEAL : "#FF2D55";
        const riskResult = risks?.get(tx.id);
        const isPending  = isIn && !riskResult && (analyzing?.has(tx.id) ?? false);

        return (
          <div key={tx.id} className="px-4 py-3.5"
            style={{ borderBottom: i < txs.length - 1 ? `1px solid ${BORDER}` : "none" }}>
            <div className="flex items-center gap-3">
              {/* Direction icon */}
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                style={{ background: `${color}15` }}>
                {isIn
                  ? <ArrowDownLeft className="h-4 w-4" style={{ color }} />
                  : <ArrowUpRight  className="h-4 w-4" style={{ color }} />
                }
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                  <span className="text-xs font-semibold text-white">
                    {isIn ? "Recibido" : "Enviado"}
                  </span>
                  <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                    style={{ background: `${tokenColor}18`, color: tokenColor }}>
                    {tx.token}
                  </span>
                  {tx.status === "FAILED" && (
                    <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                      style={{ background: `${DANGER}18`, color: DANGER }}>FALLIDA</span>
                  )}
                  {/* Risk badge — only for incoming transactions */}
                  {isIn && <RiskBadge result={riskResult} pending={isPending} />}
                </div>
                <p className="text-[10px] font-mono truncate" style={{ color: "rgba(255,255,255,0.3)" }}>
                  {isIn ? "De: " : "A: "}{tx.counterpart ? `${tx.counterpart.slice(0, 10)}…${tx.counterpart.slice(-6)}` : "—"}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.22)" }}>
                  {fmtDate(tx.ts)}
                </p>
              </div>

              {/* Amount + copy */}
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="text-sm font-bold"
                  style={{ color: isIn ? GREEN : "rgba(255,255,255,0.85)" }}>
                  {isIn ? "+" : "-"}{fmtAmt(tx.amount, tx.token === "USDT" ? 2 : 4)} {tx.token}
                </span>
                <button onClick={() => copyTxId(tx.id)}
                  className="flex items-center gap-0.5 text-[9px]"
                  style={{ color: "rgba(255,255,255,0.2)" }}>
                  {copiedTx === tx.id
                    ? <CheckCheck className="h-2.5 w-2.5" style={{ color: GREEN }} />
                    : <Copy className="h-2.5 w-2.5" />
                  }
                  TX
                </button>
              </div>
            </div>

            {/* Expanded risk detail — only for HIGH risk incoming transactions */}
            {isIn && riskResult?.level === "HIGH" && (
              <div className="mt-2 ml-12 flex items-start gap-1.5 rounded-xl px-2.5 py-2"
                style={{ background: `${DANGER}0C`, border: `1px solid ${DANGER}20` }}>
                <ShieldAlert className="h-3 w-3 shrink-0 mt-0.5" style={{ color: DANGER }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-semibold mb-0.5" style={{ color: DANGER }}>
                    Remitente de alto riesgo · {riskResult.score}/100
                  </p>
                  {riskResult.reasons.slice(0, 2).map((r, ri) => (
                    <p key={ri} className="text-[9px] leading-snug" style={{ color: "rgba(255,255,255,0.4)" }}>
                      • {r}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
