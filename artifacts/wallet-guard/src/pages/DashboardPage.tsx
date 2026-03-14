import { Shield, AlertTriangle, Ban, Clock, TrendingUp, Activity } from "lucide-react";
import ScannerPanel from "@/components/ScannerPanel";

interface DashboardPageProps {
  onScanWallet?: (address: string) => void;
}

const DashboardPage = ({ onScanWallet: _ }: DashboardPageProps) => {
  const raw = localStorage.getItem("wg_daily_stats");
  const stats = raw ? JSON.parse(raw) : { analyzed: 0, highRisk: 0 };
  const wallets = JSON.parse(localStorage.getItem("wg_wallets") || "[]");

  const frozen = JSON.parse(localStorage.getItem("wg_blacklist_meta") || '{"count":200}');

  return (
    <div className="flex flex-col gap-5 px-4 py-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Dashboard</h1>
          <p className="text-xs text-white/40 mt-0.5">Resumen de seguridad TRON</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1">
          <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-green-400 font-medium">En línea</span>
        </div>
      </div>

      {/* Quick stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/8 bg-white/4 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <Shield className="h-4 w-4 text-green-400" />
            <TrendingUp className="h-3 w-3 text-white/20" />
          </div>
          <p className="text-2xl font-bold text-white">{stats.analyzed}</p>
          <p className="text-xs text-white/40">Analizadas hoy</p>
        </div>
        <div className="rounded-xl border border-white/8 bg-white/4 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <AlertTriangle className="h-4 w-4 text-orange-400" />
            <Activity className="h-3 w-3 text-white/20" />
          </div>
          <p className="text-2xl font-bold text-white">{stats.highRisk}</p>
          <p className="text-xs text-white/40">Alto riesgo hoy</p>
        </div>
        <div className="rounded-xl border border-white/8 bg-white/4 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <Ban className="h-4 w-4 text-red-400" />
            <Activity className="h-3 w-3 text-white/20" />
          </div>
          <p className="text-2xl font-bold text-white">200</p>
          <p className="text-xs text-white/40">Wallets congeladas</p>
        </div>
        <div className="rounded-xl border border-white/8 bg-white/4 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <Clock className="h-4 w-4 text-cyan-400" />
            <Activity className="h-3 w-3 text-white/20" />
          </div>
          <p className="text-2xl font-bold text-white">{wallets.length}</p>
          <p className="text-xs text-white/40">Wallets guardadas</p>
        </div>
      </div>

      {/* Scanner panel */}
      <ScannerPanel analyzedToday={stats.analyzed} highRiskToday={stats.highRisk} />

      {/* Network status */}
      <div className="rounded-xl border border-white/8 bg-white/4 p-4 space-y-3">
        <p className="text-xs font-semibold text-white/50 uppercase tracking-widest">Red</p>
        <div className="flex items-center gap-3">
          <img src="/tron-logo.png" alt="TRON" className="h-9 w-9 rounded-full object-cover" />
          <div>
            <p className="text-sm font-semibold text-white">TRON Mainnet</p>
            <p className="text-xs text-white/40">USDT TRC20 · TronGrid API</p>
          </div>
          <span className="ml-auto text-xs text-green-400 font-medium">Activo</span>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
