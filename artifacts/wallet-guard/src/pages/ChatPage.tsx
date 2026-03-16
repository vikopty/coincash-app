import { useState, useRef, useEffect } from "react";
import { Send, MessageCircle } from "lucide-react";

const API = "/api-server/api";
const SUPPORT_ID = "CC-SUPPORT";

interface WalletEntry { address: string; name?: string; }

interface ChatMsg {
  id:           number;
  senderCcId:   string;
  receiverCcId: string;
  message:      string;
  timestamp:    Date;
}

function fmt(ts: Date | string): string {
  return new Date(ts).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

interface ChatPageProps { wallets?: WalletEntry[]; }

const ChatPage = ({ wallets = [] }: ChatPageProps) => {
  const [myCcId,    setMyCcId]    = useState<string | null>(null);
  const [ccLoading, setCcLoading] = useState(true);
  const [messages,  setMessages]  = useState<ChatMsg[]>([]);
  const [input,     setInput]     = useState("");
  const [sending,   setSending]   = useState(false);
  const bottomRef                 = useRef<HTMLDivElement>(null);

  // ── Resolve CoinCash ID from the first wallet in the live wallet list ──
  const firstAddress = wallets[0]?.address ?? null;

  useEffect(() => {
    // Reset state whenever the active wallet changes
    setMyCcId(null);
    setMessages([]);
    setCcLoading(true);

    if (!firstAddress) {
      setCcLoading(false);
      return;
    }

    let cancelled = false;
    async function init() {
      try {
        const res  = await fetch(`${API}/users/lookup`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ walletAddress: firstAddress }),
        });
        const data = await res.json();
        if (!cancelled && data.coincashId) {
          setMyCcId(data.coincashId);
          await loadHistory(data.coincashId);
        }
      } catch (err) {
        console.error("[chat] CoinCash ID lookup failed:", err);
      } finally {
        if (!cancelled) setCcLoading(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, [firstAddress]); // re-run whenever the first wallet changes

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadHistory(ccId: string) {
    try {
      const res  = await fetch(`${API}/chat/messages?user=${ccId}`);
      const data = await res.json();
      if (Array.isArray(data.messages)) {
        setMessages(data.messages);
        // Add welcome if no history
        if (data.messages.length === 0) {
          setMessages([{
            id:           0,
            senderCcId:   SUPPORT_ID,
            receiverCcId: ccId,
            message:      "Bienvenido al Chat Privado de CoinCash. ¿En qué podemos ayudarte?",
            timestamp:    new Date(),
          }]);
        }
      }
    } catch (err) {
      console.error("[chat] loadHistory failed:", err);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || !myCcId || sending) return;
    setSending(true);
    setInput("");

    // Optimistic add
    const optimistic: ChatMsg = {
      id:           Date.now(),
      senderCcId:   myCcId,
      receiverCcId: SUPPORT_ID,
      message:      text,
      timestamp:    new Date(),
    };
    setMessages(prev => [...prev, optimistic]);

    try {
      const res  = await fetch(`${API}/chat/messages`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ senderCcId: myCcId, message: text }),
      });
      const data = await res.json();
      if (data.reply) {
        setMessages(prev => [...prev, { ...data.reply, timestamp: new Date(data.reply.timestamp) }]);
      }
    } catch (err) {
      console.error("[chat] send failed:", err);
    } finally {
      setSending(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  const canSend = !!myCcId && !ccLoading;

  return (
    <div
      style={{
        display:       "flex",
        flexDirection: "column",
        height:        "100dvh",
        background:    "#0B0F14",
        paddingBottom: "64px",
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          flexShrink:   0,
          padding:      "52px 20px 14px",
          background:   "#0e1520",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        <h1 style={{ color: "#fff", fontSize: "18px", fontWeight: 700, margin: 0 }}>
          Chat Privado
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "12px" }}>
            Soporte CoinCash · En línea
          </span>
          {myCcId && (
            <span
              style={{
                marginLeft:   "auto",
                background:   "rgba(25,195,125,0.12)",
                border:       "1px solid rgba(25,195,125,0.3)",
                borderRadius: "20px",
                padding:      "2px 10px",
                color:        "#19C37D",
                fontSize:     "11px",
                fontWeight:   600,
                fontFamily:   "monospace",
              }}
            >
              {myCcId}
            </span>
          )}
          {ccLoading && (
            <span style={{ color: "rgba(255,255,255,0.25)", fontSize: "11px", marginLeft: "auto" }}>
              Cargando ID…
            </span>
          )}
        </div>
      </div>

      {/* ── No wallet state ── */}
      {!ccLoading && !myCcId && (
        <div
          style={{
            flex:           1,
            display:        "flex",
            flexDirection:  "column",
            alignItems:     "center",
            justifyContent: "center",
            gap:            "12px",
            padding:        "24px",
          }}
        >
          <MessageCircle size={48} color="rgba(255,255,255,0.15)" />
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "14px", textAlign: "center", margin: 0 }}>
            Agrega una wallet para obtener tu CoinCash ID y acceder al chat.
          </p>
        </div>
      )}

      {/* ── Message list ── */}
      {(myCcId || ccLoading) && (
        <div
          style={{
            flex:          1,
            overflowY:     "auto",
            padding:       "16px 16px 8px",
            display:       "flex",
            flexDirection: "column",
            gap:           "10px",
          }}
        >
          {messages.map((msg, idx) => {
            const isMe = msg.senderCcId === myCcId;
            const label = isMe ? msg.senderCcId : SUPPORT_ID;
            return (
              <div
                key={msg.id || idx}
                style={{
                  display:       "flex",
                  flexDirection: "column",
                  alignItems:    isMe ? "flex-end" : "flex-start",
                }}
              >
                {/* Sender label */}
                <span
                  style={{
                    fontSize:    "10px",
                    fontFamily:  "monospace",
                    color:       isMe ? "rgba(25,195,125,0.7)" : "rgba(255,255,255,0.3)",
                    marginBottom: "3px",
                    marginLeft:  isMe ? 0 : "4px",
                    marginRight: isMe ? "4px" : 0,
                  }}
                >
                  {label}
                </span>

                {/* Bubble */}
                <div
                  style={{
                    maxWidth:     "78%",
                    padding:      "10px 13px",
                    borderRadius: isMe ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                    background:   isMe ? "#19C37D" : "#1a2332",
                    color:        isMe ? "#000" : "rgba(255,255,255,0.88)",
                    fontSize:     "14px",
                    lineHeight:   "1.5",
                    wordBreak:    "break-word",
                  }}
                >
                  {msg.message}
                </div>

                {/* Time */}
                <span
                  style={{
                    fontSize:    "10px",
                    color:       "rgba(255,255,255,0.25)",
                    marginTop:   "3px",
                    marginLeft:  isMe ? 0 : "4px",
                    marginRight: isMe ? "4px" : 0,
                  }}
                >
                  {fmt(msg.timestamp)}
                </span>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}

      {/* ── Input bar ── */}
      <div
        style={{
          flexShrink:   0,
          display:      "flex",
          alignItems:   "center",
          gap:          "10px",
          padding:      "10px 14px",
          background:   "#0e1520",
          borderTop:    "1px solid rgba(255,255,255,0.07)",
        }}
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          disabled={!canSend}
          placeholder={canSend ? "Escribe un mensaje…" : "Agrega una wallet para chatear"}
          style={{
            flex:         1,
            background:   "#1a2332",
            border:       "1px solid rgba(255,255,255,0.10)",
            borderRadius: "22px",
            padding:      "10px 16px",
            color:        canSend ? "#fff" : "rgba(255,255,255,0.3)",
            fontSize:     "14px",
            outline:      "none",
            cursor:       canSend ? "text" : "not-allowed",
          }}
        />
        <button
          onClick={send}
          disabled={!input.trim() || !canSend || sending}
          style={{
            flexShrink:     0,
            width:          "42px",
            height:         "42px",
            borderRadius:   "50%",
            background:     (input.trim() && canSend) ? "#19C37D" : "rgba(255,255,255,0.08)",
            border:         "none",
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            cursor:         (input.trim() && canSend) ? "pointer" : "default",
            transition:     "background 0.15s",
          }}
        >
          <Send size={17} color={(input.trim() && canSend) ? "#000" : "rgba(255,255,255,0.3)"} />
        </button>
      </div>
    </div>
  );
};

export default ChatPage;
