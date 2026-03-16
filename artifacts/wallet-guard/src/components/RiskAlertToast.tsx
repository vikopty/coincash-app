import { toast } from "sonner";
import { ShieldCheck, ShieldAlert, Shield, X, ExternalLink, CheckCircle2, AlertTriangle } from "lucide-react";
import type { RiskResult } from "@/lib/riskCache";

// ── Palette ───────────────────────────────────────────────────────────────────
const GREEN  = "#19C37D";
const AMBER  = "#F59E0B";
const DANGER = "#FF4D4F";
const CARD   = "#161D27";
const BORDER = "rgba(255,255,255,0.08)";

interface RiskAlertProps {
  walletName:    string;
  amount:        string;
  token:         "TRX" | "USDT";
  sender:        string;
  risk:          RiskResult | null;
  onScanSender?: (address: string) => void;
  toastId:       string | number;
}

function short(addr: string): string {
  if (!addr || addr.length <= 18) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function levelColor(level: RiskResult["level"] | undefined): string {
  if (level === "HIGH")     return DANGER;
  if (level === "MODERATE") return AMBER;
  return GREEN;
}

function levelEs(level: RiskResult["level"] | undefined): string {
  if (level === "HIGH")     return "ALTO";
  if (level === "MODERATE") return "MODERADO";
  return "BAJO";
}

function LevelIcon({ level, size = 5 }: { level: RiskResult["level"] | undefined; size?: number }) {
  const color = levelColor(level);
  const cls   = `h-${size} w-${size}`;
  if (level === "HIGH")     return <ShieldAlert className={cls} style={{ color }} />;
  if (level === "MODERATE") return <Shield      className={cls} style={{ color }} />;
  return                           <ShieldCheck className={cls} style={{ color }} />;
}

// ── Toast card ────────────────────────────────────────────────────────────────
function RiskAlertCard({
  walletName,
  amount,
  token,
  sender,
  risk,
  onScanSender,
  toastId,
}: RiskAlertProps) {
  const level = risk?.level;
  const color = levelColor(level);

  const isHigh     = level === "HIGH";
  const isModerate = level === "MODERATE";
  const isLow      = !isHigh && !isModerate;

  return (
    <div
      className="relative rounded-2xl overflow-hidden shadow-2xl"
      style={{ width: 340, background: CARD, border: `1px solid ${BORDER}` }}>

      {/* Accent line */}
      <div className="h-0.5 w-full" style={{ background: color }} />

      {/* Dismiss */}
      <button
        onClick={() => toast.dismiss(toastId)}
        className="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-full transition-opacity hover:opacity-70"
        style={{ background: "rgba(255,255,255,0.07)" }}>
        <X className="h-3 w-3" style={{ color: "rgba(255,255,255,0.5)" }} />
      </button>

      <div className="px-4 pt-3.5 pb-4">

        {/* ── Deposit row ── */}
        <div className="flex items-start gap-3 mb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl shrink-0"
            style={{ background: `${color}18` }}>
            <LevelIcon level={level} />
          </div>
          <div className="flex-1 min-w-0 pr-6">
            <p className="text-[11px] font-semibold leading-tight" style={{ color: "rgba(255,255,255,0.45)" }}>
              {walletName}
            </p>
            <p className="text-base font-bold text-white leading-tight mt-0.5">
              +{amount}
            </p>
            <p className="text-[10px] font-mono mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
              de {short(sender)}
            </p>
          </div>
        </div>

        {/* ── Verification result banner ── */}
        <div className="rounded-xl px-3 py-2.5 mb-3 flex items-center gap-2.5"
          style={{ background: `${color}12`, border: `1px solid ${color}30` }}>
          {isLow
            ? <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color }} />
            : <AlertTriangle className="h-4 w-4 shrink-0" style={{ color }} />
          }
          <div>
            <p className="text-[11px] font-bold leading-tight" style={{ color }}>
              {isHigh
                ? "Advertencia de riesgo detectado"
                : isModerate
                  ? "Riesgo moderado detectado"
                  : "Billetera verificada"}
            </p>
            <p className="text-[10px] leading-tight mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
              {isHigh
                ? "Esta billetera presenta señales de riesgo alto."
                : isModerate
                  ? "Procede con precaución al interactuar."
                  : "No se detectaron riesgos en el remitente."}
            </p>
          </div>
        </div>

        <div className="h-px mb-3" style={{ background: BORDER }} />

        {/* ── Risk score row ── */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-[9px] uppercase tracking-wide font-semibold"
              style={{ color: "rgba(255,255,255,0.3)" }}>
              Puntuación de riesgo
            </p>
            {risk ? (
              <p className="text-xl font-black leading-tight" style={{ color }}>
                {risk.score}
                <span className="text-[11px] font-normal" style={{ color: "rgba(255,255,255,0.3)" }}>
                  /100
                </span>
              </p>
            ) : (
              <p className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.2)" }}>—</p>
            )}
          </div>
          {/* Level badge */}
          {risk && (
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg"
              style={{ background: `${color}18`, color }}>
              {levelEs(level)}
            </span>
          )}
        </div>

        {/* Score bar */}
        {risk && (
          <div className="h-1.5 rounded-full mb-3 overflow-hidden"
            style={{ background: "rgba(255,255,255,0.07)" }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${risk.score}%`, background: color }} />
          </div>
        )}

        {/* ── Basic wallet stats ── */}
        {risk && (
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {risk.walletAgeDays !== null && (
              <div className="rounded-lg px-2.5 py-1.5"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="text-[9px] uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.3)" }}>
                  Antigüedad
                </p>
                <p className="text-[11px] font-bold text-white">
                  {risk.walletAgeDays} días
                </p>
              </div>
            )}
            <div className="rounded-lg px-2.5 py-1.5"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <p className="text-[9px] uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.3)" }}>
                Blacklist
              </p>
              <p className="text-[11px] font-bold" style={{ color: risk.inBlacklist ? DANGER : GREEN }}>
                {risk.inBlacklist ? "Sí" : "No"}
              </p>
            </div>
            <div className="rounded-lg px-2.5 py-1.5"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <p className="text-[9px] uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.3)" }}>
                Token recibido
              </p>
              <p className="text-[11px] font-bold text-white">
                {token === "USDT" ? "USDT (TRC20)" : "TRX"}
              </p>
            </div>
            {risk.interactedWithFrozen && (
              <div className="rounded-lg px-2.5 py-1.5"
                style={{ background: `${AMBER}10`, border: `1px solid ${AMBER}25` }}>
                <p className="text-[9px] uppercase tracking-wide" style={{ color: AMBER }}>
                  Interacciones
                </p>
                <p className="text-[11px] font-bold" style={{ color: AMBER }}>
                  Sospechosas
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Reasons list ── */}
        {risk && risk.reasons.length > 0 && (
          <ul className="space-y-1 mb-3">
            {risk.reasons.map((r, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full mt-1.5 shrink-0" style={{ background: color }} />
                <span className="text-[10px] leading-snug" style={{ color: "rgba(255,255,255,0.45)" }}>
                  {r}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* ── Scan sender button ── */}
        {onScanSender && (
          <button
            onClick={() => { toast.dismiss(toastId); onScanSender(sender); }}
            className="w-full flex items-center justify-center gap-1.5 rounded-xl py-2 text-[11px] font-semibold transition-opacity active:opacity-70"
            style={{ background: `${color}15`, color }}>
            <ExternalLink className="h-3 w-3" />
            Analizar remitente en detalle
          </button>
        )}
      </div>
    </div>
  );
}

// ── Public helper ─────────────────────────────────────────────────────────────
interface ShowRiskAlertOptions {
  walletName:    string;
  amount:        string;
  token:         "TRX" | "USDT";
  sender:        string;
  risk:          RiskResult | null;
  onScanSender?: (address: string) => void;
}

export function showRiskAlert(opts: ShowRiskAlertOptions): void {
  toast.custom(
    (t) => (
      <RiskAlertCard
        toastId={t}
        walletName={opts.walletName}
        amount={opts.amount}
        token={opts.token}
        sender={opts.sender}
        risk={opts.risk}
        onScanSender={opts.onScanSender}
      />
    ),
    {
      duration: opts.risk?.level === "HIGH" ? 25_000 : 12_000,
      position: "top-center",
    },
  );
}
