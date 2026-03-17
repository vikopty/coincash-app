import { useState, useEffect, useRef, useCallback } from "react";
import { useChatSocket } from "@/hooks/useChatSocket";

const ADMIN_CC_ID = "CC-801286";
const SUPPORT_ID  = "CC-SUPPORT";
const API         = "/api-server/api";

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
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

export default function AdminPage() {
  const [conversations, setConversations] = useState<ConvSummary[]>([]);
  const [selectedUser, setSelectedUser]   = useState<string | null>(null);
  const [convMessages, setConvMessages]   = useState<ChatMessage[]>([]);
  const [input, setInput]                 = useState("");
  const [loadingConv, setLoadingConv]     = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { connected, messages, sendMessage, loadHistory } = useChatSocket(ADMIN_CC_ID);

  // Load conversation list
  const refreshConversations = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/chat/conversations`);
      const data = await res.json();
      if (data.conversations) setConversations(data.conversations);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refreshConversations();
    const t = setInterval(refreshConversations, 5000);
    return () => clearInterval(t);
  }, [refreshConversations]);

  // Load full conversation when user is selected
  useEffect(() => {
    if (!selectedUser) return;
    setLoadingConv(true);
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

  // Merge socket messages into conversation when they belong to the selected user
  useEffect(() => {
    if (!selectedUser || messages.length === 0) return;
    setConvMessages((prev) => {
      const prevIds = new Set(prev.map((m) => m.id));
      const relevant = messages.filter(
        (m) =>
          !prevIds.has(m.id) &&
          ((m.senderCcId === selectedUser || m.receiverCcId === selectedUser) ||
           (m.senderCcId === SUPPORT_ID   || m.receiverCcId === SUPPORT_ID)),
      );
      return relevant.length > 0 ? [...prev, ...relevant] : prev;
    });
    refreshConversations();
  }, [messages, selectedUser, refreshConversations]);

  // Scroll to bottom when messages update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [convMessages]);

  function handleSend() {
    if (!input.trim() || !selectedUser) return;
    sendMessage(selectedUser, input.trim());
    setInput("");
  }

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "#0B0F14",
        color: "#fff",
        fontFamily: "'Inter', sans-serif",
        overflow: "hidden",
      }}
    >
      {/* ── Sidebar ── */}
      <div
        style={{
          width: selectedUser ? "0px" : "100%",
          maxWidth: 380,
          minWidth: selectedUser ? 0 : "100%",
          flexShrink: 0,
          background: "#0B1220",
          borderRight: "1px solid rgba(255,255,255,0.07)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          transition: "all 0.2s ease",
        }}
        className="admin-sidebar"
      >
        {/* Sidebar header */}
        <div
          style={{
            padding: "20px 20px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "linear-gradient(135deg,#00FFC6,#00B8A9)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
              }}
            >
              🛡
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Soporte CoinCash</div>
              <div style={{ fontSize: 11, color: connected ? "#00FFC6" : "#9CA3AF" }}>
                {connected ? "● En línea" : "○ Conectando…"}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "#4B5563", marginTop: 8 }}>
            Panel de agente · {ADMIN_CC_ID}
          </div>
        </div>

        {/* Conversation list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {conversations.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "60px 24px",
                color: "#4B5563",
                fontSize: 14,
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 12 }}>💬</div>
              Aún no hay conversaciones
            </div>
          ) : (
            conversations.map((c) => (
              <button
                key={c.userId}
                onClick={() => setSelectedUser(c.userId)}
                style={{
                  width: "100%",
                  padding: "14px 20px",
                  background: selectedUser === c.userId
                    ? "rgba(0,255,198,0.08)"
                    : "transparent",
                  border: "none",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                  cursor: "pointer",
                  textAlign: "left",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  transition: "background 0.15s",
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    background: "#1E2736",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                    flexShrink: 0,
                    border: selectedUser === c.userId
                      ? "2px solid #00FFC6"
                      : "2px solid transparent",
                  }}
                >
                  👤
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 3,
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: 13,
                        color: selectedUser === c.userId ? "#00FFC6" : "#E5E7EB",
                        fontFamily: "monospace",
                      }}
                    >
                      {c.userId}
                    </span>
                    <span style={{ fontSize: 11, color: "#6B7280", flexShrink: 0 }}>
                      {timeStr(c.lastTime)}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "#6B7280",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.lastSender === SUPPORT_ID ? "Tú: " : ""}
                    {c.lastMessage}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Chat panel ── */}
      {selectedUser ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            background: "#0B0F14",
          }}
        >
          {/* Chat header */}
          <div
            style={{
              background: "#0B1220",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexShrink: 0,
            }}
          >
            <button
              onClick={() => setSelectedUser(null)}
              style={{
                background: "none",
                border: "none",
                color: "#00FFC6",
                cursor: "pointer",
                fontSize: 20,
                padding: "0 4px",
                display: "flex",
                alignItems: "center",
              }}
            >
              ‹
            </button>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                background: "#1E2736",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 15,
              }}
            >
              👤
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, fontFamily: "monospace" }}>
                {selectedUser}
              </div>
              <div style={{ fontSize: 11, color: "#6B7280" }}>Usuario</div>
            </div>
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px 16px 8px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {loadingConv && (
              <div style={{ textAlign: "center", color: "#4B5563", fontSize: 13, marginTop: 40 }}>
                Cargando…
              </div>
            )}
            {!loadingConv && convMessages.length === 0 && (
              <div style={{ textAlign: "center", color: "#4B5563", fontSize: 13, marginTop: 60 }}>
                No hay mensajes aún.
              </div>
            )}
            {convMessages.map((msg) => {
              const isSupport =
                msg.senderCcId === SUPPORT_ID || msg.senderCcId === ADMIN_CC_ID;
              return (
                <div
                  key={msg.id}
                  style={{
                    display: "flex",
                    flexDirection: isSupport ? "row-reverse" : "row",
                    alignItems: "flex-end",
                    gap: 8,
                  }}
                >
                  {!isSupport && (
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: "#1E2736",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 13,
                        flexShrink: 0,
                      }}
                    >
                      👤
                    </div>
                  )}
                  <div
                    style={{
                      maxWidth: "72%",
                      background: isSupport
                        ? "linear-gradient(135deg,#00FFC6 0%,#00B8A9 100%)"
                        : "#1E2736",
                      color: isSupport ? "#0B1220" : "#E5E7EB",
                      borderRadius: isSupport
                        ? "18px 18px 4px 18px"
                        : "18px 18px 18px 4px",
                      padding: "10px 14px",
                      fontSize: 14,
                      lineHeight: 1.45,
                      wordBreak: "break-word",
                      boxShadow: isSupport
                        ? "0 2px 12px rgba(0,255,198,0.25)"
                        : "0 2px 8px rgba(0,0,0,0.3)",
                    }}
                  >
                    {msg.message}
                    <div
                      style={{
                        fontSize: 10,
                        marginTop: 4,
                        opacity: 0.65,
                        textAlign: isSupport ? "right" : "left",
                      }}
                    >
                      {timeStr(msg.timestamp)}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div
            style={{
              background: "#0B1220",
              borderTop: "1px solid rgba(255,255,255,0.07)",
              padding: "12px 16px",
              paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
              display: "flex",
              gap: 10,
              alignItems: "flex-end",
              flexShrink: 0,
            }}
          >
            <textarea
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={`Responder a ${selectedUser}…`}
              rows={1}
              style={{
                flex: 1,
                background: "#111827",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 16,
                color: "#fff",
                fontSize: 14,
                padding: "10px 14px",
                resize: "none",
                outline: "none",
                fontFamily: "inherit",
                lineHeight: 1.4,
                maxHeight: 120,
                overflowY: "auto",
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || !connected}
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background:
                  input.trim() && connected
                    ? "linear-gradient(135deg,#00FFC6,#00B8A9)"
                    : "#1E2736",
                border: "none",
                cursor: input.trim() && connected ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
                flexShrink: 0,
                transition: "all 0.2s",
              }}
            >
              ➤
            </button>
          </div>
        </div>
      ) : (
        /* Desktop placeholder when no user selected */
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#374151",
            fontSize: 14,
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 48 }}>💬</div>
          <div>Selecciona una conversación</div>
        </div>
      )}
    </div>
  );
}
