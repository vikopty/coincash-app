import WalletAnalyzer from "@/components/WalletAnalyzer";
import { ScanSearch, ShieldBan, ListX } from "lucide-react";

const CARD    = "#121821";
const GREEN   = "#19C37D";
const DANGER  = "#FF4D4F";
const BORDER  = "rgba(255,255,255,0.06)";
const SHADOW  = "0 4px 24px rgba(0,0,0,0.45)";

interface ScannerPageProps {
  prefillAddress?: string;
  onAddressConsumed?: () => void;
}

const CHIPS = [
  { icon: ScanSearch, label: "Análisis de riesgo",   color: GREEN  },
  { icon: ShieldBan,  label: "Wallet congelada",      color: DANGER },
  { icon: ListX,      label: "Blacklist TRC20",        color: "#F59E0B" },
];

const ScannerPage = ({ prefillAddress, onAddressConsumed }: ScannerPageProps) => (
  <div className="pb-24" style={{ minHeight: "100vh", background: "#0B0F14" }}>
    {/* Header */}
    <div className="px-5 pt-10 pb-2">
      <h1 className="text-xl font-bold text-white">Wallet Scanner</h1>
      <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>Análisis de seguridad TRON en tiempo real</p>
    </div>

    {/* Capability chips */}
    <div className="px-4 pt-3 pb-4 flex gap-2 overflow-x-auto scrollbar-hide">
      {CHIPS.map(({ icon: Icon, label, color }) => (
        <div key={label}
          className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5"
          style={{ background: `${color}14`, border: `1px solid ${color}30` }}>
          <Icon className="h-3.5 w-3.5" style={{ color }} />
          <span className="text-xs font-medium whitespace-nowrap" style={{ color }}>{label}</span>
        </div>
      ))}
    </div>

    {/* How-it-works cards — compact 3-col */}
    <div className="px-4 pb-4 grid grid-cols-3 gap-2.5">
      {[
        { icon: ScanSearch, title: "Riesgo",      desc: "Puntuación 0–100",          color: GREEN  },
        { icon: ShieldBan,  title: "Congeladas",  desc: "Contrato USDT",             color: DANGER },
        { icon: ListX,      title: "Blacklist",   desc: "Base de datos Tether",      color: "#F59E0B" },
      ].map(({ icon: Icon, title, desc, color }) => (
        <div key={title} className="rounded-2xl p-3 flex flex-col gap-2"
          style={{ background: CARD, border: `1px solid ${BORDER}`, boxShadow: SHADOW }}>
          <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: `${color}18` }}>
            <Icon className="h-4 w-4" style={{ color }} />
          </div>
          <div>
            <p className="text-xs font-semibold text-white">{title}</p>
            <p className="text-[10px] leading-tight mt-0.5" style={{ color: "rgba(255,255,255,0.38)" }}>{desc}</p>
          </div>
        </div>
      ))}
    </div>

    {/* Divider label */}
    <div className="px-4 mb-2 flex items-center gap-3">
      <div className="flex-1 h-px" style={{ background: BORDER }} />
      <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.25)" }}>Análisis</span>
      <div className="flex-1 h-px" style={{ background: BORDER }} />
    </div>

    {/* Full WalletAnalyzer — untouched */}
    <WalletAnalyzer prefillAddress={prefillAddress} onAddressConsumed={onAddressConsumed} />
  </div>
);

export default ScannerPage;
