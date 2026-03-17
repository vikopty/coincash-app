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

export default function AdminPage() {
  const [conversations, setConversations] = useState<ConvSummary[]>([]);
  const [selectedUser, setSelectedUser]   = useState<string | null>(null);
  const [convMessages, setConvMessages]   = useState<ChatMessage[]>([]);
  const [input, setInput]                 = useState("");
  const [loadingConv, setLoadingConv]     = useState(false);
  const [unreadUsers, setUnreadUsers]     = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);

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

  // ── Conversation list ──────────────────────────────────────────────────────
  if (!selectedUser) {
    return (
      <div style={{ height: "100vh", background: "#0B0F14", color: "#fff", fontFamily: "'Inter',sans-serif", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ background: "#0B1220", borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "20px 20px 16px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,#00FFC6,#00B8A9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🛡</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Soporte CoinCash</div>
              <div style={{ fontSize: 11, color: connected ? "#00FFC6" : "#9CA3AF" }}>
                {connected ? "● En línea" : "○ Conectando…"}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "#4B5563", marginTop: 8 }}>Panel de agente · {ADMIN_CC_ID}</div>
        </div>

        {/* Conversation list */}
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
