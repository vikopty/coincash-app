import { useState, useEffect } from "react";
import { Plus, Eye, Download, Trash2, ScanSearch, Copy, CheckCheck } from "lucide-react";
import { toast } from "sonner";

export interface SavedWallet {
  id: string;
  name: string;
  address: string;
  type: "watch" | "imported";
  addedAt: number;
}

const STORAGE_KEY = "wg_wallets";

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

const WalletsPage = ({ onScan }: WalletsPageProps) => {
  const [wallets, setWallets] = useState<SavedWallet[]>(loadWallets);
  const [modal, setModal] = useState<Modal>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => { saveWallets(wallets); }, [wallets]);

  const isValidTron = (a: string) => /^T[A-Za-z0-9]{33}$/.test(a.trim());

  const addWallet = (type: "watch" | "imported") => {
    const trimAddr = address.trim();
    const trimName = name.trim() || `Wallet ${wallets.length + 1}`;
    if (!isValidTron(trimAddr)) {
      toast.error("Dirección TRON inválida. Debe comenzar con T y tener 34 caracteres.");
      return;
    }
    if (wallets.find(w => w.address === trimAddr)) {
      toast.error("Esta dirección ya está guardada.");
      return;
    }
    const newWallet: SavedWallet = {
      id: crypto.randomUUID(),
      name: trimName,
      address: trimAddr,
      type,
      addedAt: Date.now(),
    };
    setWallets(prev => [newWallet, ...prev]);
    setModal(null);
    setName(""); setAddress("");
    toast.success(`Wallet "${trimName}" añadida.`);
  };

  const remove = (id: string) => {
    setWallets(prev => prev.filter(w => w.id !== id));
    toast.success("Wallet eliminada.");
  };

  const copy = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopied(addr);
    setTimeout(() => setCopied(null), 1500);
  };

  const short = (addr: string) => `${addr.slice(0, 8)}…${addr.slice(-6)}`;

  return (
    <div className="flex flex-col gap-5 px-4 py-6 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Wallets</h1>
          <p className="text-xs text-white/40 mt-0.5">{wallets.length} dirección{wallets.length !== 1 ? "es" : ""} guardada{wallets.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Watch wallet",   icon: Eye,      action: () => setModal("watch") },
          { label: "Import wallet",  icon: Download, action: () => setModal("import") },
          { label: "Nueva wallet",   icon: Plus,     action: () => setModal("watch") },
        ].map(({ label, icon: Icon, action }) => (
          <button
            key={label}
            onClick={action}
            className="flex flex-col items-center gap-2 rounded-xl border border-white/8 bg-white/4 py-4 px-2 transition-colors active:bg-white/10"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#00ff88]/10">
              <Icon className="h-4 w-4 text-[#00ff88]" />
            </div>
            <span className="text-[11px] text-white/60 text-center leading-tight">{label}</span>
          </button>
        ))}
      </div>

      {/* Wallet list */}
      {wallets.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-14 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/4">
            <Eye className="h-6 w-6 text-white/30" />
          </div>
          <p className="text-sm text-white/40">Sin wallets guardadas</p>
          <p className="text-xs text-white/25">Añade una dirección TRON para monitorearla</p>
        </div>
      ) : (
        <div className="space-y-3">
          {wallets.map(w => (
            <div key={w.id} className="rounded-xl border border-white/8 bg-white/4 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white truncate">{w.name}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      w.type === "imported" ? "bg-purple-500/20 text-purple-300" : "bg-cyan-500/20 text-cyan-300"
                    }`}>
                      {w.type === "imported" ? "Importada" : "Watch"}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="text-xs text-white/40 font-mono">{short(w.address)}</span>
                    <button onClick={() => copy(w.address)} className="text-white/30 hover:text-white/60">
                      {copied === w.address
                        ? <CheckCheck className="h-3 w-3 text-green-400" />
                        : <Copy className="h-3 w-3" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-white/25 mt-1">
                    {new Date(w.addedAt).toLocaleDateString("es-ES")}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => onScan(w.address)}
                    title="Analizar en Scanner"
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#00ff88]/10 text-[#00ff88] hover:bg-[#00ff88]/20 transition-colors"
                  >
                    <ScanSearch className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => remove(w.id)}
                    title="Eliminar"
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/70 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div
            className="w-full rounded-t-2xl border-t border-white/10 bg-[#0b0b0b] p-6 pb-10 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-white">
              {modal === "watch" ? "Añadir Watch Wallet" : "Importar Wallet"}
            </h2>
            <p className="text-xs text-white/40">
              {modal === "watch"
                ? "Monitorea una dirección TRON sin importar claves privadas."
                : "Añade la dirección pública de tu wallet importada para verificación."}
            </p>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Nombre (opcional)"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-[#00ff88]/50"
              />
              <input
                type="text"
                placeholder="Dirección TRON (T...)"
                value={address}
                onChange={e => setAddress(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-[#00ff88]/50 font-mono"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setModal(null); setName(""); setAddress(""); }}
                className="flex-1 rounded-xl border border-white/10 py-3 text-sm text-white/60"
              >
                Cancelar
              </button>
              <button
                onClick={() => addWallet(modal === "import" ? "imported" : "watch")}
                className="flex-1 rounded-xl py-3 text-sm font-semibold text-black"
                style={{ background: "#00ff88" }}
              >
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
