import { useState, useEffect } from "react";
import { Lock, Eye, EyeOff, Timer, Smartphone, ChevronRight } from "lucide-react";
import { toast } from "sonner";

interface Settings {
  passcodeLock: boolean;
  faceId: boolean;
  autoLock: "1" | "5" | "15" | "never";
  hideBalance: boolean;
}

const DEFAULT: Settings = { passcodeLock: false, faceId: false, autoLock: "5", hideBalance: false };
const STORAGE_KEY = "wg_settings";

function load(): Settings {
  try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") }; }
  catch { return DEFAULT; }
}

const AUTO_LOCK_LABELS: Record<Settings["autoLock"], string> = {
  "1": "1 minuto",
  "5": "5 minutos",
  "15": "15 minutos",
  "never": "Nunca",
};

const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
  <button
    onClick={() => onChange(!value)}
    className="relative flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200"
    style={{ background: value ? "#00ff88" : "rgba(255,255,255,0.12)" }}
  >
    <span
      className="absolute h-5 w-5 rounded-full bg-black shadow transition-all duration-200"
      style={{ left: value ? "calc(100% - 22px)" : "2px" }}
    />
  </button>
);

const SettingsPage = () => {
  const [s, setS] = useState<Settings>(load);
  const [showAutoLock, setShowAutoLock] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }, [s]);

  const set = <K extends keyof Settings>(key: K, val: Settings[K]) => {
    setS(prev => ({ ...prev, [key]: val }));
    toast.success("Configuración guardada.");
  };

  return (
    <div className="flex flex-col gap-5 px-4 py-6 pb-24">
      <div>
        <h1 className="text-xl font-bold text-white">Settings</h1>
        <p className="text-xs text-white/40 mt-0.5">Seguridad y preferencias</p>
      </div>

      {/* Security group */}
      <div className="space-y-1">
        <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-2">Seguridad</p>

        {/* Passcode lock */}
        <div className="flex items-center gap-3 rounded-t-xl border border-white/8 bg-white/4 px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500/15">
            <Lock className="h-4 w-4 text-blue-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-white">Código de acceso</p>
            <p className="text-xs text-white/40">Protege la app con un PIN</p>
          </div>
          <Toggle value={s.passcodeLock} onChange={v => set("passcodeLock", v)} />
        </div>

        {/* Face ID */}
        <div className="flex items-center gap-3 border-x border-b border-white/8 bg-white/4 px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-500/15">
            <Smartphone className="h-4 w-4 text-purple-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-white">Face ID / Biometría</p>
            <p className="text-xs text-white/40">Acceso con reconocimiento facial</p>
          </div>
          <Toggle value={s.faceId} onChange={v => set("faceId", v)} />
        </div>

        {/* Auto lock */}
        <div
          className="flex items-center gap-3 border-x border-b border-white/8 bg-white/4 px-4 py-4 cursor-pointer active:bg-white/8"
          onClick={() => setShowAutoLock(true)}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-500/15">
            <Timer className="h-4 w-4 text-orange-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-white">Bloqueo automático</p>
            <p className="text-xs text-white/40">{AUTO_LOCK_LABELS[s.autoLock]}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-white/30" />
        </div>

        {/* Hide balance */}
        <div className="flex items-center gap-3 rounded-b-xl border-x border-b border-white/8 bg-white/4 px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#00ff88]/10">
            {s.hideBalance ? <EyeOff className="h-4 w-4 text-[#00ff88]" /> : <Eye className="h-4 w-4 text-[#00ff88]" />}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-white">Ocultar balance</p>
            <p className="text-xs text-white/40">Enmascara los saldos en pantalla</p>
          </div>
          <Toggle value={s.hideBalance} onChange={v => set("hideBalance", v)} />
        </div>
      </div>

      {/* App info */}
      <div className="space-y-1">
        <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-2">Acerca de</p>
        <div className="rounded-xl border border-white/8 bg-white/4 divide-y divide-white/5">
          {[
            ["App", "CoinCash WalletGuard"],
            ["Versión", "1.0.0"],
            ["Red", "TRON Mainnet"],
            ["Contrato USDT", "TR7NHqjeK…Lj6t"],
          ].map(([label, val]) => (
            <div key={label} className="flex justify-between px-4 py-3">
              <span className="text-sm text-white/50">{label}</span>
              <span className="text-sm text-white font-medium">{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Auto lock picker modal */}
      {showAutoLock && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/70 backdrop-blur-sm" onClick={() => setShowAutoLock(false)}>
          <div className="w-full rounded-t-2xl border-t border-white/10 bg-[#0b0b0b] p-6 pb-10 space-y-3" onClick={e => e.stopPropagation()}>
            <p className="text-base font-semibold text-white mb-4">Bloqueo automático</p>
            {(Object.entries(AUTO_LOCK_LABELS) as [Settings["autoLock"], string][]).map(([val, label]) => (
              <button
                key={val}
                onClick={() => { set("autoLock", val); setShowAutoLock(false); }}
                className="flex w-full items-center justify-between rounded-xl border border-white/8 bg-white/4 px-4 py-3"
              >
                <span className="text-sm text-white">{label}</span>
                {s.autoLock === val && <span className="h-2 w-2 rounded-full bg-[#00ff88]" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
