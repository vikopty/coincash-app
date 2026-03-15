import { toast } from "sonner";
import { ShieldCheck, ShieldAlert, Shield, X, ExternalLink } from "lucide-react";
import type { RiskResult } from "@/lib/riskCache";

// ── Palette (matches app theme) ───────────────────────────────────────────────
const GREEN  = "#19C37D";
const AMBER  = "#F59E0B";
const DANGER = "#FF4D4F";
const CARD   = "#161D27";
const BORDER = "rgba(255,255,255,0.08)";

interface RiskAlertProps {
  walletName:   string;
  amount:       string;
  sender:       string;
  risk:         RiskResult | null;
  onScanSender?: (address: string) => void;
  toastId:      string | number;
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

function LevelIcon({ level }: { level: RiskResult["level"] | undefined }) {
  const color = levelColor(level);
  const cls   = "h-5 w-5";
  if (level === "HIGH")     return <ShieldAlert className={cls} style={{ color }} />;
  if (level === "MODERATE") return <Shield      className={cls} style={{ color }} />;
  return                           <ShieldCheck className={cls} style={{ color }} />;
}

function LevelLabel({ level }: { level: RiskResult["level"] | undefined }) {
  const text  = level ?? "—";
  const color = levelColor(level);
  const es    = level === "HIGH" ? "ALTO" : level === "MODERATE" ? "MODERADO" : "BAJO";
  return (
    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg"
      style={{ background: `${color}18`, color }}>
      {es}
    </span>
  );
}

// ── Toast card component ───────────────────────────────────────────────────────
function RiskAlertCard({
  walletName,
  amount,
  sender,
  risk,
  onScanSender,
  toastId,
}: RiskAlertProps) {
  const level = risk?.level;
  const color = levelColor(level);

  return (
    <div
      className="relative rounded-2xl overflow-hidden w-[340px] shadow-2xl"
      style={{ background: CARD, border: `1px solid ${BORDER}` }}>

      {/* Accent line at top */}
      <div className="h-0.5 w-full" style={{ background: color }} />

      {/* Dismiss button */}
      <button
        onClick={() => toast.dismiss(toastId)}
        className="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-full transition-opacity hover:opacity-70"
        style={{ background: "rgba(255,255,255,0.07)" }}>
        <X className="h-3 w-3" style={{ color: "rgba(255,255,255,0.5)" }} />
      </button>

      <div className="px-4 py-3.5">

        {/* Header row */}
        <div className="flex items-start gap-3 mb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl shrink-0"
            style={{ background: `${color}18` }}>
            <LevelIcon level={level} />
          </div>

          <div className="flex-1 min-w-0 pr-4">
            <p className="text-[11px] font-semibold leading-tight" style={{ color: "rgba(255,255,255,0.5)" }}>
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

        {/* Divider */}
        <div className="h-px mb-3" style={{ background: BORDER }} />

        {/* Risk score row */}
        <div className="flex items-center justify-between mb-2.5">
          <div>
            <p className="text-[9px] uppercase tracking-wide font-semibold"
              style={{ color: "rgba(255,255,255,0.3)" }}>
              Puntuación de Riesgo
            </p>
            {risk ? (
              <p className="text-xl font-black leading-tight" style={{ color }}>
                {risk.score}<span className="text-[11px] font-normal" style={{ color: "rgba(255,255,255,0.3)" }}>/100</span>
              </p>
            ) : (
              <p className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.2)" }}>—</p>
            )}
          </div>
          <LevelLabel level={level} />
        </div>

        {/* Score bar */}
        {risk && (
          <div className="h-1.5 rounded-full mb-3 overflow-hidden"
            style={{ background: "rgba(255,255,255,0.07)" }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${risk.score}%`, background: color }} />
          </div>
        )}

        {/* High-risk warning */}
        {level === "HIGH" && (
          <div className="rounded-xl px-3 py-2.5 mb-3 flex items-start gap-2"
            style={{ background: `${DANGER}0E`, border: `1px solid ${DANGER}25` }}>
            <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: DANGER }} />
            <p className="text-[10px] leading-snug" style={{ color: "rgba(255,255,255,0.55)" }}>
              {risk?.inBlacklist
                ? "Esta dirección está en la lista negra de USDT TRC20."
                : "Esta dirección interactuó con wallets sospechosas o congeladas."}
            </p>
          </div>
        )}

        {/* Reasons list */}
        {risk && risk.reasons.length > 0 && (
          <ul className="space-y-1 mb-3">
            {risk.reasons.map((r, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full mt-1.5 shrink-0"
                  style={{ background: color }} />
                <span className="text-[10px] leading-snug"
                  style={{ color: "rgba(255,255,255,0.45)" }}>{r}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Scan sender button */}
        {onScanSender && (
          <button
            onClick={() => { toast.dismiss(toastId); onScanSender(sender); }}
            className="w-full flex items-center justify-center gap-1.5 rounded-xl py-2 text-[11px] font-semibold transition-opacity active:opacity-70"
            style={{ background: `${color}15`, color }}>
            <ExternalLink className="h-3 w-3" />
            Analizar remitente
          </button>
        )}
      </div>
    </div>
  );
}

// ── Public helper to show the toast ──────────────────────────────────────────
interface ShowRiskAlertOptions {
  walletName:    string;
  amount:        string;
  sender:        string;
  risk:          RiskResult | null;
  onScanSender?: (address: string) => void;
}

export function showRiskAlert(opts: ShowRiskAlertOptions): void {
  const id = toast.custom(
    (t) => (
      <RiskAlertCard
        toastId={t}
        walletName={opts.walletName}
        amount={opts.amount}
        sender={opts.sender}
        risk={opts.risk}
        onScanSender={opts.onScanSender}
      />
    ),
    {
      duration: opts.risk?.level === "HIGH" ? 20_000 : 10_000,
      position: "top-center",
    }
  );
  return;
}
