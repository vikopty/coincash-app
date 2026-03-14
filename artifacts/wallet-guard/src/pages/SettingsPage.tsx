import { useState, useEffect } from "react";
import { Lock, Eye, EyeOff, Timer, Smartphone, ChevronRight, Info } from "lucide-react";
import { toast } from "sonner";

const BG     = "#0B0F14";
const CARD   = "#121821";
const GREEN  = "#19C37D";
const BORDER = "rgba(255,255,255,0.06)";
const SHADOW = "0 4px 24px rgba(0,0,0,0.45)";

interface Settings {
  passcodeLock: boolean;
  faceId: boolean;
  autoLock: "1" | "5" | "15" | "never";
  hideBalance: boolean;
}

const DEFAULT: Settings = { passcodeLock: false, faceId: false, autoLock: "5", hideBalance: false };
const STORAGE_KEY = "wg_settings";

function load(): Settings {
  try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") }; } catch { return DEFAULT; }
}

const AUTO_LOCK_LABELS: Record<Settings["autoLock"], string> = {
  "1": "1 minuto", "5": "5 minutos", "15": "15 minutos", "never": "Nunca",
};

const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
  <button onClick={() => onChange(!value)}
    className="relative flex h-[26px] w-12 shrink-0 items-center rounded-full transition-all duration-200"
    style={{ background: value ? GREEN : "rgba(255,255,255,0.1)" }}>
    <span className="absolute h-[22px] w-[22px] rounded-full bg-white shadow-sm transition-all duration-200"
      style={{ left: value ? "calc(100% - 24px)" : "2px" }} />
  </button>
);

const SettingsPage = () => {
  const [s, setS]               = useState<Settings>(load);
  const [showAutoLock, setShow] = useState(false);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }, [s]);

  const set = <K extends keyof Settings>(key: K, val: Settings[K]) => {
    setS(prev => ({ ...prev, [key]: val }));
    toast.success("Configuración guardada.");
  };

  const securityRows = [
    {
      icon: Lock, color: "#3B82F6", label: "Código de acceso", sub: "Protege la app con un PIN",
      right: <Toggle value={s.passcodeLock} onChange={v => set("passcodeLock", v)} />,
    },
    {
      icon: Smartphone, color: "#A78BFA", label: "Face ID / Biometría", sub: "Acceso con reconocimiento facial",
      right: <Toggle value={s.faceId} onChange={v => set("faceId", v)} />,
    },
    {
      icon: Timer, color: "#F59E0B", label: "Bloqueo automático", sub: AUTO_LOCK_LABELS[s.autoLock],
      right: <ChevronRight className="h-4 w-4" style={{ color: "rgba(255,255,255,0.3)" }} />,
      onClick: () => setShow(true),
    },
    {
      icon: s.hideBalance ? EyeOff : Eye, color: GREEN, label: "Ocultar balance", sub: "Enmascara saldos en pantalla",
      right: <Toggle value={s.hideBalance} onChange={v => set("hideBalance", v)} />,
    },
  ];

  return (
    <div style={{ background: BG, minHeight: "100vh" }} className="flex flex-col pb-24">
      <div className="px-5 pt-10 pb-6">
        <h1 className="text-xl font-bold text-white">Settings</h1>
        <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>Seguridad y preferencias</p>
      </div>

      {/* Security */}
      <p className="px-5 text-xs font-semibold mb-3 uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>Seguridad</p>
      <div className="mx-4 rounded-2xl overflow-hidden mb-6" style={{ background: CARD, border: `1px solid ${BORDER}`, boxShadow: SHADOW }}>
        {securityRows.map(({ icon: Icon, color, label, sub, right, onClick }, i) => (
          <div key={label}
            className="flex items-center gap-3 px-4 py-4 cursor-pointer"
            style={{ borderBottom: i < securityRows.length - 1 ? `1px solid ${BORDER}` : "none" }}
            onClick={onClick}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: `${color}18` }}>
              <Icon className="h-4 w-4" style={{ color }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">{label}</p>
              <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>{sub}</p>
            </div>
            {right}
          </div>
        ))}
      </div>

      {/* About */}
      <p className="px-5 text-xs font-semibold mb-3 uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>Acerca de</p>
      <div className="mx-4 rounded-2xl overflow-hidden mb-6" style={{ background: CARD, border: `1px solid ${BORDER}`, boxShadow: SHADOW }}>
        {[["App", "CoinCash WalletGuard"], ["Versión", "1.0.0"], ["Red", "TRON Mainnet"], ["Contrato USDT", "TR7NHqjeK…Lj6t"]].map(([label, val], i, arr) => (
          <div key={label} className="flex justify-between items-center px-4 py-3.5"
            style={{ borderBottom: i < arr.length - 1 ? `1px solid ${BORDER}` : "none" }}>
            <span className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>{label}</span>
            <span className="text-sm font-semibold text-white">{val}</span>
          </div>
        ))}
      </div>

      {/* Disclaimer */}
      <div className="mx-4 rounded-2xl p-4 flex items-start gap-3"
        style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)" }}>
        <Info className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "#3B82F6" }} />
        <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
          CoinCash WalletGuard realiza análisis de seguridad en tiempo real sobre la red TRON.
          Los datos provienen de TronGrid API y el contrato oficial de USDT TRC20.
        </p>
      </div>

      {/* Auto lock picker */}
      {showAutoLock && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.75)" }}
          onClick={() => setShow(false)}>
          <div className="w-full rounded-t-3xl p-6 pb-10 space-y-3"
            style={{ background: "#141c27", borderTop: `1px solid ${BORDER}` }}
            onClick={e => e.stopPropagation()}>
            <div className="mx-auto mb-2 h-1 w-10 rounded-full" style={{ background: BORDER }} />
            <p className="text-base font-bold text-white mb-4">Bloqueo automático</p>
            {(Object.entries(AUTO_LOCK_LABELS) as [Settings["autoLock"], string][]).map(([val, label]) => (
              <button key={val} onClick={() => { set("autoLock", val); setShow(false); }}
                className="flex w-full items-center justify-between rounded-2xl px-4 py-3.5"
                style={{ background: s.autoLock === val ? `${GREEN}15` : "rgba(255,255,255,0.04)", border: `1px solid ${s.autoLock === val ? GREEN + "40" : BORDER}` }}>
                <span className="text-sm text-white">{label}</span>
                {s.autoLock === val && <span className="h-2 w-2 rounded-full" style={{ background: GREEN }} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
