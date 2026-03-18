import { useState, useEffect, useRef, useCallback } from "react";
import { useChatSocket } from "@/hooks/useChatSocket";
import { API_BASE } from "@/lib/apiConfig";

// ── Media helpers ─────────────────────────────────────────────────────────────
const IMG_PREFIX  = "[MEDIA_IMG:";
const FILE_PREFIX = "[MEDIA_FILE:";
const API_STATIC  = API_BASE;

function isMediaMsg(text: string) {
  return text.startsWith(IMG_PREFIX) || text.startsWith(FILE_PREFIX);
}

function AdminMediaBubble({ message }: { message: string }) {
  if (message.startsWith(IMG_PREFIX)) {
    const objectPath = message.slice(IMG_PREFIX.length, -1);
    return (
      <img
        src={`${API_STATIC}/storage${objectPath}`}
        alt="imagen"
        style={{ maxWidth: 220, maxHeight: 200, borderRadius: 10, display: "block" }}
        onError={(e) => { (e.target as HTMLImageElement).alt = "No se pudo cargar"; }}
      />
    );
  }
  if (message.startsWith(FILE_PREFIX)) {
    const parts      = message.slice(FILE_PREFIX.length, -1).split(":");
    const objectPath = parts[0];
    const filename   = parts[1] ?? "archivo";
    return (
      <a
        href={`${API_STATIC}/storage${objectPath}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: "#00FFC6", fontSize: 13, textDecoration: "underline" }}
      >
        📎 {filename}
      </a>
    );
  }
  return null;
}

const ADMIN_CC_ID = "CC-801286";
const SUPPORT_ID  = "CC-SUPPORT";
const API         = API_BASE;

interface ConvSummary {
  userId:      string;
  lastMessage: string;
  lastTime:    string;
  lastSender:  string;
}

interface ChatMessage {
  id:           number;
  senderCcId:   string;
  receiverCcId: string;
  message:      string;
  timestamp:    string;
}

function timeStr(ts: string) {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

interface CountryRecord { name: string; code: string; count: number; }
interface VisitStats   { total: number; countries: CountryRecord[]; }
interface ScanStats    { total: number; today: number; byCountry: { name: string; code: string; count: number }[]; recent: { id: number; wallet: string; country: string; country_code: string; scanned_at: string }[]; }

const SCAN_KEY = "CoinCashAdmin2026";

function flagEmoji(code: string) {
  if (!code || code === "xx") return "🌐";
  return code.toUpperCase().replace(/./g, ch => String.fromCodePoint(ch.charCodeAt(0) + 127397));
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

export default function AdminPage() {
  const [conversations, setConversations] = useState<ConvSummary[]>([]);
  const [selectedUser, setSelectedUser]   = useState<string | null>(null);
  const [convMessages, setConvMessages]   = useState<ChatMessage[]>([]);
  const [input, setInput]                 = useState("");
  const [loadingConv, setLoadingConv]     = useState(false);
  const [unreadUsers, setUnreadUsers]     = useState<Set<string>>(new Set());
  const [adminTab, setAdminTab]           = useState<"mensajes" | "visitantes" | "scans">("mensajes");
  const [visitStats, setVisitStats]       = useState<VisitStats>({ total: 0, countries: [] });
  const [scanStats,  setScanStats]        = useState<ScanStats | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Visitor stats polling ─────────────────────────────────────────────────
  const fetchVisitStats = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/visit/stats`);
      const data = await res.json();
      if (typeof data.total === "number") setVisitStats(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchVisitStats();
    const t = setInterval(fetchVisitStats, 5000);
    return () => clearInterval(t);
  }, [fetchVisitStats]);

  // ── Scan stats polling ────────────────────────────────────────────────────
  const fetchScanStats = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/scan/stats?key=${SCAN_KEY}`);
      const data = await res.json();
      if (typeof data.total === "number") setScanStats(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchScanStats();
    const t = setInterval(fetchScanStats, 10000);
    return () => clearInterval(t);
  }, [fetchScanStats]);

  const { connected, messages, sendMessage, loadHistory } = useChatSocket(ADMIN_CC_ID);

  const refreshConversations = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/chat/conversations`);
      const data = await res.json();
      if (data.conversations) setConversations(data.conversations);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    refreshConversations();
    const t = setInterval(refreshConversations, 5000);
    return () => clearInterval(t);
  }, [refreshConversations]);

  useEffect(() => {
    if (!selectedUser) return;
    setLoadingConv(true);
    setConvMessages([]);
    fetch(`${API}/chat/messages/${SUPPORT_ID}/${selectedUser}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.messages) {
          setConvMessages(data.messages);
          loadHistory(data.messages);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingConv(false));
  }, [selectedUser, loadHistory]);

  // Track messages for the currently open conversation
  useEffect(() => {
    if (!selectedUser || messages.length === 0) return;
    setConvMessages((prev) => {
      const prevIds = new Set(prev.map((m) => m.id));
      const relevant = messages.filter(
        (m) =>
          !prevIds.has(m.id) &&
          (m.senderCcId === selectedUser || m.receiverCcId === selectedUser ||
           m.senderCcId === SUPPORT_ID   || m.receiverCcId === SUPPORT_ID),
      );
      return relevant.length > 0 ? [...prev, ...relevant] : prev;
    });
    refreshConversations();
  }, [messages, selectedUser, refreshConversations]);

  // Mark unread: any incoming client message for a user that isn't currently open
  const seenMsgIds = useRef<Set<number>>(new Set());
  useEffect(() => {
    messages.forEach((m) => {
      if (seenMsgIds.current.has(m.id)) return;
      seenMsgIds.current.add(m.id);
      // Only flag messages FROM a real client (not from support/admin)
      const isFromClient = m.senderCcId !== SUPPORT_ID && m.senderCcId !== ADMIN_CC_ID;
      if (!isFromClient) return;
      const fromUser = m.senderCcId;
      if (fromUser !== selectedUser) {
        setUnreadUsers((prev) => new Set(prev).add(fromUser));
        refreshConversations();
      }
    });
  }, [messages, selectedUser, refreshConversations]);

  // Clear unread when user opens a conversation
  function openConversation(userId: string) {
    setSelectedUser(userId);
    setUnreadUsers((prev) => {
      const next = new Set(prev);
      next.delete(userId);
      return next;
    });
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [convMessages]);

  function handleSend() {
    if (!input.trim() || !selectedUser) return;
    sendMessage(selectedUser, input.trim());
    setInput("");
  }

  // ── Conversation list / Visitor stats ────────────────────────────────────
  if (!selectedUser) {
    const maxVisits = visitStats.countries[0]?.count ?? 1;

    return (
      <div style={{ height: "100vh", background: "#0B0F14", color: "#fff", fontFamily: "'Inter',sans-serif", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ background: "#0B1220", borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "16px 20px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,#00FFC6,#00B8A9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🛡</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Soporte CoinCash</div>
              <div style={{ fontSize: 11, color: connected ? "#00FFC6" : "#9CA3AF" }}>
                {connected ? "● En línea" : "○ Conectando…"}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "#4B5563", margin: "6px 0 12px" }}>Panel de agente · {ADMIN_CC_ID}</div>

          {/* Tab bar */}
          <div style={{ display: "flex", gap: 0 }}>
            {([
              { key: "mensajes",   label: "💬 Chats" },
              { key: "visitantes", label: "🌍 Visitas" },
              { key: "scans",      label: "🔍 Scans" },
            ] as const).map((t) => (
              <button
                key={t.key}
                onClick={() => setAdminTab(t.key)}
                style={{
                  flex: 1, padding: "8px 0", border: "none", cursor: "pointer",
                  background: "transparent", fontFamily: "inherit", fontSize: 12, fontWeight: 600,
                  color: adminTab === t.key ? "#00FFC6" : "#6B7280",
                  borderBottom: adminTab === t.key ? "2px solid #00FFC6" : "2px solid transparent",
                  transition: "all 0.2s",
                }}
              >
                {t.label}
                {t.key === "mensajes" && unreadUsers.size > 0 && (
                  <span style={{ marginLeft: 4, background: "#00FFC6", color: "#0B1220", borderRadius: 10, padding: "1px 5px", fontSize: 10, fontWeight: 700 }}>
                    {unreadUsers.size}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Visitor stats panel ── */}
        {adminTab === "visitantes" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>

            {/* Total counter card */}
            <div style={{
              background: "linear-gradient(135deg, rgba(0,255,198,0.08) 0%, rgba(0,184,169,0.04) 100%)",
              border: "1px solid rgba(0,255,198,0.2)",
              borderRadius: 16, padding: "20px 24px", marginBottom: 16,
              backdropFilter: "blur(10px)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div>
                <div style={{ fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
                  Total de visitas
                </div>
                <div style={{ fontSize: 40, fontWeight: 800, color: "#00FFC6", letterSpacing: "-1px", lineHeight: 1 }}>
                  {visitStats.total.toLocaleString("es-ES")}
                </div>
                <div style={{ fontSize: 11, color: "#4B5563", marginTop: 6 }}>
                  {visitStats.countries.length} {visitStats.countries.length === 1 ? "país" : "países"} detectados
                </div>
              </div>
              <div style={{ fontSize: 48, opacity: 0.3 }}>🌐</div>
            </div>

            {/* Live indicator */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, paddingLeft: 2 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#00FFC6", animation: "pulse 1.5s infinite" }} />
              <span style={{ fontSize: 11, color: "#6B7280" }}>Actualización en tiempo real · cada 5 s</span>
            </div>

            {/* Country cards */}
            {visitStats.countries.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 24px", color: "#4B5563" }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🌍</div>
                <div>Aún no hay visitas registradas</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {visitStats.countries.map((c, i) => {
                  const pct = Math.round((c.count / maxVisits) * 100);
                  const flagSrc = c.code === "xx"
                    ? null
                    : `https://flagcdn.com/24x18/${c.code}.png`;
                  return (
                    <div
                      key={c.code}
                      title={`${c.name}: ${c.count} visita${c.count !== 1 ? "s" : ""}`}
                      style={{
                        background: i === 0
                          ? "linear-gradient(135deg,rgba(0,255,198,0.1),rgba(0,184,169,0.05))"
                          : "rgba(255,255,255,0.03)",
                        border: i === 0
                          ? "1px solid rgba(0,255,198,0.25)"
                          : "1px solid rgba(255,255,255,0.06)",
                        borderRadius: 12, padding: "12px 14px",
                        transition: "border-color 0.2s",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        {/* Flag */}
                        <div style={{ width: 28, height: 20, borderRadius: 3, overflow: "hidden", flexShrink: 0, background: "#1E2736", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {flagSrc
                            ? <img src={flagSrc} alt={c.name} style={{ width: 28, height: "auto", display: "block" }} />
                            : <span style={{ fontSize: 14 }}>🌐</span>
                          }
                        </div>
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: i === 0 ? "#00FFC6" : "#E5E7EB" }}>
                          {c.name}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: i === 0 ? "#00FFC6" : "#9CA3AF" }}>
                          {c.count.toLocaleString("es-ES")}
                        </span>
                        {i === 0 && (
                          <span style={{ fontSize: 9, background: "rgba(0,255,198,0.15)", color: "#00FFC6", borderRadius: 6, padding: "2px 5px", fontWeight: 700 }}>
                            #1
                          </span>
                        )}
                      </div>
                      {/* Progress bar */}
                      <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{
                          height: "100%", width: `${pct}%`,
                          background: i === 0
                            ? "linear-gradient(90deg,#00FFC6,#00B8A9)"
                            : "rgba(0,255,198,0.4)",
                          borderRadius: 2, transition: "width 0.5s ease",
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Scan analytics panel ── */}
        {adminTab === "scans" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
            {!scanStats ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#4B5563" }}>Cargando…</div>
            ) : (
              <>
                {/* Total / Hoy */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                  {[{ label: "Total scans", value: scanStats.total }, { label: "Hoy", value: scanStats.today }].map((item, i) => (
                    <div key={i} style={{ background: "linear-gradient(135deg,rgba(0,255,198,0.08),rgba(0,184,169,0.04))", border: "1px solid rgba(0,255,198,0.2)", borderRadius: 14, padding: "14px" }}>
                      <div style={{ fontSize: 10, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{item.label}</div>
                      <div style={{ fontSize: 32, fontWeight: 800, color: "#00FFC6", fontFamily: "monospace", lineHeight: 1 }}>{item.value.toLocaleString()}</div>
                    </div>
                  ))}
                </div>

                {/* Países */}
                {scanStats.byCountry.filter(c => c.code !== "xx").length > 0 && (
                  <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, marginBottom: 14, overflow: "hidden" }}>
                    <div style={{ padding: "10px 14px 6px", fontSize: 10, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>Por país</div>
                    {scanStats.byCountry.filter(c => c.code !== "xx").map(c => (
                      <div key={c.code} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <span style={{ fontSize: 18 }}>{flagEmoji(c.code)}</span>
                        <span style={{ flex: 1, fontSize: 13, color: "#E5E7EB" }}>{c.name}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#00FFC6", fontFamily: "monospace" }}>{c.count}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actividad reciente */}
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ padding: "10px 14px 6px", fontSize: 10, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    Actividad reciente ({scanStats.recent.length})
                  </div>
                  {scanStats.recent.length === 0 && (
                    <div style={{ padding: "20px 14px", fontSize: 13, color: "#4B5563", textAlign: "center" }}>Sin scans aún</div>
                  )}
                  {scanStats.recent.map(r => (
                    <div key={r.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{flagEmoji(r.country_code)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontFamily: "monospace", color: "#00FFC6", wordBreak: "break-all" }}>{r.wallet}</div>
                        <div style={{ fontSize: 10, color: "#6B7280", marginTop: 1 }}>{r.country}</div>
                      </div>
                      <span style={{ fontSize: 10, color: "#6B7280", flexShrink: 0, whiteSpace: "nowrap" }}>{timeAgo(r.scanned_at)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Conversation list */}
        {adminTab === "mensajes" && (
        <div style={{ flex: 1, overflowY: "auto" }}>
          {conversations.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 24px", color: "#4B5563", fontSize: 14 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>💬</div>
              Aún no hay conversaciones
            </div>
          ) : (
            conversations.map((c) => {
              const hasUnread = unreadUsers.has(c.userId);
              return (
                <button
                  key={c.userId}
                  onClick={() => openConversation(c.userId)}
                  style={{
                    width: "100%", padding: "14px 20px",
                    background: hasUnread ? "rgba(0,255,198,0.06)" : "transparent",
                    border: "none",
                    borderBottom: hasUnread
                      ? "1px solid rgba(0,255,198,0.15)"
                      : "1px solid rgba(255,255,255,0.05)",
                    borderLeft: hasUnread ? "3px solid #00FFC6" : "3px solid transparent",
                    cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 12,
                    transition: "background 0.2s",
                  }}
                >
                  {/* Avatar with unread pulse */}
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: "50%",
                      background: hasUnread ? "rgba(0,255,198,0.15)" : "#1E2736",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 16,
                      border: hasUnread ? "2px solid #00FFC6" : "2px solid transparent",
                    }}>
                      👤
                    </div>
                    {hasUnread && (
                      <div style={{
                        position: "absolute", top: 0, right: 0,
                        width: 12, height: 12, borderRadius: "50%",
                        background: "#00FFC6",
                        border: "2px solid #0B0F14",
                        animation: "pulse 1.5s infinite",
                      }} />
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, alignItems: "center" }}>
                      <span style={{
                        fontWeight: hasUnread ? 700 : 600,
                        fontSize: 13,
                        color: hasUnread ? "#00FFC6" : "#E5E7EB",
                        fontFamily: "monospace",
                      }}>{c.userId}</span>
                      <span style={{ fontSize: 11, color: hasUnread ? "#00FFC6" : "#6B7280", flexShrink: 0, fontWeight: hasUnread ? 600 : 400 }}>
                        {timeStr(c.lastTime)}
                      </span>
                    </div>
                    <div style={{
                      fontSize: 12,
                      color: hasUnread ? "#E5E7EB" : "#6B7280",
                      fontWeight: hasUnread ? 500 : 400,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {c.lastSender === SUPPORT_ID ? "Tú: " : ""}
                      {isMediaMsg(c.lastMessage) ? "📷 Imagen" : c.lastMessage}
                    </div>
                  </div>

                  {/* Unread badge */}
                  {hasUnread && (
                    <div style={{
                      background: "#00FFC6", color: "#0B1220",
                      fontSize: 10, fontWeight: 700,
                      borderRadius: 10, padding: "2px 7px",
                      flexShrink: 0, minWidth: 18, textAlign: "center",
                    }}>
                      NEW
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
        )}
      </div>
    );
  }

  // ── Chat panel ─────────────────────────────────────────────────────────────
  return (
    <div style={{ height: "100vh", background: "#0B0F14", color: "#fff", fontFamily: "'Inter',sans-serif", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ background: "#0B1220", borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <button
          onClick={() => setSelectedUser(null)}
          style={{ background: "none", border: "none", color: "#00FFC6", cursor: "pointer", fontSize: 24, padding: "0 4px", lineHeight: 1, display: "flex", alignItems: "center" }}
        >‹</button>
        <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#1E2736", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>
          👤
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, fontFamily: "monospace" }}>{selectedUser}</div>
          <div style={{ fontSize: 11, color: "#6B7280" }}>Usuario</div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 8px", display: "flex", flexDirection: "column", gap: 10 }}>
        {loadingConv && (
          <div style={{ textAlign: "center", color: "#4B5563", fontSize: 13, marginTop: 40 }}>Cargando…</div>
        )}
        {!loadingConv && convMessages.length === 0 && (
          <div style={{ textAlign: "center", color: "#4B5563", fontSize: 13, marginTop: 60 }}>No hay mensajes aún.</div>
        )}
        {convMessages.map((msg) => {
          const isSupport = msg.senderCcId === SUPPORT_ID || msg.senderCcId === ADMIN_CC_ID;
          const isMedia   = isMediaMsg(msg.message);
          return (
            <div key={msg.id} style={{ display: "flex", flexDirection: isSupport ? "row-reverse" : "row", alignItems: "flex-end", gap: 8 }}>
              {!isSupport && (
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(0,255,198,0.15)", border: "1.5px solid #00FFC6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>👤</div>
              )}
              <div style={{
                maxWidth: "72%",
                background: isMedia
                  ? "transparent"
                  : isSupport
                    ? "#1E2736"
                    : "linear-gradient(135deg,#00C896 0%,#00FFC6 100%)",
                color: isSupport ? "#E5E7EB" : "#0B1220",
                borderRadius: isSupport ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                padding: isMedia ? 0 : "10px 14px",
                fontSize: 14, lineHeight: 1.45, wordBreak: "break-word",
                overflow: "hidden",
                boxShadow: isMedia ? "none" : isSupport ? "none" : "0 2px 12px rgba(0,255,198,0.2)",
              }}>
                {isMedia ? <AdminMediaBubble message={msg.message} /> : msg.message}
                {!isMedia && (
                  <div style={{ fontSize: 10, marginTop: 4, opacity: 0.65, textAlign: isSupport ? "right" : "left" }}>
                    {timeStr(msg.timestamp)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ background: "#0B1220", borderTop: "1px solid rgba(255,255,255,0.07)", padding: "12px 16px", paddingBottom: "calc(12px + env(safe-area-inset-bottom))", display: "flex", gap: 10, alignItems: "flex-end", flexShrink: 0 }}>
        <textarea
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
          }}
          placeholder={`Responder a ${selectedUser}…`}
          rows={1}
          style={{
            flex: 1, background: "#111827", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 16, color: "#fff", fontSize: 14, padding: "10px 14px",
            resize: "none", outline: "none", fontFamily: "inherit", lineHeight: 1.4,
            maxHeight: 120, overflowY: "auto",
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || !connected}
          style={{
            width: 44, height: 44, borderRadius: "50%",
            background: input.trim() && connected ? "linear-gradient(135deg,#00FFC6,#00B8A9)" : "#1E2736",
            border: "none", cursor: input.trim() && connected ? "pointer" : "not-allowed",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0,
          }}
        >➤</button>
      </div>
    </div>
  );
}
