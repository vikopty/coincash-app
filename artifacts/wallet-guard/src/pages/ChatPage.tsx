import { useState, useEffect, useRef, useCallback } from "react";
import { Paperclip } from "lucide-react";
import { useChatSocket } from "@/hooks/useChatSocket";
import { API_BASE } from "@/lib/apiConfig";

const SUPPORT_ID = "CC-SUPPORT";
const API = API_BASE;

function generateCcId() {
  const n = Math.floor(Math.random() * 1_000_000);
  return `CC-${String(n).padStart(6, "0")}`;
}

function timeStr(ts: string) {
  return new Date(ts).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

// ── Media helpers ─────────────────────────────────────────────────────────────
const IMG_PREFIX  = "[MEDIA_IMG:";
const FILE_PREFIX = "[MEDIA_FILE:";

function isMediaMsg(text: string) {
  return text.startsWith(IMG_PREFIX) || text.startsWith(FILE_PREFIX);
}

function MediaBubble({ message }: { message: string }) {
  if (message.startsWith(IMG_PREFIX)) {
    const objectPath = message.slice(IMG_PREFIX.length, -1);
    return (
      <img
        src={`${API}/storage${objectPath}`}
        alt="imagen"
        style={{ maxWidth: 220, maxHeight: 200, borderRadius: 10, display: "block" }}
        onError={(e) => { (e.target as HTMLImageElement).alt = "No se pudo cargar la imagen"; }}
      />
    );
  }
  if (message.startsWith(FILE_PREFIX)) {
    const parts      = message.slice(FILE_PREFIX.length, -1).split(":");
    const objectPath = parts[0];
    const filename   = parts[1] ?? "archivo";
    return (
      <a
        href={`${API}/storage${objectPath}`}
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

async function uploadFile(file: File): Promise<string> {
  const r = await fetch(`${API}/storage/uploads/request-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!r.ok) throw new Error("No se pudo obtener URL de subida");
  const { uploadURL, objectPath } = await r.json();
  const put = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
  if (!put.ok) throw new Error("Error al subir archivo");
  return objectPath as string;
}

export default function ChatPage() {
  const [myCcId,    setMyCcId]    = useState<string | null>(null);
  const [input,     setInput]     = useState("");
  const [loading,   setLoading]   = useState(true);
  const [uploading, setUploading] = useState(false);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const fileRef    = useRef<HTMLInputElement>(null);

  const { connected, messages, sendMessage, loadHistory, mergeMessages, reconnectCount } = useChatSocket(myCcId);

  // Fetch history from server and merge into message state
  const fetchHistory = useCallback(async (replace = false) => {
    if (!myCcId) return;
    try {
      const res  = await fetch(`${API}/chat/messages/${myCcId}/${SUPPORT_ID}`);
      const data = await res.json();
      if (data.messages) {
        if (replace) loadHistory(data.messages);
        else mergeMessages(data.messages);
      }
    } catch { /* ignore */ }
  }, [myCcId, loadHistory, mergeMessages]);

  // Init: get or create CC-ID
  useEffect(() => {
    (async () => {
      let id = localStorage.getItem("coincash-cc-id");
      if (!id || !/^CC-\d{6}$/.test(id)) {
        const candidate = generateCcId();
        try {
          const res  = await fetch(`${API}/chat/create-user`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ coincashId: candidate }),
          });
          const data = await res.json();
          id = data.coincashId ?? candidate;
        } catch { id = candidate; }
        localStorage.setItem("coincash-cc-id", id!);
      }
      setMyCcId(id);
      // Sync profile photo to backend so admin can see it
      const photoUrl = localStorage.getItem("coincash-profile-photo");
      if (photoUrl && id) {
        fetch(`${API}/chat/update-photo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ coincashId: id, photoUrl }),
        }).catch(() => {});
      }
    })();
  }, []);

  // Initial history load
  useEffect(() => {
    if (!myCcId) return;
    setLoading(true);
    fetchHistory(true).finally(() => setLoading(false));
  }, [myCcId]); // eslint-disable-line react-hooks/exhaustive-deps

  // On every socket reconnect, immediately merge missed messages
  const prevReconnectRef = useRef(0);
  useEffect(() => {
    if (reconnectCount === 0 || reconnectCount === prevReconnectRef.current) return;
    prevReconnectRef.current = reconnectCount;
    fetchHistory(false);
  }, [reconnectCount, fetchHistory]);

  // Poll every 4 seconds — catches missed messages even if socket drops
  useEffect(() => {
    if (!myCcId) return;
    const t = setInterval(() => fetchHistory(false), 4000);
    return () => clearInterval(t);
  }, [myCcId, fetchHistory]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend() {
    if (!input.trim() || !myCcId) return;
    sendMessage(SUPPORT_ID, input.trim());
    setInput("");
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !myCcId) return;
    e.target.value = "";
    setUploading(true);
    try {
      const objectPath = await uploadFile(file);
      const isImage    = file.type.startsWith("image/");
      const mediaMsg   = isImage
        ? `${IMG_PREFIX}${objectPath}]`
        : `${FILE_PREFIX}${objectPath}:${file.name}]`;
      sendMessage(SUPPORT_ID, mediaMsg);
    } catch (err: any) {
      alert(err.message ?? "Error al subir archivo");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#0B0F14", color: "#fff", fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#0B1220", borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "16px 20px 14px", display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg,#00FFC6,#00B8A9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
          💬
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Soporte CoinCash</div>
          <div style={{ fontSize: 11, color: connected ? "#00FFC6" : "#9CA3AF", marginTop: 1 }}>
            {connected ? "● En línea" : "○ Conectando…"}
          </div>
        </div>
        {myCcId && (
          <div style={{ fontSize: 10, color: "#4B5563", background: "#111827", borderRadius: 8, padding: "4px 8px", fontFamily: "monospace" }}>
            {myCcId}
          </div>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 8px", display: "flex", flexDirection: "column", gap: 10 }}>
        {loading && (
          <div style={{ textAlign: "center", color: "#4B5563", fontSize: 13, marginTop: 40 }}>
            Cargando conversación…
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 60, gap: 12, color: "#4B5563" }}>
            <div style={{ fontSize: 40 }}>💬</div>
            <div style={{ fontWeight: 600, fontSize: 15, color: "#6B7280" }}>Inicia una conversación</div>
            <div style={{ fontSize: 13, textAlign: "center", maxWidth: 240 }}>
              Escribe tu mensaje y el equipo de Soporte CoinCash te responderá.
            </div>
          </div>
        )}

        {messages.map((msg) => {
          const isOwn   = msg.senderCcId === myCcId;
          const isMedia = isMediaMsg(msg.message);
          return (
            <div key={msg.id} style={{ display: "flex", flexDirection: isOwn ? "row-reverse" : "row", alignItems: "flex-end", gap: 8 }}>
              {!isOwn && (
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#00FFC6,#00B8A9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>🛡</div>
              )}
              <div style={{
                maxWidth: "72%",
                background: isMedia ? "transparent" : isOwn ? "linear-gradient(135deg,#00FFC6,#00B8A9)" : "#1E2736",
                color: isOwn ? "#0B1220" : "#E5E7EB",
                borderRadius: isOwn ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                padding: isMedia ? 0 : "10px 14px",
                fontSize: 14,
                lineHeight: 1.45,
                wordBreak: "break-word",
                overflow: "hidden",
                boxShadow: isMedia ? "none" : isOwn ? "0 2px 12px rgba(0,255,198,0.25)" : "0 2px 8px rgba(0,0,0,0.3)",
              }}>
                {isMedia ? <MediaBubble message={msg.message} /> : msg.message}
                {!isMedia && (
                  <div style={{ fontSize: 10, marginTop: 4, opacity: 0.65, textAlign: isOwn ? "right" : "left" }}>
                    {timeStr(msg.timestamp)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Upload indicator */}
      {uploading && (
        <div style={{ padding: "6px 20px", background: "rgba(0,255,198,0.08)", textAlign: "center", fontSize: 12, color: "#00FFC6" }}>
          Subiendo archivo…
        </div>
      )}

      {/* Input */}
      <div style={{ background: "#0B1220", borderTop: "1px solid rgba(255,255,255,0.07)", padding: "12px 16px", paddingBottom: "calc(12px + env(safe-area-inset-bottom))", display: "flex", gap: 10, alignItems: "flex-end", flexShrink: 0, marginBottom: 64 }}>
        {/* File attach */}
        <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx,.txt" style={{ display: "none" }} onChange={handleFileChange} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading || !connected}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 6, flexShrink: 0, opacity: uploading ? 0.4 : 1 }}
          title="Adjuntar foto o archivo"
        >
          <Paperclip size={22} style={{ color: "rgba(255,255,255,0.45)" }} />
        </button>

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
          placeholder="Escribe tu mensaje…"
          rows={1}
          style={{ flex: 1, background: "#111827", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, color: "#fff", fontSize: 14, padding: "10px 14px", resize: "none", outline: "none", fontFamily: "inherit", lineHeight: 1.4, maxHeight: 120, overflowY: "auto" }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || !connected}
          style={{ width: 44, height: 44, borderRadius: "50%", background: input.trim() && connected ? "linear-gradient(135deg,#00FFC6,#00B8A9)" : "#1E2736", border: "none", cursor: input.trim() && connected ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0, transition: "all 0.2s" }}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
