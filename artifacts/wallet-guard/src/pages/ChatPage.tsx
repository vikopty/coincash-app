// @ts-nocheck
import { useState, useRef, useEffect } from "react";
import {
  Send, MessageCircle, QrCode, UserPlus,
  ChevronLeft, Copy, CheckCheck, X,
} from "lucide-react";
import QRCode from "qrcode";
import { Html5Qrcode } from "html5-qrcode";
import { toast } from "sonner";

const API          = "/api-server/api";
const SUPPORT_ID   = "CC-SUPPORT";
const GREEN        = "#19C37D";
const CC_RE        = /^CC-\d{6}$/;
const CC_QR_EL     = "wg-chat-cc-scanner";
const CONTACTS_KEY = "wg_chat_contacts";
const CC_ID_KEY    = "wg_coincash_id";   // persisted CC-ID (independent of wallet)
const DEVICE_KEY   = "wg_device_id";     // stable device identifier for wallet-free users

/** Return or create a stable device identifier stored in localStorage. */
function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    // Use crypto.randomUUID when available, otherwise Math.random fallback
    id = typeof crypto !== "undefined" && crypto.randomUUID
      ? "dev-" + crypto.randomUUID().replace(/-/g, "")
      : "dev-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface WalletEntry { address: string; name?: string; }
interface Contact     { ccId: string; name: string; addedAt: string; }
interface ChatMsg {
  id: number;
  senderCcId: string;
  receiverCcId: string;
  message: string;
  timestamp: Date | string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (ts: Date | string) =>
  new Date(ts).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });

function loadContacts(): Contact[] {
  try { return JSON.parse(localStorage.getItem(CONTACTS_KEY) || "[]"); }
  catch { return []; }
}
function saveContactsLS(c: Contact[]) {
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(c));
}

// ── Inline CoinCash QR Scanner (no TRON filter) ───────────────────────────────
// Accepts coincash://user/CC-XXXXXX  OR  plain CC-XXXXXX
interface CcScannerProps { active: boolean; onScan: (ccId: string) => void; }

function CoinCashScanner({ active, onScan }: CcScannerProps) {
  const scannerRef  = useRef<Html5Qrcode | null>(null);
  const detectedRef = useRef(false);

  useEffect(() => {
    if (!active) {
      scannerRef.current?.stop().catch(() => {});
      scannerRef.current = null;
      detectedRef.current = false;
      return;
    }
    detectedRef.current = false;

    const el = document.getElementById(CC_QR_EL);
    if (!el) return;

    const scanner = new Html5Qrcode(CC_QR_EL, { verbose: false });
    scannerRef.current = scanner;

    Html5Qrcode.getCameras()
      .then(cameras => {
        if (!cameras.length) { toast.error("No se encontró cámara"); return; }
        const cam = cameras[cameras.length - 1]; // prefer back cam
        return scanner.start(
          cam.id,
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (raw) => {
            if (detectedRef.current) return;
            const match = raw.match(/(?:coincash:\/\/user\/)?(CC-\d{6})$/i);
            if (!match) return;
            detectedRef.current = true;
            scanner.stop().catch(() => {});
            onScan(match[1].toUpperCase());
          },
          () => {},
        );
      })
      .catch(() => toast.error("No se pudo acceder a la cámara"));

    return () => { scanner.stop().catch(() => {}); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div style={{ width: "100%", borderRadius: "14px", overflow: "hidden", background: "#111827", minHeight: "240px" }}>
      <div id={CC_QR_EL} style={{ width: "100%" }} />
    </div>
  );
}

// ── Contact list item (module-level to avoid re-definition on every render) ───
interface ContactItemProps {
  contact: Contact;
  isSupport?: boolean;
  onClick: () => void;
}
function ContactItem({ contact, isSupport = false, onClick }: ContactItemProps) {
  const initials = isSupport ? "S" : contact.ccId.slice(-2);
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: "14px",
        padding: "13px 16px", background: "transparent", border: "none",
        borderBottom: "1px solid rgba(255,255,255,0.05)", cursor: "pointer",
        textAlign: "left",
      }}
    >
      <div style={{
        width: "44px", height: "44px", borderRadius: "50%", flexShrink: 0,
        background: isSupport ? `${GREEN}1a` : "rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "15px", fontWeight: 700,
        color: isSupport ? GREEN : "rgba(255,255,255,0.65)",
        border: `1px solid ${isSupport ? `${GREEN}40` : "rgba(255,255,255,0.1)"}`,
      }}>
        {initials}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: "#fff", fontSize: "14px", fontWeight: 600, marginBottom: "2px" }}>
          {isSupport ? "Soporte CoinCash" : contact.name}
        </div>
        <div style={{ color: "rgba(255,255,255,0.38)", fontSize: "11px", fontFamily: "monospace" }}>
          {contact.ccId}
        </div>
      </div>
      {isSupport && (
        <span style={{
          fontSize: "9px", fontWeight: 700, padding: "2px 8px", borderRadius: "10px",
          background: `${GREEN}18`, color: GREEN, border: `1px solid ${GREEN}35`, flexShrink: 0,
        }}>
          EN LÍNEA
        </span>
      )}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface ChatPageProps { wallets?: WalletEntry[]; }

const ChatPage = ({ wallets = [] }: ChatPageProps) => {
  // Identity — read saved CC-ID synchronously on first render to avoid loading flash
  const [myCcId,    setMyCcId]    = useState<string | null>(() => {
    const saved = localStorage.getItem(CC_ID_KEY);
    return saved && CC_RE.test(saved) ? saved : null;
  });
  const [ccLoading, setCcLoading] = useState<boolean>(() => {
    const saved = localStorage.getItem(CC_ID_KEY);
    return !saved || !CC_RE.test(saved); // only show loading on very first open
  });
  // Contacts
  const [contacts,  setContacts]  = useState<Contact[]>(loadContacts);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  // Chat
  const [messages,  setMessages]  = useState<ChatMsg[]>([]);
  const [input,     setInput]     = useState("");
  const [sending,   setSending]   = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  // My QR modal
  const [showMyQr,  setShowMyQr]  = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copiedId,  setCopiedId]  = useState(false);
  // Add Contact modal
  const [showAdd,   setShowAdd]   = useState(false);
  const [addTab,    setAddTab]    = useState<"manual" | "scan">("manual");
  const [addInput,  setAddInput]  = useState("");
  const [addLoading,setAddLoading]= useState(false);
  const [addError,  setAddError]  = useState("");

  // ── CoinCash ID init — fully local, runs once on mount ──────────────────────
  // 1. Read from localStorage (instant)
  // 2. If missing, generate locally and save (never blocks on backend)
  // 3. Fire-and-forget backend sync so the ID is persisted in the DB too
  useEffect(() => {
    // Read or generate locally — synchronous, always succeeds
    let ccId = localStorage.getItem(CC_ID_KEY);
    if (!ccId || !CC_RE.test(ccId)) {
      const digits = Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
      ccId = `CC-${digits}`;
      localStorage.setItem(CC_ID_KEY, ccId);
    }

    // Activate the chat immediately — no API dependency
    setMyCcId(ccId);
    setCcLoading(false);

    // Background sync to DB (fire-and-forget — failure is non-fatal)
    const identifier = (() => {
      if (wallets.length > 0) return wallets[0].address;
      try {
        const stored: WalletEntry[] = JSON.parse(localStorage.getItem("wg_wallets") || "[]");
        if (stored[0]?.address) return stored[0].address;
      } catch { /* ignore */ }
      return getOrCreateDeviceId();
    })();
    fetch(`${API}/users/lookup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: identifier }),
    }).catch(() => { /* backend unavailable — chat still works */ });
  }, []); // Run once on mount

  // ── Generate QR for my CC-ID ────────────────────────────────────────────────
  useEffect(() => {
    if (!myCcId) return;
    QRCode.toDataURL(`coincash://user/${myCcId}`, {
      width: 240, margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    }).then(setQrDataUrl).catch(console.error);
  }, [myCcId]);

  // ── Load conversation when switching contacts ───────────────────────────────
  useEffect(() => {
    if (!myCcId || !activeContact) { setMessages([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const res  = await fetch(`${API}/chat/messages?user=${myCcId}&peer=${activeContact.ccId}`);
        const data = await res.json();
        if (cancelled) return;
        if (Array.isArray(data.messages)) {
          if (data.messages.length === 0 && activeContact.ccId === SUPPORT_ID) {
            setMessages([{
              id: 0, senderCcId: SUPPORT_ID, receiverCcId: myCcId,
              message: "Bienvenido al Chat Privado de CoinCash. ¿En qué podemos ayudarte?",
              timestamp: new Date(),
            }]);
          } else {
            setMessages(data.messages);
          }
        }
      } catch (e) { console.error("[chat] loadConversation:", e); }
    })();
    return () => { cancelled = true; };
  }, [myCcId, activeContact?.ccId]);

  // ── Auto-scroll ─────────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Send message ────────────────────────────────────────────────────────────
  async function send() {
    const text = input.trim();
    if (!text || !myCcId || !activeContact || sending) return;
    setSending(true);
    setInput("");
    const optimistic: ChatMsg = {
      id: Date.now(), senderCcId: myCcId,
      receiverCcId: activeContact.ccId,
      message: text, timestamp: new Date(),
    };
    setMessages(prev => [...prev, optimistic]);
    try {
      const res  = await fetch(`${API}/chat/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderCcId:   myCcId,
          receiverCcId: activeContact.ccId,
          message:      text,
        }),
      });
      const data = await res.json();
      if (data.reply) {
        setMessages(prev => [...prev, { ...data.reply, timestamp: new Date(data.reply.timestamp) }]);
      }
    } catch (e) { console.error("[chat] send:", e); }
    finally { setSending(false); }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  // ── Copy CC-ID ──────────────────────────────────────────────────────────────
  function copyMyCcId() {
    if (!myCcId) return;
    navigator.clipboard.writeText(myCcId).then(() => {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    });
  }

  // ── Add contact helpers ─────────────────────────────────────────────────────
  function persistContact(c: Contact) {
    const updated = [...contacts, c];
    setContacts(updated);
    saveContactsLS(updated);
  }

  async function validateAndAdd(rawCcId: string): Promise<boolean> {
    const ccId = rawCcId.trim().toUpperCase();
    if (!CC_RE.test(ccId)) { setAddError("Formato inválido. Usa CC-XXXXXX"); return false; }
    if (ccId === myCcId)   { setAddError("No puedes agregarte a ti mismo"); return false; }
    if (contacts.some(c => c.ccId === ccId)) { setAddError("Contacto ya existe"); return false; }
    setAddLoading(true); setAddError("");
    try {
      const res = await fetch(`${API}/users/${ccId}`);
      if (res.status === 404) { setAddError("CoinCash ID no encontrado"); return false; }
      if (!res.ok)            { setAddError("Error al verificar el ID"); return false; }
      const data = await res.json();
      persistContact({ ccId: data.coincashId, name: data.coincashId, addedAt: new Date().toISOString() });
      return true;
    } catch { setAddError("Error de conexión"); return false; }
    finally { setAddLoading(false); }
  }

  async function addContactManual() {
    const ok = await validateAndAdd(addInput);
    if (ok) { setAddInput(""); setShowAdd(false); toast.success("Contacto agregado"); }
  }

  function handleScannedCcId(ccId: string) {
    setShowAdd(false);
    // small delay so the modal close animation plays before async work
    setTimeout(async () => {
      if (contacts.some(c => c.ccId === ccId)) { toast.info("Contacto ya existe"); return; }
      if (ccId === myCcId) { toast.error("No puedes agregarte a ti mismo"); return; }
      try {
        const res = await fetch(`${API}/users/${ccId}`);
        if (!res.ok) { toast.error("CoinCash ID no encontrado"); return; }
        const data = await res.json();
        persistContact({ ccId: data.coincashId, name: data.coincashId, addedAt: new Date().toISOString() });
        toast.success(`Contacto ${data.coincashId} agregado`);
      } catch { toast.error("Error de conexión"); }
    }, 300);
  }

  function openAddModal() {
    setShowAdd(true);
    setAddTab("manual");
    setAddInput("");
    setAddError("");
  }

  const canSend = !!myCcId && !!activeContact && !ccLoading;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "100dvh", background: "#0B0F14", paddingBottom: "64px",
    }}>
      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, padding: "52px 16px 14px",
        background: "#0e1520", borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* Back button (conversation → contacts) */}
          {activeContact && (
            <button
              onClick={() => { setActiveContact(null); setMessages([]); }}
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: "4px", color: "rgba(255,255,255,0.6)", display: "flex",
              }}
            >
              <ChevronLeft size={22} />
            </button>
          )}

          {/* Title + subtitle */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ color: "#fff", fontSize: "17px", fontWeight: 700, margin: 0 }}>
              {activeContact
                ? (activeContact.ccId === SUPPORT_ID ? "Soporte CoinCash" : activeContact.name)
                : "Chat Privado"}
            </h1>
            <div style={{ marginTop: "2px" }}>
              {ccLoading ? (
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "11px" }}>Cargando ID…</span>
              ) : myCcId ? (
                <span style={{ color: "rgba(255,255,255,0.38)", fontSize: "11px", fontFamily: "monospace" }}>
                  {myCcId}
                </span>
              ) : (
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "11px" }}>Sin wallet</span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          {myCcId && (
            <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
              {!activeContact && (
                <button
                  onClick={openAddModal}
                  title="Agregar contacto"
                  style={{
                    width: "36px", height: "36px", borderRadius: "10px",
                    background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <UserPlus size={17} color="rgba(255,255,255,0.7)" />
                </button>
              )}
              <button
                onClick={() => setShowMyQr(true)}
                title="Ver mi QR"
                style={{
                  width: "36px", height: "36px", borderRadius: "10px",
                  background: `${GREEN}18`, border: `1px solid ${GREEN}35`,
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <QrCode size={17} color={GREEN} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ─── Loading / generating ID state ──────────────────────────────────── */}
      {ccLoading && (
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: "14px", padding: "32px",
        }}>
          <div style={{
            width: "48px", height: "48px", borderRadius: "50%",
            border: `3px solid ${GREEN}30`, borderTopColor: GREEN,
            animation: "spin 0.8s linear infinite",
          }} />
          <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "13px", textAlign: "center", margin: 0 }}>
            Generando tu CoinCash ID…
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* ─── Error state (CC-ID could not be generated) ──────────────────────── */}
      {!ccLoading && !myCcId && (
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: "12px", padding: "24px",
        }}>
          <MessageCircle size={48} color="rgba(255,255,255,0.15)" />
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "14px", textAlign: "center", margin: 0 }}>
            No se pudo generar tu CoinCash ID. Verifica tu conexión e intenta de nuevo.
          </p>
        </div>
      )}

      {/* ─── Contacts list ───────────────────────────────────────────────────── */}
      {myCcId && !activeContact && (
        <div style={{ flex: 1, overflowY: "auto" }}>

          {/* CC-ID profile card */}
          <div style={{
            margin: "14px 14px 4px",
            background: "linear-gradient(135deg, rgba(25,195,125,0.10) 0%, rgba(25,195,125,0.04) 100%)",
            border: `1px solid ${GREEN}30`,
            borderRadius: "16px", padding: "14px 16px",
            display: "flex", alignItems: "center", gap: "12px",
          }}>
            <div style={{
              width: "40px", height: "40px", borderRadius: "50%", flexShrink: 0,
              background: `${GREEN}18`, border: `1.5px solid ${GREEN}50`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "18px",
            }}>
              🪪
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "11px", marginBottom: "3px" }}>
                Tu CoinCash ID
              </div>
              <div style={{
                color: GREEN, fontSize: "17px", fontWeight: 700,
                fontFamily: "monospace", letterSpacing: "1.5px",
              }}>
                {myCcId}
              </div>
            </div>
            <button
              onClick={copyMyCcId}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "6px", color: GREEN, display: "flex", flexShrink: 0 }}
            >
              {copiedId ? <CheckCheck size={17} /> : <Copy size={17} />}
            </button>
          </div>

          {/* Pinned: Support */}
          <ContactItem
            contact={{ ccId: SUPPORT_ID, name: "Soporte CoinCash", addedAt: "" }}
            isSupport
            onClick={() => setActiveContact({ ccId: SUPPORT_ID, name: "Soporte CoinCash", addedAt: "" })}
          />
          {/* User contacts */}
          {contacts.map(c => (
            <ContactItem key={c.ccId} contact={c} onClick={() => setActiveContact(c)} />
          ))}
          {contacts.length === 0 && (
            <p style={{
              padding: "24px 24px 32px", color: "rgba(255,255,255,0.22)",
              fontSize: "13px", textAlign: "center", margin: 0,
            }}>
              No tienes contactos aún. Usa el botón + para agregar uno.
            </p>
          )}
        </div>
      )}

      {/* ─── Conversation view ───────────────────────────────────────────────── */}
      {myCcId && activeContact && (
        <>
          <div style={{
            flex: 1, overflowY: "auto",
            padding: "16px 16px 8px",
            display: "flex", flexDirection: "column", gap: "10px",
          }}>
            {messages.map((msg, idx) => {
              const isMe  = msg.senderCcId === myCcId;
              const label = isMe ? msg.senderCcId : msg.senderCcId;
              return (
                <div
                  key={msg.id || idx}
                  style={{ display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start" }}
                >
                  <span style={{
                    fontSize: "10px", fontFamily: "monospace",
                    color: isMe ? "rgba(25,195,125,0.7)" : "rgba(255,255,255,0.3)",
                    marginBottom: "3px",
                    marginLeft: isMe ? 0 : "4px",
                    marginRight: isMe ? "4px" : 0,
                  }}>
                    {label}
                  </span>
                  <div style={{
                    maxWidth: "78%", padding: "10px 13px",
                    borderRadius: isMe ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                    background: isMe ? GREEN : "#1a2332",
                    color: isMe ? "#000" : "rgba(255,255,255,0.88)",
                    fontSize: "14px", lineHeight: "1.5", wordBreak: "break-word",
                  }}>
                    {msg.message}
                  </div>
                  <span style={{
                    fontSize: "10px", color: "rgba(255,255,255,0.25)", marginTop: "3px",
                    marginLeft: isMe ? 0 : "4px", marginRight: isMe ? "4px" : 0,
                  }}>
                    {fmt(msg.timestamp)}
                  </span>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div style={{
            flexShrink: 0, display: "flex", alignItems: "center", gap: "10px",
            padding: "10px 14px", background: "#0e1520",
            borderTop: "1px solid rgba(255,255,255,0.07)",
          }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={!canSend}
              placeholder={canSend ? "Escribe un mensaje…" : "Cargando…"}
              style={{
                flex: 1, background: "#1a2332",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: "22px", padding: "10px 16px",
                color: canSend ? "#fff" : "rgba(255,255,255,0.3)",
                fontSize: "14px", outline: "none",
              }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || !canSend || sending}
              style={{
                flexShrink: 0, width: "42px", height: "42px", borderRadius: "50%",
                background: (input.trim() && canSend) ? GREEN : "rgba(255,255,255,0.08)",
                border: "none", display: "flex", alignItems: "center", justifyContent: "center",
                cursor: (input.trim() && canSend) ? "pointer" : "default",
                transition: "background 0.15s",
              }}
            >
              <Send size={17} color={(input.trim() && canSend) ? "#000" : "rgba(255,255,255,0.3)"} />
            </button>
          </div>
        </>
      )}

      {/* ─── My QR Modal ─────────────────────────────────────────────────────── */}
      {showMyQr && myCcId && (
        <div
          onClick={() => setShowMyQr(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100,
            display: "flex", alignItems: "center", justifyContent: "center", padding: "24px",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "#0e1520", borderRadius: "22px", padding: "28px 24px",
              width: "100%", maxWidth: "320px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: "18px",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
              <h2 style={{ color: "#fff", fontSize: "16px", fontWeight: 700, margin: 0 }}>
                Mi CoinCash ID
              </h2>
              <button
                onClick={() => setShowMyQr(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.5)", padding: "4px", display: "flex" }}
              >
                <X size={20} />
              </button>
            </div>

            {/* QR image */}
            {qrDataUrl ? (
              <div style={{ background: "#fff", padding: "14px", borderRadius: "18px" }}>
                <img src={qrDataUrl} alt="QR CoinCash" width={200} height={200} />
              </div>
            ) : (
              <div style={{
                width: 228, height: 228, background: "rgba(255,255,255,0.05)",
                borderRadius: "18px", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "12px" }}>Generando…</span>
              </div>
            )}

            {/* CC-ID + copy */}
            <div style={{
              background: `${GREEN}0d`, border: `1px solid ${GREEN}30`,
              borderRadius: "14px", padding: "12px 16px",
              display: "flex", alignItems: "center", gap: "12px",
              width: "100%", boxSizing: "border-box",
            }}>
              <span style={{
                flex: 1, color: GREEN, fontSize: "18px", fontWeight: 700,
                fontFamily: "monospace", letterSpacing: "2px",
              }}>
                {myCcId}
              </span>
              <button
                onClick={copyMyCcId}
                style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: GREEN, display: "flex" }}
              >
                {copiedId ? <CheckCheck size={18} /> : <Copy size={18} />}
              </button>
            </div>

            <p style={{ color: "rgba(255,255,255,0.32)", fontSize: "11px", textAlign: "center", margin: 0, lineHeight: "1.6" }}>
              Comparte este QR o tu ID para que otros puedan encontrarte en CoinCash
            </p>
          </div>
        </div>
      )}

      {/* ─── Add Contact Modal ────────────────────────────────────────────────── */}
      {showAdd && myCcId && (
        <div
          onClick={() => setShowAdd(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100,
            display: "flex", alignItems: "flex-end", justifyContent: "center",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "#0e1520", borderRadius: "24px 24px 0 0",
              padding: "24px 20px 0", width: "100%", maxWidth: "480px",
              border: "1px solid rgba(255,255,255,0.1)", borderBottom: "none",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <h2 style={{ color: "#fff", fontSize: "16px", fontWeight: 700, margin: 0 }}>
                Agregar Contacto
              </h2>
              <button
                onClick={() => setShowAdd(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.5)", padding: "4px", display: "flex" }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Tab switcher */}
            <div style={{
              display: "flex", background: "rgba(255,255,255,0.05)",
              borderRadius: "12px", padding: "3px", marginBottom: "20px",
            }}>
              {(["manual", "scan"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => { setAddTab(t); setAddError(""); }}
                  style={{
                    flex: 1, padding: "9px", borderRadius: "10px", border: "none",
                    cursor: "pointer", fontSize: "13px", fontWeight: 600,
                    transition: "all 0.15s",
                    background: addTab === t ? GREEN : "transparent",
                    color: addTab === t ? "#000" : "rgba(255,255,255,0.5)",
                  }}
                >
                  {t === "manual" ? "Ingresar ID" : "Escanear QR"}
                </button>
              ))}
            </div>

            {/* Manual tab */}
            {addTab === "manual" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", paddingBottom: "24px" }}>
                <input
                  value={addInput}
                  onChange={e => { setAddInput(e.target.value.toUpperCase()); setAddError(""); }}
                  placeholder="CC-XXXXXX"
                  maxLength={9}
                  style={{
                    background: "#1a2332",
                    border: `1px solid ${addError ? "#f87171" : "rgba(255,255,255,0.1)"}`,
                    borderRadius: "14px", padding: "14px 16px",
                    color: "#fff", fontSize: "18px",
                    fontFamily: "monospace", letterSpacing: "2px",
                    outline: "none", width: "100%", boxSizing: "border-box",
                  }}
                />
                {addError && (
                  <p style={{ color: "#f87171", fontSize: "12px", margin: 0 }}>{addError}</p>
                )}
                <button
                  onClick={addContactManual}
                  disabled={addLoading}
                  style={{
                    background: GREEN, border: "none", borderRadius: "14px",
                    padding: "14px", color: "#000", fontSize: "14px", fontWeight: 700,
                    cursor: addLoading ? "wait" : "pointer",
                    opacity: addLoading ? 0.7 : 1,
                  }}
                >
                  {addLoading ? "Verificando…" : "Agregar Contacto"}
                </button>
              </div>
            )}

            {/* Scan tab */}
            {addTab === "scan" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", paddingBottom: "24px" }}>
                <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "12px", margin: 0, textAlign: "center" }}>
                  Enfoca el código QR de CoinCash del contacto
                </p>
                <CoinCashScanner
                  active={addTab === "scan" && showAdd}
                  onScan={handleScannedCcId}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatPage;
