import { Shield, AlertTriangle, Ban, ScanSearch, Bell, ChevronRight, Wifi } from "lucide-react";

const BG   = "#0B0F14";
const CARD = "#121821";
const GREEN = "#19C37D";
const BLUE  = "#3B82F6";
const DANGER = "#FF4D4F";
const BORDER = "rgba(255,255,255,0.06)";
const SHADOW = "0 4px 24px rgba(0,0,0,0.45)";

interface DashboardPageProps {
  onScanWallet?: (address: string) => void;
}

const DashboardPage = ({ onScanWallet }: DashboardPageProps) => {
  const raw     = localStorage.getItem("wg_daily_stats");
  const stats   = raw ? JSON.parse(raw) : { analyzed: 0, highRisk: 0 };
  const wallets = JSON.parse(localStorage.getItem("wg_wallets") || "[]");

  const riskPct = stats.analyzed > 0
    ? Math.round((stats.highRisk / stats.analyzed) * 100)
    : 0;

  const secScore = Math.max(0, 100 - riskPct);

  return (
    <div style={{ background: BG, minHeight: "100vh" }} className="flex flex-col pb-24">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 pt-10 pb-4">
        <div className="flex items-center gap-3">
          <img src="/coincash-logo.png" alt="CoinCash" className="h-7 w-auto" />
        </div>
        <button className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <Bell className="h-4 w-4 text-white/50" />
        </button>
      </div>

      {/* ── Security Score Hero ── */}
      <div className="mx-4 mb-5 rounded-2xl p-5 relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, #0e1e2e 0%, #0d1a14 100%)`, border: `1px solid ${BORDER}`, boxShadow: SHADOW }}>
        {/* glow */}
        <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full opacity-20"
          style={{ background: `radial-gradient(circle, ${GREEN} 0%, transparent 70%)` }} />

        <p className="text-xs font-medium mb-3" style={{ color: "rgba(255,255,255,0.45)" }}>SEGURIDAD DE RED</p>

        <div className="flex items-end justify-between">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-5xl font-bold text-white">{secScore}</span>
              <span className="text-xl font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>/100</span>
            </div>
            <p className="text-sm mt-1 font-medium" style={{ color: secScore >= 80 ? GREEN : secScore >= 50 ? "#F59E0B" : DANGER }}>
              {secScore >= 80 ? "✓ Red segura" : secScore >= 50 ? "⚠ Riesgo moderado" : "✗ Riesgo elevado"}
            </p>
          </div>

          {/* Circular progress */}
          <div className="relative h-16 w-16">
            <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="26" fill="none" strokeWidth="5" stroke="rgba(255,255,255,0.08)" />
              <circle cx="32" cy="32" r="26" fill="none" strokeWidth="5"
                stroke={secScore >= 80 ? GREEN : secScore >= 50 ? "#F59E0B" : DANGER}
                strokeLinecap="round"
                strokeDasharray={`${(secScore / 100) * 163} 163`} />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">
              {secScore}%
            </span>
          </div>
        </div>

        {/* Sub-stats */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            { label: "Analizadas", value: stats.analyzed, color: GREEN },
            { label: "Alto riesgo", value: stats.highRisk, color: DANGER },
            { label: "Wallets",    value: wallets.length,  color: BLUE },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl p-2.5 text-center" style={{ background: "rgba(255,255,255,0.04)" }}>
              <p className="text-lg font-bold" style={{ color }}>{value}</p>
              <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Quick actions ── */}
      <p className="px-5 text-xs font-semibold mb-3 uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>Acciones rápidas</p>
      <div className="px-4 grid grid-cols-3 gap-3 mb-5">
        {[
          { label: "Escanear",   icon: ScanSearch,    color: GREEN, action: onScanWallet ? () => onScanWallet("") : undefined },
          { label: "Congelados", icon: Ban,            color: DANGER },
          { label: "Red TRON",   icon: Wifi,           color: BLUE },
        ].map(({ label, icon: Icon, color, action }) => (
          <button key={label} onClick={action}
            className="flex flex-col items-center gap-2.5 rounded-2xl py-5 px-3 transition-opacity active:opacity-70"
            style={{ background: CARD, border: `1px solid ${BORDER}`, boxShadow: SHADOW }}>
            <div className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: `${color}18` }}>
              <Icon className="h-5 w-5" style={{ color }} />
            </div>
            <span className="text-xs font-medium text-white">{label}</span>
          </button>
        ))}
      </div>

      {/* ── Security status ── */}
      <p className="px-5 text-xs font-semibold mb-3 uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>Estado de seguridad</p>
      <div className="mx-4 rounded-2xl overflow-hidden mb-5" style={{ background: CARD, border: `1px solid ${BORDER}`, boxShadow: SHADOW }}>
        {[
          { label: "Contrato USDT",     status: "Activo",     ok: true },
          { label: "Blacklist Monitor", status: "200 detectadas", ok: false },
          { label: "TronGrid API",      status: "Conectado",  ok: true },
          { label: "Motor de riesgo",   status: "En línea",   ok: true },
        ].map(({ label, status, ok }, i, arr) => (
          <div key={label}
            className="flex items-center justify-between px-4 py-3.5"
            style={{ borderBottom: i < arr.length - 1 ? `1px solid ${BORDER}` : "none" }}>
            <span className="text-sm text-white">{label}</span>
            <span className="text-xs font-semibold" style={{ color: ok ? GREEN : DANGER }}>{status}</span>
          </div>
        ))}
      </div>

      {/* ── Network info ── */}
      <p className="px-5 text-xs font-semibold mb-3 uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>Blockchain</p>
      <div className="mx-4 rounded-2xl p-4 flex items-center gap-3 mb-5"
        style={{ background: CARD, border: `1px solid ${BORDER}`, boxShadow: SHADOW }}>
        <img src="/tron-logo.png" alt="TRON" className="h-10 w-10 rounded-full object-cover" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">TRON Mainnet</p>
          <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>USDT TRC20 · TronGrid</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: GREEN }} />
          <span className="text-xs font-medium" style={{ color: GREEN }}>Live</span>
        </div>
      </div>

      {/* ── Saved wallets preview ── */}
      {wallets.length > 0 && (
        <>
          <p className="px-5 text-xs font-semibold mb-3 uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>Mis wallets</p>
          <div className="mx-4 rounded-2xl overflow-hidden" style={{ background: CARD, border: `1px solid ${BORDER}`, boxShadow: SHADOW }}>
            {wallets.slice(0, 3).map((w: { id: string; name: string; address: string; type: string }, i: number) => (
              <div key={w.id} className="flex items-center gap-3 px-4 py-3.5"
                style={{ borderBottom: i < Math.min(wallets.length, 3) - 1 ? `1px solid ${BORDER}` : "none" }}>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                  style={{ background: `${BLUE}22`, color: BLUE }}>
                  {w.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{w.name}</p>
                  <p className="text-[11px] font-mono truncate" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {w.address.slice(0, 10)}…{w.address.slice(-6)}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "rgba(255,255,255,0.2)" }} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default DashboardPage;
