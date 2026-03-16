import { useState, useEffect } from "react";
import {
  Plus, Eye, Trash2, ScanSearch, Copy, CheckCheck, Wallet, Key,
  AlertTriangle, Sparkles, ShieldCheck, FileText, ChevronRight,
  EyeOff, Lock, X
} from "lucide-react";
import { toast } from "sonner";
import {
  generateTronWallet, importFromMnemonic, importFromPrivateKey,
  importFromKeystore, validateTronAddress, type TronWallet
} from "@/lib/tronWallet";
import { encryptPrivateKey, deleteEncryptedKey, isPinEnabled } from "@/lib/security";
import WalletDetailSheet from "@/components/WalletDetailSheet";

// ── Palette ───────────────────────────────────────────────────────────────────
const BG     = "#0B0F14";
const CARD   = "#121821";
const GREEN  = "#19C37D";
const BLUE   = "#3B82F6";
const PURPLE = "#A78BFA";
const AMBER  = "#F59E0B";
const DANGER = "#FF4D4F";
const BORDER = "rgba(255,255,255,0.06)";
const SHADOW = "0 4px 24px rgba(0,0,0,0.45)";
const SHEET  = "#0f1923";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface SavedWallet {
  id: string; name: string; address: string;
  type: "watch" | "imported" | "created"; addedAt: number;
}

const STORAGE_KEY = "wg_wallets";
function loadWallets(): SavedWallet[] { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]"); } catch { return []; } }
function saveWallets(w: SavedWallet[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(w));
  window.dispatchEvent(new CustomEvent("wg:wallets-changed"));
}

const avatarColor = (t: SavedWallet["type"]) => t==="created"?PURPLE:t==="imported"?BLUE:GREEN;
const typeBadge   = (t: SavedWallet["type"]) =>
  t==="created"?{label:"Creada",color:PURPLE}:t==="imported"?{label:"Importada",color:BLUE}:{label:"Watch",color:GREEN};

type ModalType = "watch" | "import" | "create" | null;
type ImportTab  = "phrase" | "privkey" | "keystore";

interface Props { onScan: (address: string) => void; activeTab?: string; onNavigateSwap?: () => void }

// ── Sub-components ────────────────────────────────────────────────────────────
function BottomSheet({ onClose, children }: { onClose:()=>void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end"
      style={{ background:"rgba(0,0,0,0.75)", backdropFilter:"blur(4px)" }}
      onClick={onClose}>
      <div className="w-full rounded-t-[20px]"
        style={{
          height: "90vh",
          background: SHEET,
          borderTop: `1px solid ${BORDER}`,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch" as any,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
        onClick={e => e.stopPropagation()}>
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full" style={{ background:"rgba(255,255,255,0.15)" }} />
        </div>
        {children}
      </div>
    </div>
  );
}

function SheetHeader({ title, subtitle, icon: Icon, color, onClose }:
  { title:string; subtitle:string; icon:React.FC<any>; color:string; onClose:()=>void }) {
  return (
    <div className="px-6 pt-2 pb-4 flex items-start justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl shrink-0" style={{ background:`${color}18` }}>
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
        <div>
          <h2 className="text-base font-bold text-white">{title}</h2>
          <p className="text-[11px] mt-0.5" style={{ color:"rgba(255,255,255,0.4)" }}>{subtitle}</p>
        </div>
      </div>
      <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full shrink-0 ml-2"
        style={{ background:"rgba(255,255,255,0.06)" }}>
        <X className="h-4 w-4" style={{ color:"rgba(255,255,255,0.4)" }} />
      </button>
    </div>
  );
}

function Field({ label, children }: { label:string; children:React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="text-[11px] font-semibold uppercase tracking-wide mb-1.5 block"
        style={{ color:"rgba(255,255,255,0.4)" }}>{label}</label>
      {children}
    </div>
  );
}

function StyledInput({ className="", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full rounded-2xl px-4 py-3.5 text-sm text-white outline-none ${className}`}
    style={{ background:"rgba(255,255,255,0.05)", border:`1px solid ${BORDER}`, ...props.style }} />;
}

function ActionBtn({ label, color, onClick, disabled=false }:
  { label:string; color:string; onClick:()=>void; disabled?:boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="flex-1 rounded-2xl py-3.5 text-sm font-bold text-black transition-opacity"
      style={{ background:disabled?"rgba(255,255,255,0.08)":color, color:disabled?"rgba(255,255,255,0.3)":"black",
        boxShadow:disabled?"none":`0 0 18px ${color}40` }}>
      {label}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function WalletsPage({ onScan, activeTab, onNavigateSwap }: Props) {
  const [wallets, setWallets]     = useState<SavedWallet[]>(loadWallets);
  const [modal, setModal]         = useState<ModalType>(null);
  const [name, setName]           = useState("");
  const [address, setAddress]     = useState("");
  const [copied, setCopied]       = useState<string|null>(null);
  const [loading, setLoading]     = useState(false);
  const [detailWallet, setDetailWallet] = useState<SavedWallet|null>(null);
  const [coincashIds, setCoincashIds] = useState<Record<string, string>>({});

  // Close the detail sheet and any open modal when the user navigates to another tab
  useEffect(() => {
    if (activeTab !== "wallets") {
      setDetailWallet(null);
      setModal(null);
    }
  }, [activeTab]);

  // Create wallet state
  const [generated, setGenerated] = useState<TronWallet|null>(null);
  const [showKey, setShowKey]     = useState(false);
  const [showPhrase, setShowPhrase] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // Import state
  const [importTab, setImportTab] = useState<ImportTab>("phrase");
  const [phrase, setPhrase]       = useState<string[]>(Array(12).fill(""));
  const [privKey, setPrivKey]     = useState("");
  const [ksJson, setKsJson]       = useState("");
  const [ksPass, setKsPass]       = useState("");

  useEffect(() => { saveWallets(wallets); }, [wallets]);

  // Auto-generate and cache a CoinCash ID for every wallet
  useEffect(() => {
    wallets.forEach(async (w) => {
      if (coincashIds[w.address]) return;
      try {
        const res  = await fetch("/api-server/api/users/lookup", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ walletAddress: w.address }),
        });
        const data = await res.json();
        if (data.coincashId) {
          setCoincashIds(prev => ({ ...prev, [w.address]: data.coincashId }));
        }
      } catch { /* non-fatal — ID will retry on next render */ }
    });
  }, [wallets]);

  const closeModal = () => {
    setModal(null); setName(""); setAddress(""); setGenerated(null);
    setShowKey(false); setShowPhrase(false); setConfirmed(false);
    setPhrase(Array(12).fill("")); setPrivKey(""); setKsJson(""); setKsPass("");
    setLoading(false);
  };

  const copyText = (text:string, label:string) => {
    navigator.clipboard.writeText(text); setCopied(text);
    setTimeout(()=>setCopied(null),1500); toast.success(`${label} copiado.`);
  };

  const short = (addr:string) => `${addr.slice(0,10)}…${addr.slice(-6)}`;

  const addSavedWallet = (wallet: SavedWallet) => {
    setWallets(prev => [wallet, ...prev]);
    closeModal();
  };

  const remove = (id:string) => {
    deleteEncryptedKey(id);
    setWallets(prev => prev.filter(w=>w.id!==id));
    toast.success("Wallet eliminada.");
  };

  const renameWallet = (id: string, name: string) => {
    setWallets(prev => prev.map(w => w.id === id ? { ...w, name } : w));
    setDetailWallet(prev => prev?.id === id ? { ...prev, name } : prev);
  };

  // ── Watch wallet ──────────────────────────────────────────────────────────
  const handleAddWatch = async () => {
    const a = address.trim();
    const n = name.trim() || `Watch ${wallets.length+1}`;
    if (!await validateTronAddress(a)) { toast.error("Dirección TRON inválida."); return; }
    if (wallets.find(w=>w.address===a)) { toast.error("Esta dirección ya está guardada."); return; }
    addSavedWallet({ id:crypto.randomUUID(), name:n, address:a, type:"watch", addedAt:Date.now() });
    toast.success(`Wallet watch "${n}" añadida.`);
  };

  // ── Create wallet ─────────────────────────────────────────────────────────
  const openCreate = async () => {
    setLoading(true);
    try {
      const wallet = await generateTronWallet();
      setGenerated(wallet); setModal("create");
    } catch { toast.error("Error generando wallet."); }
    finally { setLoading(false); }
  };

  const saveGenerated = async () => {
    if (!generated || !confirmed) return;
    const id = crypto.randomUUID();
    const n = name.trim() || `Mi Wallet ${wallets.length+1}`;
    setLoading(true);
    try {
      await encryptPrivateKey(id, generated.privateKey, undefined);
      addSavedWallet({ id, name:n, address:generated.address, type:"created", addedAt:Date.now() });
      toast.success(`Wallet "${n}" guardada de forma segura.`);
    } catch { toast.error("Error guardando wallet."); }
    finally { setLoading(false); }
  };

  // ── Import wallet ─────────────────────────────────────────────────────────
  const handleImport = async () => {
    setLoading(true);
    try {
      let result: TronWallet;
      if (importTab === "phrase") {
        const words = phrase.map(w=>w.trim().toLowerCase());
        if (words.some(w=>!w)) { toast.error("Completa las 12 palabras."); return; }
        result = await importFromMnemonic(words.join(" "));
      } else if (importTab === "privkey") {
        if (!privKey.trim()) { toast.error("Ingresa tu clave privada."); return; }
        result = await importFromPrivateKey(privKey.trim());
      } else {
        if (!ksJson.trim() || !ksPass) { toast.error("Ingresa el JSON y la contraseña."); return; }
        result = await importFromKeystore(ksJson.trim(), ksPass);
      }
      if (wallets.find(w=>w.address===result.address)) { toast.error("Esta wallet ya está guardada."); return; }
      const id = crypto.randomUUID();
      const n = name.trim() || `Importada ${wallets.length+1}`;
      await encryptPrivateKey(id, result.privateKey, undefined);
      addSavedWallet({ id, name:n, address:result.address, type:"imported", addedAt:Date.now() });
      toast.success(`Wallet "${n}" importada correctamente.`);
    } catch (e:any) { toast.error(e?.message||"Error importando wallet."); }
    finally { setLoading(false); }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  // When viewing wallet details, render the full-screen detail page
  if (detailWallet) {
    return (
      <WalletDetailSheet
        wallet={detailWallet}
        onClose={() => setDetailWallet(null)}
        onRename={name => renameWallet(detailWallet.id, name)}
        onNavigateSwap={onNavigateSwap}
      />
    );
  }

  return (
    <div style={{ background:BG, minHeight:"100vh" }} className="flex flex-col pb-28">

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-11 pb-5">
        <div>
          <h1 className="text-xl font-bold text-white">Wallets</h1>
          <p className="text-xs mt-0.5" style={{ color:"rgba(255,255,255,0.4)" }}>
            {wallets.length} dirección{wallets.length!==1?"es":""} guardada{wallets.length!==1?"s":""}
          </p>
        </div>
        <button onClick={() => setModal("watch")}
          className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{ background:GREEN, boxShadow:`0 0 16px ${GREEN}44` }}>
          <Plus className="h-4 w-4 text-black" />
        </button>
      </div>

      {/* Action grid */}
      <div className="px-4 grid grid-cols-3 gap-3 mb-6">
        {[
          { label:"Crear Wallet", icon:Sparkles, color:PURPLE, action:openCreate, key:"create" },
          { label:"Importar",     icon:Key,      color:BLUE,   action:()=>setModal("import"), key:"import" },
          { label:"Watch",        icon:Eye,      color:GREEN,  action:()=>setModal("watch"), key:"watch" },
        ].map(({ label, icon:Icon, color, action, key }) => (
          <button key={key} onClick={action} disabled={loading}
            className="flex flex-col items-center gap-2.5 rounded-2xl py-5 px-2 active:opacity-70"
            style={{ background:CARD, border:`1px solid ${BORDER}`, boxShadow:SHADOW, opacity:loading&&key==="create"?0.7:1 }}>
            <div className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background:`${color}18` }}>
              <Icon className={`h-5 w-5 ${loading&&key==="create"?"animate-pulse":""}`} style={{ color }} />
            </div>
            <span className="text-[11px] font-medium text-white text-center leading-tight">
              {loading && key==="create" ? "Generando..." : label}
            </span>
          </button>
        ))}
      </div>

      {/* Security notice if PIN not set */}
      {!isPinEnabled() && wallets.some(w=>w.type!=="watch") && (
        <div className="mx-4 mb-4 rounded-2xl p-3.5 flex items-start gap-3"
          style={{ background:`${AMBER}0C`, border:`1px solid ${AMBER}30` }}>
          <Lock className="h-4 w-4 mt-0.5 shrink-0" style={{ color:AMBER }} />
          <p className="text-[11px] leading-relaxed" style={{ color:"rgba(255,255,255,0.6)" }}>
            <span className="font-bold" style={{ color:AMBER }}>Recomendado:</span> Activa el PIN en Configuración para cifrar tus claves privadas con mayor seguridad.
          </p>
        </div>
      )}

      {/* Wallet list */}
      {wallets.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center px-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-full"
            style={{ background:CARD, border:`1px solid ${BORDER}` }}>
            <Wallet className="h-7 w-7" style={{ color:"rgba(255,255,255,0.2)" }} />
          </div>
          <p className="text-sm font-semibold text-white">Sin wallets guardadas</p>
          <p className="text-xs leading-relaxed" style={{ color:"rgba(255,255,255,0.35)" }}>
            Crea una nueva wallet, importa una existente o añade una dirección para monitoreo
          </p>
          <div className="flex gap-2 mt-2 flex-wrap justify-center">
            <button onClick={()=>setModal("watch")} className="rounded-full px-4 py-2.5 text-xs font-semibold"
              style={{ background:`${GREEN}18`, color:GREEN, border:`1px solid ${GREEN}30` }}>+ Watch</button>
            <button onClick={()=>setModal("import")} className="rounded-full px-4 py-2.5 text-xs font-semibold"
              style={{ background:`${BLUE}18`, color:BLUE, border:`1px solid ${BLUE}30` }}>Importar</button>
            <button onClick={openCreate} className="rounded-full px-4 py-2.5 text-xs font-bold text-black"
              style={{ background:GREEN }}>Crear Wallet</button>
          </div>
        </div>
      ) : (
        <div className="mx-4 rounded-2xl overflow-hidden"
          style={{ background:CARD, border:`1px solid ${BORDER}`, boxShadow:SHADOW }}>
          {wallets.map((w, i) => {
            const badge = typeBadge(w.type); const color = avatarColor(w.type);
            return (
              <div key={w.id} className="flex items-center gap-3 px-4 py-4 active:bg-white/[0.03] cursor-pointer transition-colors"
                style={{ borderBottom:i<wallets.length-1?`1px solid ${BORDER}`:"none" }}
                onClick={() => setDetailWallet(w)}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                  style={{ background:`${color}22`, color }}>
                  {w.name.slice(0,1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-white truncate max-w-[110px]">{w.name}</span>
                    <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase"
                      style={{ background:`${badge.color}20`, color:badge.color }}>{badge.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[11px] font-mono truncate" style={{ color:"rgba(255,255,255,0.38)" }}>{short(w.address)}</span>
                    <button onClick={e=>{e.stopPropagation();copyText(w.address,"Dirección");}}>
                      {copied===w.address?<CheckCheck className="h-3 w-3" style={{color:GREEN}}/>:<Copy className="h-3 w-3" style={{color:"rgba(255,255,255,0.25)"}}/>}
                    </button>
                  </div>
                  {coincashIds[w.address] ? (
                    <span className="text-[10px] font-mono mt-0.5" style={{ color:"rgba(25,195,125,0.75)" }}>
                      CoinCash ID: {coincashIds[w.address]}
                    </span>
                  ) : (
                    <span className="text-[10px] mt-0.5" style={{ color:"rgba(255,255,255,0.18)" }}>
                      CoinCash ID: …
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={e=>{e.stopPropagation();onScan(w.address);}} className="flex h-8 w-8 items-center justify-center rounded-xl active:opacity-60"
                    style={{ background:`${GREEN}18` }}>
                    <ScanSearch className="h-4 w-4" style={{color:GREEN}}/>
                  </button>
                  <button onClick={e=>{e.stopPropagation();remove(w.id);}} className="flex h-8 w-8 items-center justify-center rounded-xl active:opacity-60"
                    style={{ background:`${DANGER}15` }}>
                    <Trash2 className="h-4 w-4" style={{color:DANGER}}/>
                  </button>
                  <ChevronRight className="h-4 w-4 shrink-0" style={{color:"rgba(255,255,255,0.18)"}}/>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════════════════════════════════════════════
          SHEET — Watch Wallet
      ═══════════════════════════════════════════════ */}
      {modal === "watch" && (
        <BottomSheet onClose={closeModal}>
          <SheetHeader title="Watch Wallet" subtitle="Monitoreo de dirección · Solo lectura"
            icon={Eye} color={GREEN} onClose={closeModal} />
          <div className="px-6 pb-10">
            {/* Security info */}
            <div className="rounded-2xl p-3.5 mb-5 flex gap-3"
              style={{ background:`${GREEN}0A`, border:`1px solid ${GREEN}25` }}>
              <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" style={{color:GREEN}}/>
              <p className="text-[11px] leading-relaxed" style={{color:"rgba(255,255,255,0.6)"}}>
                <span className="font-semibold" style={{color:GREEN}}>Sin riesgo:</span> Solo registras la dirección pública. No se almacena ni solicita ninguna clave privada.
              </p>
            </div>
            <Field label="Nombre (opcional)">
              <StyledInput placeholder="Mi Watch Wallet" value={name} onChange={e=>setName(e.target.value)} />
            </Field>
            <Field label="Dirección TRON pública">
              <StyledInput placeholder="T..." value={address} onChange={e=>setAddress(e.target.value)} className="font-mono" />
            </Field>
            <div className="flex gap-3 mt-2 mb-8">
              <button onClick={closeModal} className="flex-1 rounded-2xl py-3.5 text-sm font-medium"
                style={{ border:`1px solid ${BORDER}`, color:"rgba(255,255,255,0.5)" }}>Cancelar</button>
              <ActionBtn label="Añadir Watch" color={GREEN} onClick={handleAddWatch} />
            </div>
          </div>
        </BottomSheet>
      )}

      {/* ═══════════════════════════════════════════════
          SHEET — Import Wallet
      ═══════════════════════════════════════════════ */}
      {modal === "import" && (
        <BottomSheet onClose={closeModal}>
          <SheetHeader title="Importar Wallet" subtitle="Recupera el acceso con tus credenciales"
            icon={Key} color={BLUE} onClose={closeModal} />
          <div className="px-6 pb-10">
            {/* No public-address notice */}
            <div className="rounded-2xl p-3 mb-4 flex gap-2.5"
              style={{background:`${BLUE}0A`,border:`1px solid ${BLUE}25`}}>
              <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{color:BLUE}}/>
              <p className="text-[11px] leading-relaxed" style={{color:"rgba(255,255,255,0.55)"}}>
                <span className="font-semibold" style={{color:BLUE}}>Solo importación con clave.</span> No se puede importar usando únicamente una dirección pública. La clave privada se cifra con AES-256 en tu dispositivo.
              </p>
            </div>
            {/* Tab bar */}
            <div className="flex gap-1 rounded-2xl p-1 mb-5"
              style={{ background:"rgba(255,255,255,0.04)", border:`1px solid ${BORDER}` }}>
              {([["phrase","Frase"],["privkey","Clave privada"],["keystore","Keystore"]] as [ImportTab,string][]).map(([t,l])=>(
                <button key={t} onClick={()=>setImportTab(t)}
                  className="flex-1 rounded-xl py-2 text-[11px] font-semibold transition-all"
                  style={{ background:importTab===t?BLUE:"transparent", color:importTab===t?"white":"rgba(255,255,255,0.4)" }}>
                  {l}
                </button>
              ))}
            </div>

            <Field label="Nombre de la wallet">
              <StyledInput placeholder="Importada 1" value={name} onChange={e=>setName(e.target.value)} />
            </Field>

            {/* ── Mnemonic phrase tab ── */}
            {importTab === "phrase" && (
              <>
                <label className="text-[11px] font-semibold uppercase tracking-wide mb-3 block"
                  style={{color:"rgba(255,255,255,0.4)"}}>12 palabras de recuperación</label>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {phrase.map((w, i) => (
                    <div key={i} className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px]"
                        style={{color:"rgba(255,255,255,0.25)"}}>{i+1}.</span>
                      <input
                        value={w}
                        onChange={e=>{const p=[...phrase];p[i]=e.target.value.trim();setPhrase(p);}}
                        className="w-full rounded-xl pl-7 pr-2 py-2.5 text-xs text-white outline-none font-mono"
                        style={{background:"rgba(255,255,255,0.05)",border:`1px solid ${BORDER}`}}
                      />
                    </div>
                  ))}
                </div>
                <div className="rounded-2xl p-3 mb-4 flex gap-2.5"
                  style={{background:`${AMBER}0A`,border:`1px solid ${AMBER}25`}}>
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{color:AMBER}}/>
                  <p className="text-[11px] leading-snug" style={{color:"rgba(255,255,255,0.5)"}}>
                    Nunca compartas tu frase de recuperación. CoinCash jamás te la pedirá.
                  </p>
                </div>
              </>
            )}

            {/* ── Private key tab ── */}
            {importTab === "privkey" && (
              <>
                <Field label="Clave privada (64 hex)">
                  <StyledInput type="password" placeholder="0x... o hex sin prefijo"
                    value={privKey} onChange={e=>setPrivKey(e.target.value)} className="font-mono" />
                </Field>
                <div className="rounded-2xl p-3 mb-4 flex gap-2.5"
                  style={{background:`${DANGER}0A`,border:`1px solid ${DANGER}25`}}>
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{color:DANGER}}/>
                  <p className="text-[11px] leading-snug" style={{color:"rgba(255,255,255,0.5)"}}>
                    Tu clave privada se almacenará cifrada con AES-256-GCM en tu dispositivo.
                  </p>
                </div>
              </>
            )}

            {/* ── Keystore tab ── */}
            {importTab === "keystore" && (
              <>
                <Field label="Keystore JSON">
                  <textarea value={ksJson} onChange={e=>setKsJson(e.target.value)}
                    placeholder='{"version":3,"crypto":{...}}'
                    rows={5} className="w-full rounded-2xl px-4 py-3 text-xs text-white outline-none font-mono"
                    style={{background:"rgba(255,255,255,0.05)",border:`1px solid ${BORDER}`,resize:"none"}} />
                </Field>
                <Field label="Contraseña del Keystore">
                  <StyledInput type="password" placeholder="Contraseña"
                    value={ksPass} onChange={e=>setKsPass(e.target.value)} />
                </Field>
              </>
            )}

            <div className="flex gap-3 mt-2 mb-8">
              <button onClick={closeModal} className="flex-1 rounded-2xl py-3.5 text-sm font-medium"
                style={{border:`1px solid ${BORDER}`,color:"rgba(255,255,255,0.5)"}}>Cancelar</button>
              <ActionBtn label={loading?"Importando...":"Importar Wallet"} color={BLUE}
                onClick={handleImport} disabled={loading} />
            </div>
          </div>
        </BottomSheet>
      )}

      {/* ═══════════════════════════════════════════════
          SHEET — Create Wallet
      ═══════════════════════════════════════════════ */}
      {modal === "create" && generated && (
        <BottomSheet onClose={closeModal}>
          <SheetHeader title="Nueva Wallet TRON" subtitle="Generada en tu dispositivo · Nunca sale de aquí"
            icon={Sparkles} color={PURPLE} onClose={closeModal} />
          <div className="px-6 pb-10">
            {/* Backup warning */}
            <div className="rounded-2xl p-4 mb-3 flex gap-3" style={{background:`${DANGER}10`,border:`1px solid ${DANGER}35`}}>
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" style={{color:DANGER}}/>
              <div>
                <p className="text-xs font-bold mb-1" style={{color:DANGER}}>⚠ Advertencia de seguridad</p>
                <p className="text-[11px] leading-relaxed" style={{color:"rgba(255,255,255,0.7)"}}>
                  Guarda tu frase de recuperación en un lugar seguro. Si se pierde, tu wallet no podrá ser recuperada.
                </p>
              </div>
            </div>

            {/* Never stored notice */}
            <div className="rounded-2xl p-3 mb-4 flex gap-2.5" style={{background:`${PURPLE}0A`,border:`1px solid ${PURPLE}25`}}>
              <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{color:PURPLE}}/>
              <p className="text-[11px] leading-relaxed" style={{color:"rgba(255,255,255,0.55)"}}>
                <span className="font-semibold" style={{color:PURPLE}}>La frase de recuperación nunca se almacena.</span> Solo se muestra aquí para que la copies. La clave privada se cifra con AES-256 antes de guardarse en tu dispositivo.
              </p>
            </div>

            {/* Name */}
            <Field label="Nombre de la wallet">
              <StyledInput placeholder={`Mi Wallet ${wallets.length+1}`} value={name} onChange={e=>setName(e.target.value)} />
            </Field>

            {/* Address */}
            <div className="rounded-2xl p-4 mb-3" style={{background:`${GREEN}0C`,border:`1px solid ${GREEN}25`}}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5" style={{color:GREEN}}/>
                  <span className="text-xs font-semibold" style={{color:GREEN}}>Dirección pública</span>
                </div>
                <button onClick={()=>copyText(generated.address,"Dirección")}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium"
                  style={{background:`${GREEN}18`,color:GREEN}}>
                  {copied===generated.address?<CheckCheck className="h-3 w-3"/>:<Copy className="h-3 w-3"/>} Copiar
                </button>
              </div>
              <p className="text-xs font-mono break-all" style={{color:"rgba(255,255,255,0.8)"}}>{generated.address}</p>
            </div>

            {/* Private key */}
            <div className="rounded-2xl p-4 mb-3" style={{background:`${DANGER}0A`,border:`1px solid ${DANGER}30`}}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Key className="h-3.5 w-3.5" style={{color:DANGER}}/>
                  <span className="text-xs font-semibold" style={{color:DANGER}}>Clave privada</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={()=>setShowKey(v=>!v)} className="text-[10px] font-medium rounded-lg px-2 py-1"
                    style={{background:`${DANGER}18`,color:DANGER}}>{showKey?"Ocultar":"Mostrar"}</button>
                  <button onClick={()=>copyText(generated.privateKey,"Clave privada")}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium"
                    style={{background:`${DANGER}18`,color:DANGER}}>
                    {copied===generated.privateKey?<CheckCheck className="h-3 w-3"/>:<Copy className="h-3 w-3"/>} Copiar
                  </button>
                </div>
              </div>
              <p className="text-xs font-mono break-all"
                style={{color:"rgba(255,255,255,0.7)",filter:showKey?"none":"blur(5px)",userSelect:showKey?"text":"none",transition:"filter 0.2s"}}>
                {generated.privateKey}
              </p>
            </div>

            {/* Recovery phrase */}
            {generated.mnemonic && (
              <div className="rounded-2xl p-4 mb-5" style={{background:`${PURPLE}0A`,border:`1px solid ${PURPLE}30`}}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5" style={{color:PURPLE}}/>
                    <span className="text-xs font-semibold" style={{color:PURPLE}}>Frase de recuperación (12 palabras)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={()=>setShowPhrase(v=>!v)} className="text-[10px] font-medium rounded-lg px-2 py-1"
                      style={{background:`${PURPLE}18`,color:PURPLE}}>{showPhrase?"Ocultar":"Mostrar"}</button>
                    <button onClick={()=>copyText(generated.mnemonic!,"Frase de recuperación")}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium"
                      style={{background:`${PURPLE}18`,color:PURPLE}}>
                      {copied===generated.mnemonic?<CheckCheck className="h-3 w-3"/>:<Copy className="h-3 w-3"/>} Copiar
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2"
                  style={{filter:showPhrase?"none":"blur(6px)",userSelect:showPhrase?"text":"none",transition:"filter 0.2s"}}>
                  {generated.mnemonic.split(" ").map((word, i) => (
                    <div key={i} className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5"
                      style={{background:"rgba(255,255,255,0.04)"}}>
                      <span className="text-[9px]" style={{color:"rgba(255,255,255,0.25)"}}>{i+1}.</span>
                      <span className="text-xs font-mono text-white">{word}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Confirmation checkbox */}
            <label className="flex items-start gap-3 mb-5 cursor-pointer" onClick={()=>setConfirmed(v=>!v)}>
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
                style={{background:confirmed?GREEN:"rgba(255,255,255,0.07)",border:`1px solid ${confirmed?GREEN:BORDER}`}}>
                {confirmed && <CheckCheck className="h-3 w-3 text-black"/>}
              </div>
              <span className="text-xs leading-relaxed" style={{color:"rgba(255,255,255,0.6)"}}>
                He guardado mi frase de recuperación y clave privada de forma segura. Entiendo que no podré recuperarlos si los pierdo.
              </span>
            </label>

            <div className="flex gap-3 mb-8">
              <button onClick={closeModal} className="flex-1 rounded-2xl py-3.5 text-sm font-medium"
                style={{border:`1px solid ${BORDER}`,color:"rgba(255,255,255,0.5)"}}>Cancelar</button>
              <ActionBtn label={loading?"Guardando...":"Guardar Wallet"} color={GREEN}
                onClick={saveGenerated} disabled={!confirmed||loading} />
            </div>
          </div>
        </BottomSheet>
      )}

    </div>
  );
}
