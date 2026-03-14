import WalletAnalyzer from "@/components/WalletAnalyzer";
import { ScanSearch, ShieldBan, ListX } from "lucide-react";

interface ScannerPageProps {
  prefillAddress?: string;
  onAddressConsumed?: () => void;
}

const FEATURES = [
  {
    icon: ScanSearch,
    title: "Análisis de riesgo",
    desc: "Puntuación 0–100 basada en historial, volumen y contrapartes.",
    color: "text-[#00ff88]",
    bg: "bg-[#00ff88]/10",
  },
  {
    icon: ShieldBan,
    title: "Detección de wallets congeladas",
    desc: "Verifica en tiempo real si el contrato USDT ha congelado la dirección.",
    color: "text-red-400",
    bg: "bg-red-500/10",
  },
  {
    icon: ListX,
    title: "Blacklist USDT TRC20",
    desc: "Consulta la base de datos de direcciones bloqueadas por Tether.",
    color: "text-orange-400",
    bg: "bg-orange-500/10",
  },
];

const ScannerPage = ({ prefillAddress, onAddressConsumed }: ScannerPageProps) => (
  <div className="pb-24">
    {/* Feature pills */}
    <div className="px-4 pt-5 pb-3 grid grid-cols-1 gap-2">
      {FEATURES.map(({ icon: Icon, title, desc, color, bg }) => (
        <div key={title} className="flex items-start gap-3 rounded-xl border border-white/8 bg-white/4 px-4 py-3">
          <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${bg}`}>
            <Icon className={`h-4 w-4 ${color}`} />
          </div>
          <div>
            <p className="text-xs font-semibold text-white">{title}</p>
            <p className="text-[11px] text-white/40 leading-snug mt-0.5">{desc}</p>
          </div>
        </div>
      ))}
    </div>

    {/* Existing full scanner */}
    <WalletAnalyzer prefillAddress={prefillAddress} onAddressConsumed={onAddressConsumed} />
  </div>
);

export default ScannerPage;
