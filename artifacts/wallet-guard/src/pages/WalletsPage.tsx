import { useState, useEffect } from "react";
import { Plus, Eye, Download, Trash2, ScanSearch, Copy, CheckCheck, Wallet } from "lucide-react";
import { toast } from "sonner";

export interface SavedWallet {
  id: string;
  name: string;
  address: string;
  type: "watch" | "imported";
  addedAt: number;
}

const STORAGE_KEY = "wg_wallets";

const BG     = "#0B0F14";
const CARD   = "#121821";
const GREEN  = "#19C37D";
const BLUE   = "#3B82F6";
const BORDER = "rgba(255,255,255,0.06)";
const SHADOW = "0 4px 24px rgba(0,0,0,0.45)";

function loadWallets(): SavedWallet[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}
function saveWallets(wallets: SavedWallet[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(wallets));
}

interface WalletsPageProps {
  onScan: (address: string) => void;
}

type Modal = "watch" | "import" | null;

const ACTIONS: { label: string; icon: React.FC<React.SVGProps<SVGSVGElement>>; modal: Modal }[] = [
  { label: "Watch wallet",  icon: Eye,      modal: "watch" },
  { label: "Import wallet", icon: Download, modal: "import" },
  { label: "Nueva",         icon: Plus,     modal: "watch" },
];

const WalletsPage = ({ onScan }: WalletsPageProps) => {
  const [wallets, setWallets] = useState<SavedWallet[]>(loadWallets);
  const [modal, setModal]     = useState<Modal>(null);
  const [name, setName]       = useState("");
  const [address, setAddress] = useState("");
  const [copied, setCopied]   = useState<string | null>(null);

  useEffect(() => { saveWallets(wallets); }, [wallets]);

  const isValidTron = (a: string) => /^T[A-Za-z0-9]{33}$/.test(a.trim());

  const addWallet = (type: "watch" | "imported") => {
    const trimAddr = address.trim();
    const trimName = name.trim() || `Wallet ${wallets.length + 1}`;
    if (!isValidTron(trimAddr)) {
      toast.error("Dirección TRON inválida.");
      return;
    }
    if (wallets.find(w => w.address === trimAddr)) {
      toast.error("Esta dirección ya está guardada.");
      return;
    }
    setWallets(prev => [{ id: crypto.randomUUID(), name: trimName, address: trimAddr, type, addedAt: Date.now() }, ...prev]);
    setModal(null); setName(""); setAddress("");
    toast.success(`Wallet "${trimName}" añadida.`);
  };

  const remove = (id: string) => { setWallets(prev => prev.filter(w => w.id !== id)); toast.success("Wallet eliminada."); };

  const copy = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopied(addr);
    setTimeout(() => setCopied(null), 1500);
  };

  const short = (addr: string) => `${addr.slice(0, 8)}…${addr.slice(-6)}`;

  const avatarColor = (type: "watch" | "imported") => type === "imported" ? "#A78BFA" : BLUE;

  return (
    <div style={{ background: BG, minHeight: "100vh" }} className="flex flex-col pb-24">

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-10 pb-5">
        <div>
          <h1 className="text-xl font-bold text-white">Wallets</h1>
          <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
            {wallets.length} dirección{wallets.length !== 1 ? "es" : ""} guardada{wallets.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setModal("watch")}
          className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{ background: GREEN, boxShadow: `0 0 16px ${GREEN}44` }}>
          <Plus className="h-4 w-4 text-black" />
        </button>
      </div>

      {/* Action buttons */}
      <div className="px-4 grid grid-cols-3 gap-3 mb-6">
        {ACTIONS.map(({ label, icon: Icon, modal: m }) => (
          <button key={label} onClick={() => setModal(m)}
            className="flex flex-col items-center gap-2.5 rounded-2xl py-5 px-2 transition-opacity active:opacity-70"
            style={{ background: CARD, border: `1px solid ${BORDER}`, boxShadow: SHADOW }}>
            <div className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: `${GREEN}18` }}>
              <Icon className="h-5 w-5" style={{ color: GREEN }} />
            </div>
            <span className="text-xs font-medium text-white text-center leading-tight">{label}</span>
          </button>
        ))}
      </div>

      {/* Wallet list */}
      {wallets.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center px-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-full" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
            <Wallet className="h-7 w-7" style={{ color: "rgba(255,255,255,0.2)" }} />
          </div>
          <p className="text-sm font-medium text-white">Sin wallets guardadas</p>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>Añade una dirección TRON para monitorear su seguridad</p>
          <button onClick={() => setModal("watch")}
            className="mt-2 rounded-full px-6 py-2.5 text-sm font-semibold text-black"
            style={{ background: GREEN }}>
            Añadir wallet
          </button>
        </div>
      ) : (
        <div className="px-4 rounded-2xl overflow-hidden mx-0" style={{ background: CARD, border: `1px solid ${BORDER}`, boxShadow: SHADOW, margin: "0 16px" }}>
          {wallets.map((w, i) => (
            <div key={w.id} className="flex items-center gap-3 px-4 py-4"
              style={{ borderBottom: i < wallets.length - 1 ? `1px solid ${BORDER}` : "none" }}>
              {/* Avatar */}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                style={{ background: `${avatarColor(w.type)}22`, color: avatarColor(w.type) }}>
                {w.name.slice(0, 1).toUpperCase()}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white truncate">{w.name}</span>
                  <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase"
                    style={{ background: `${avatarColor(w.type)}22`, color: avatarColor(w.type) }}>
                    {w.type === "imported" ? "Importada" : "Watch"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[11px] font-mono" style={{ color: "rgba(255,255,255,0.38)" }}>{short(w.address)}</span>
                  <button onClick={() => copy(w.address)}>
                    {copied === w.address
                      ? <CheckCheck className="h-3 w-3" style={{ color: GREEN }} />
                      : <Copy className="h-3 w-3" style={{ color: "rgba(255,255,255,0.25)" }} />}
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => onScan(w.address)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl transition-opacity active:opacity-60"
                  style={{ background: `${GREEN}18` }}>
                  <ScanSearch className="h-4 w-4" style={{ color: GREEN }} />
                </button>
                <button onClick={() => remove(w.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl transition-opacity active:opacity-60"
                  style={{ background: "rgba(255,77,79,0.12)" }}>
                  <Trash2 className="h-4 w-4" style={{ color: "#FF4D4F" }} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bottom sheet modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.75)" }}
          onClick={() => { setModal(null); setName(""); setAddress(""); }}>
          <div className="w-full rounded-t-3xl p-6 pb-10 space-y-4"
            style={{ background: "#141c27", borderTop: `1px solid ${BORDER}` }}
            onClick={e => e.stopPropagation()}>

            <div className="mx-auto mb-2 h-1 w-10 rounded-full" style={{ background: BORDER }} />

            <h2 className="text-base font-bold text-white">
              {modal === "watch" ? "Watch Wallet" : "Importar Wallet"}
            </h2>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
              {modal === "watch"
                ? "Monitorea una dirección TRON sin importar claves privadas."
                : "Añade la dirección pública de tu wallet para verificación y análisis."}
            </p>

            <input type="text" placeholder="Nombre (opcional)"
              value={name} onChange={e => setName(e.target.value)}
              className="w-full rounded-2xl px-4 py-3.5 text-sm text-white outline-none"
              style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}` }} />

            <input type="text" placeholder="Dirección TRON (T...)"
              value={address} onChange={e => setAddress(e.target.value)}
              className="w-full rounded-2xl px-4 py-3.5 text-sm text-white outline-none font-mono"
              style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}` }} />

            <div className="flex gap-3 pt-1">
              <button onClick={() => { setModal(null); setName(""); setAddress(""); }}
                className="flex-1 rounded-2xl py-3.5 text-sm font-medium"
                style={{ border: `1px solid ${BORDER}`, color: "rgba(255,255,255,0.5)" }}>
                Cancelar
              </button>
              <button onClick={() => addWallet(modal === "import" ? "imported" : "watch")}
                className="flex-1 rounded-2xl py-3.5 text-sm font-bold text-black"
                style={{ background: GREEN, boxShadow: `0 0 20px ${GREEN}44` }}>
                Añadir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WalletsPage;
