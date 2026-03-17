import { useState, useEffect, useRef } from "react";
import { Camera, Bell, BellOff, Check, Headphones, ChevronRight } from "lucide-react";
import { API_BASE } from "@/lib/apiConfig";

const TEAL   = "#00FFC6";
const BG     = "#0B0F14";
const CARD   = "#0B1220";
const BORDER = "rgba(255,255,255,0.07)";
const TEXT   = "rgba(255,255,255,0.9)";
const MUTED  = "rgba(255,255,255,0.45)";

function getCcId(): string {
  let id = localStorage.getItem("coincash-cc-id");
  if (!id) {
    const digits = Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
    id = `CC-${digits}`;
    localStorage.setItem("coincash-cc-id", id);
  }
  return id;
}

async function uploadFile(file: File): Promise<string> {
  const r = await fetch(`${API_BASE}/storage/uploads/request-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!r.ok) throw new Error("Error al subir");
  const { uploadURL, objectPath } = await r.json();
  await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
  return objectPath as string;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const arr     = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr;
}

export default function SettingsPage({ onOpenSupport }: { onOpenSupport?: () => void }) {
  const [ccId]         = useState<string>(getCcId);
  const [photoUrl,     setPhotoUrl]     = useState<string | null>(() => localStorage.getItem("coincash-profile-photo"));
  const [uploading,    setUploading]    = useState(false);
  const [pushEnabled,  setPushEnabled]  = useState(false);
  const [pushLoading,  setPushLoading]  = useState(false);
  const [pushSupport,  setPushSupport]  = useState(true);
  const [saved,        setSaved]        = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Check push permission on mount
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushSupport(false);
      return;
    }
    const stored = localStorage.getItem("coincash-push-enabled");
    if (stored === "true") setPushEnabled(true);
  }, []);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("Solo se permiten imágenes"); return; }
    setUploading(true);
    try {
      const objectPath = await uploadFile(file);
      const url = `${API_BASE}/storage${objectPath}`;
      localStorage.setItem("coincash-profile-photo", url);
      setPhotoUrl(url);
      flashSaved();
    } catch { alert("No se pudo subir la foto"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  function flashSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function togglePush() {
    if (pushLoading) return;
    setPushLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;

      if (pushEnabled) {
        // Unsubscribe
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch(`${API_BASE}/push/subscribe`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ccId, endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
        localStorage.setItem("coincash-push-enabled", "false");
        setPushEnabled(false);
      } else {
        // Subscribe — first get VAPID public key
        const keyRes = await fetch(`${API_BASE}/push/vapid-key`);
        const { publicKey } = await keyRes.json();

        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          alert("Permiso de notificaciones denegado. Actívalo en la configuración del navegador.");
          return;
        }

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly:      true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });

        await fetch(`${API_BASE}/push/subscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ccId, subscription: sub.toJSON() }),
        });
        localStorage.setItem("coincash-push-enabled", "true");
        setPushEnabled(true);
        flashSaved();
      }
    } catch (err: any) {
      console.error("Push toggle error:", err);
      alert("No se pudo configurar las notificaciones: " + (err?.message ?? "error desconocido"));
    } finally {
      setPushLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: BG, color: TEXT, fontFamily: "'Inter',sans-serif", paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, padding: "20px 16px 16px" }}>
        <p style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Ajustes</p>
        <p style={{ margin: "4px 0 0", fontSize: 11, color: MUTED }}>Tu perfil y preferencias</p>
      </div>

      {/* Profile photo */}
      <div style={{ padding: "24px 16px 0" }}>
        <p style={{ margin: "0 0 12px", fontSize: 12, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em" }}>Foto de perfil</p>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Avatar */}
          <div
            onClick={() => fileRef.current?.click()}
            style={{ position: "relative", width: 72, height: 72, borderRadius: "50%", cursor: "pointer", flexShrink: 0, border: `2px solid ${TEAL}` }}
          >
            {photoUrl ? (
              <img src={photoUrl} alt="Perfil" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} onError={() => setPhotoUrl(null)} />
            ) : (
              <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: "linear-gradient(135deg,#00FFC6,#0080FF)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 800, color: "#0B1220" }}>
                {ccId.slice(-2)}
              </div>
            )}
            <div style={{ position: "absolute", bottom: 0, right: 0, width: 22, height: 22, borderRadius: "50%", background: TEAL, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${BG}` }}>
              <Camera size={12} style={{ color: "#0B1220" }} />
            </div>
          </div>

          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Cambiar foto</p>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: MUTED }}>Toca el círculo para elegir una imagen</p>
            {uploading && <p style={{ margin: "4px 0 0", fontSize: 12, color: TEAL }}>Subiendo...</p>}
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoChange} />
      </div>

      {/* CC ID */}
      <div style={{ margin: "24px 16px 0", padding: 16, background: CARD, borderRadius: 12, border: `1px solid ${BORDER}` }}>
        <p style={{ margin: "0 0 4px", fontSize: 12, color: MUTED }}>Tu ID de CoinCash</p>
        <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: TEAL, fontFamily: "monospace" }}>{ccId}</p>
        <p style={{ margin: "6px 0 0", fontSize: 12, color: MUTED }}>Comparte este ID con tus contactos para que puedan enviarte mensajes.</p>
      </div>

      {/* Push notifications */}
      <div style={{ margin: "20px 16px 0", padding: 16, background: CARD, borderRadius: 12, border: `1px solid ${BORDER}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              {pushEnabled ? <Bell size={16} style={{ color: TEAL }} /> : <BellOff size={16} style={{ color: MUTED }} />}
              <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Notificaciones</p>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: MUTED }}>
              {!pushSupport
                ? "Tu navegador no soporta notificaciones push"
                : pushEnabled
                  ? "Recibirás alertas cuando lleguen mensajes nuevos"
                  : "Activa para recibir alertas de nuevos mensajes"}
            </p>
          </div>
          <button
            onClick={togglePush}
            disabled={!pushSupport || pushLoading}
            style={{
              width: 52, height: 28, borderRadius: 14, border: "none",
              background: pushEnabled ? TEAL : "rgba(255,255,255,0.12)",
              cursor: pushSupport && !pushLoading ? "pointer" : "not-allowed",
              position: "relative", transition: "background 0.2s", flexShrink: 0,
            }}
          >
            <div style={{
              width: 22, height: 22, borderRadius: "50%", background: "#fff",
              position: "absolute", top: 3,
              left: pushEnabled ? 27 : 3,
              transition: "left 0.2s",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {pushLoading ? <div style={{ width: 10, height: 10, borderRadius: "50%", border: "2px solid #ccc", borderTopColor: "#666", animation: "spin 0.6s linear infinite" }} /> : null}
            </div>
          </button>
        </div>
      </div>

      {/* Soporte */}
      <div style={{ margin: "20px 16px 0" }}>
        <p style={{ margin: "0 0 10px", fontSize: 12, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em" }}>Ayuda</p>
        <button
          onClick={onOpenSupport}
          style={{
            width: "100%", padding: "14px 16px",
            background: CARD, borderRadius: 12,
            border: "1px solid rgba(0,255,198,0.18)",
            display: "flex", alignItems: "center", gap: 14,
            cursor: "pointer", textAlign: "left",
          }}
        >
          <div style={{
            width: 40, height: 40, borderRadius: 11, flexShrink: 0,
            background: "linear-gradient(135deg,rgba(0,255,198,0.2) 0%,rgba(0,184,169,0.1) 100%)",
            border: "1px solid rgba(0,255,198,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Headphones size={18} style={{ color: TEAL }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#fff" }}>Soporte</p>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: MUTED }}>Chatea con el equipo CoinCash</p>
          </div>
          <ChevronRight size={18} style={{ color: MUTED, flexShrink: 0 }} />
        </button>
      </div>

      {/* Save feedback */}
      {saved && (
        <div style={{ margin: "16px 16px 0", padding: "10px 16px", background: "rgba(0,255,198,0.1)", borderRadius: 10, border: `1px solid rgba(0,255,198,0.25)`, display: "flex", alignItems: "center", gap: 8 }}>
          <Check size={14} style={{ color: TEAL }} />
          <span style={{ fontSize: 13, color: TEAL }}>Cambios guardados</span>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
