import { useState, useEffect, useRef } from "react";
import { Camera, Bell, BellOff, Check, Headphones, ChevronRight, Trash2 } from "lucide-react";
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
  const [photoStored,  setPhotoStored]  = useState<boolean>(() => !!localStorage.getItem("coincash-profile-photo"));
  const [uploading,    setUploading]    = useState(false);
  const [pushEnabled,  setPushEnabled]  = useState(false);
  const [pushLoading,  setPushLoading]  = useState(false);
  const [pushSupport,  setPushSupport]  = useState(true);
  const [saved,        setSaved]        = useState(false);
  const [visitStats, setVisitStats] = useState<{ total: number; today: number; online: number; countries: { name: string; code: string; count: number }[] } | null>(null);

  // Crop modal state
  const [cropSrc,        setCropSrc]        = useState<string | null>(null);
  const [cropOffset,     setCropOffset]     = useState({ x: 0, y: 0 });
  const [cropScale,      setCropScale]      = useState(1);
  const [cropImgNatural, setCropImgNatural] = useState({ w: 300, h: 300 });

  const fileRef       = useRef<HTMLInputElement>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);
  const cropDragRef   = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const cropPinchRef  = useRef<{ dist: number; scale: number } | null>(null);

  // Fetch visit stats
  useEffect(() => {
    fetch(`${API_BASE}/visit/stats`)
      .then(r => r.json())
      .then(d => setVisitStats(d))
      .catch(() => {});
  }, []);

  // Check push permission on mount
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushSupport(false);
      return;
    }
    const stored = localStorage.getItem("coincash-push-enabled");
    if (stored === "true") setPushEnabled(true);
  }, []);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("Solo se permiten imágenes"); return; }
    if (fileRef.current) fileRef.current.value = "";
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const CROP = 260;
        const minDim = Math.min(img.naturalWidth, img.naturalHeight);
        setCropImgNatural({ w: img.naturalWidth, h: img.naturalHeight });
        setCropScale(CROP / minDim);
        setCropOffset({ x: 0, y: 0 });
        setCropSrc(src);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  }

  async function confirmCrop() {
    if (!cropSrc) return;
    const CROP = 260;
    const canvas = cropCanvasRef.current!;
    canvas.width = CROP;
    canvas.height = CROP;
    const ctx = canvas.getContext("2d")!;
    const img = new Image();
    img.onload = async () => {
      ctx.clearRect(0, 0, CROP, CROP);
      ctx.save();
      ctx.beginPath();
      ctx.arc(CROP / 2, CROP / 2, CROP / 2, 0, Math.PI * 2);
      ctx.clip();
      const drawW = cropImgNatural.w * cropScale;
      const drawH = cropImgNatural.h * cropScale;
      ctx.drawImage(img, CROP / 2 + cropOffset.x - drawW / 2, CROP / 2 + cropOffset.y - drawH / 2, drawW, drawH);
      ctx.restore();
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        setCropSrc(null);
        setUploading(true);
        try {
          const f = new File([blob], "profile.jpg", { type: "image/jpeg" });
          const objectPath = await uploadFile(f);
          const url = `${API_BASE}/storage${objectPath}`;
          localStorage.setItem("coincash-profile-photo", url);
          setPhotoUrl(url);
          setPhotoStored(true);
          flashSaved();
        } catch { alert("No se pudo subir la foto"); }
        finally { setUploading(false); }
      }, "image/jpeg", 0.9);
    };
    img.src = cropSrc;
  }

  function onCropTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 1) {
      cropDragRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, ox: cropOffset.x, oy: cropOffset.y };
      cropPinchRef.current = null;
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      cropPinchRef.current = { dist: Math.hypot(dx, dy), scale: cropScale };
      cropDragRef.current = null;
    }
  }
  function onCropTouchMove(e: React.TouchEvent) {
    e.preventDefault();
    if (e.touches.length === 1 && cropDragRef.current) {
      setCropOffset({ x: cropDragRef.current.ox + e.touches[0].clientX - cropDragRef.current.startX, y: cropDragRef.current.oy + e.touches[0].clientY - cropDragRef.current.startY });
    } else if (e.touches.length === 2 && cropPinchRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      setCropScale(Math.max(0.3, Math.min(6, cropPinchRef.current.scale * (Math.hypot(dx, dy) / cropPinchRef.current.dist))));
    }
  }
  function onCropTouchEnd() { cropDragRef.current = null; cropPinchRef.current = null; }
  function onCropMouseDown(e: React.MouseEvent) { cropDragRef.current = { startX: e.clientX, startY: e.clientY, ox: cropOffset.x, oy: cropOffset.y }; }
  function onCropMouseMove(e: React.MouseEvent) {
    if (!cropDragRef.current) return;
    setCropOffset({ x: cropDragRef.current.ox + e.clientX - cropDragRef.current.startX, y: cropDragRef.current.oy + e.clientY - cropDragRef.current.startY });
  }
  function onCropMouseUp() { cropDragRef.current = null; }
  function onCropWheel(e: React.WheelEvent) { e.preventDefault(); setCropScale(s => Math.max(0.3, Math.min(6, s - e.deltaY * 0.002))); }

  function removePhoto() {
    localStorage.removeItem("coincash-profile-photo");
    setPhotoUrl(null);
    setPhotoStored(false);
    flashSaved();
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

      {/* Crop modal */}
      {cropSrc && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.93)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#fff" }}>Ajusta tu foto</p>
          <p style={{ margin: "-12px 0 0", fontSize: 12, color: MUTED }}>Arrastra · Pellizca para hacer zoom</p>

          {/* Circular crop area */}
          <div
            style={{ width: 260, height: 260, borderRadius: "50%", overflow: "hidden", border: `3px solid ${TEAL}`, position: "relative", cursor: "grab", userSelect: "none", touchAction: "none", boxShadow: `0 0 0 9999px rgba(0,0,0,0.6)` }}
            onTouchStart={onCropTouchStart}
            onTouchMove={onCropTouchMove}
            onTouchEnd={onCropTouchEnd}
            onMouseDown={onCropMouseDown}
            onMouseMove={onCropMouseMove}
            onMouseUp={onCropMouseUp}
            onMouseLeave={onCropMouseUp}
            onWheel={onCropWheel}
          >
            <img
              src={cropSrc}
              alt="crop"
              draggable={false}
              style={{
                position: "absolute", top: "50%", left: "50%",
                transform: `translate(-50%, -50%) translate(${cropOffset.x}px, ${cropOffset.y}px) scale(${cropScale})`,
                transformOrigin: "center", pointerEvents: "none", maxWidth: "none",
              }}
            />
          </div>

          {/* Zoom slider */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, width: 240 }}>
            <span style={{ fontSize: 12, color: MUTED }}>−</span>
            <input type="range" min={0.3} max={6} step={0.01} value={cropScale}
              onChange={e => setCropScale(parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: TEAL }} />
            <span style={{ fontSize: 12, color: MUTED }}>+</span>
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={() => setCropSrc(null)} style={{ padding: "12px 28px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
              Cancelar
            </button>
            <button onClick={confirmCrop} style={{ padding: "12px 28px", borderRadius: 12, border: "none", background: TEAL, color: "#0B1220", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              Confirmar
            </button>
          </div>
          <canvas ref={cropCanvasRef} style={{ display: "none" }} />
        </div>
      )}

      {/* Header */}
      <div style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, padding: "20px 16px 16px" }}>
        <p style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Ajustes</p>
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
              <img src={photoUrl} alt="Perfil" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} onError={() => { setPhotoUrl(null); }} />
            ) : (
              <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: "linear-gradient(135deg,#00FFC6,#0080FF)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 800, color: "#0B1220" }}>
                {ccId.slice(-2)}
              </div>
            )}
            <div style={{ position: "absolute", bottom: 0, right: 0, width: 22, height: 22, borderRadius: "50%", background: TEAL, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${BG}` }}>
              <Camera size={12} style={{ color: "#0B1220" }} />
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
              {photoStored ? "Foto de perfil" : "Cambiar foto"}
            </p>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: MUTED }}>
              Toca el círculo para elegir una imagen
            </p>
            {uploading && <p style={{ margin: "4px 0 0", fontSize: 12, color: TEAL }}>Subiendo...</p>}

            {/* Delete button — visible when there's a stored photo (even if broken) */}
            {photoStored && !uploading && (
              <button
                onClick={removePhoto}
                style={{
                  marginTop: 10, display: "flex", alignItems: "center", gap: 6,
                  background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                  borderRadius: 8, padding: "6px 12px", cursor: "pointer",
                  color: "rgb(248,113,113)", fontSize: 12, fontWeight: 600,
                }}
              >
                <Trash2 size={13} />
                Eliminar foto
              </button>
            )}
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoChange} />
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

      {/* Contador de visitas — oculto temporalmente */}
      {false && visitStats && (
        <div style={{ margin: "20px 16px 0", background: CARD, borderRadius: 14, border: `1px solid rgba(0,255,198,0.18)`, overflow: "hidden" }}>
          {/* Hoy / Total */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: `1px solid ${BORDER}` }}>
            {[{ label: "Hoy", value: visitStats.today }, { label: "Total", value: visitStats.total }].map((item, i) => (
              <div key={i} style={{ padding: "12px 16px", borderRight: i === 0 ? `1px solid ${BORDER}` : "none" }}>
                <p style={{ margin: 0, fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: "0.07em" }}>{item.label}</p>
                <p style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 800, color: TEAL, fontFamily: "monospace", letterSpacing: "-0.03em" }}>
                  {item.value.toLocaleString()}
                </p>
              </div>
            ))}
          </div>

          {/* En línea */}
          <div style={{ padding: "10px 16px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>🌐</span>
            <div>
              <p style={{ margin: 0, fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: "0.07em" }}>En línea</p>
              <p style={{ margin: "2px 0 0", fontSize: 18, fontWeight: 700, color: "#fff", fontFamily: "monospace" }}>
                {visitStats.online}
              </p>
            </div>
          </div>

          {/* Países */}
          {visitStats.countries.filter(c => c.code !== "xx").slice(0, 5).map((c) => {
            const flag = c.code.toUpperCase().replace(/./g, ch =>
              String.fromCodePoint(ch.charCodeAt(0) + 127397)
            );
            return (
              <div key={c.code} style={{ padding: "8px 16px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${BORDER}` }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>{flag}</span>
                <span style={{ fontSize: 13, color: TEXT, flex: 1 }}>{c.name}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: TEAL, fontFamily: "monospace" }}>{c.count}</span>
              </div>
            );
          })}
        </div>
      )}

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
