// @ts-nocheck
import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Upload, X, Loader2, Camera } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScanSuccess: (address: string) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const PURPLE     = "#8B5CF6";
const CARD_BG    = "#0D1117";
const FRAME      = 220;
const READER_ID  = "wg-qr-camera";
const TEMP_ID    = "wg-qr-temp";
const TOAST_GAP  = 2500; // ms between repeated invalid-address toasts

// ── Helpers ───────────────────────────────────────────────────────────────────
function isValidTron(s: string): boolean {
  return typeof s === "string" && s.trim().startsWith("T") && s.trim().length === 34;
}

// Inject CSS overrides for html5-qrcode internal DOM once
let stylesInjected = false;
function injectStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    #${READER_ID} { width:100%!important; height:100%!important; border:none!important; }
    #${READER_ID} video { width:100%!important; height:100%!important; object-fit:cover!important; display:block; }
    #${READER_ID}__scan_region { padding:0!important; border:none!important; margin:0!important; width:100%!important; height:100%!important; }
    #${READER_ID}__header_message { display:none!important; }
    #${READER_ID}__dashboard { display:none!important; }
    #${READER_ID}__dashboard_section { display:none!important; }
  `;
  document.head.appendChild(style);
}

// ── Component ─────────────────────────────────────────────────────────────────
const QRScannerDialog = ({ open, onOpenChange, onScanSuccess }: Props) => {
  const [camState, setCamState]     = useState<"idle"|"loading"|"active"|"error">("idle");
  const [uploadLoading, setUpload]  = useState(false);

  const scannerRef   = useRef<Html5Qrcode | null>(null);
  const detectedRef  = useRef(false);
  const lastErrTime  = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Camera helpers ──────────────────────────────────────────────────────────
  const stopCamera = useCallback(async () => {
    if (!scannerRef.current) return;
    try {
      const state = scannerRef.current.getState?.();
      if (state === 2 || state === 3) await scannerRef.current.stop();
    } catch { /* already stopped */ }
    scannerRef.current = null;
    detectedRef.current = false;
  }, []);

  const startCamera = useCallback(async () => {
    detectedRef.current = false;
    setCamState("loading");
    injectStyles();

    // Give React time to mount the reader div
    await new Promise(r => setTimeout(r, 200));
    if (!document.getElementById(READER_ID)) { setCamState("error"); return; }

    try {
      const scanner = new Html5Qrcode(READER_ID, { verbose: false });
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, aspectRatio: 1.0 },
        (raw: string) => {
          if (detectedRef.current) return;
          const text = raw.trim();

          if (!isValidTron(text)) {
            const now = Date.now();
            if (now - lastErrTime.current > TOAST_GAP) {
              lastErrTime.current = now;
              toast.error("Dirección TRON no válida");
            }
            return; // keep scanner running
          }

          detectedRef.current = true;
          stopCamera();
          onScanSuccess(text);
          onOpenChange(false);
        },
        () => { /* decode frame error — ignore */ },
      );
      setCamState("active");
    } catch {
      setCamState("error");
    }
  }, [stopCamera, onScanSuccess, onOpenChange]);

  // ── Lifecycle ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      stopCamera();
      setCamState("idle");
      return;
    }
    startCamera();
    return () => { stopCamera(); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── File upload ─────────────────────────────────────────────────────────────
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUpload(true);

    try {
      const temp = new Html5Qrcode(TEMP_ID, { verbose: false });
      const result = await temp.scanFile(file, false);
      const text = result.trim();
      if (!isValidTron(text)) {
        toast.error("Dirección TRON no válida");
      } else {
        onScanSuccess(text);
        onOpenChange(false);
        toast.success("QR escaneado correctamente desde imagen");
      }
    } catch {
      toast.error("No se pudo leer el QR de la imagen");
    } finally {
      setUpload(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (!open) return null;

  // ── Overlay geometry ────────────────────────────────────────────────────────
  const half = FRAME / 2;
  const corner = 32;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.88)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "0 16px",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
      onClick={e => { if (e.target === e.currentTarget) onOpenChange(false); }}
    >
      {/* ── Modal card ── */}
      <div style={{
        background: CARD_BG,
        borderRadius: 22,
        width: "min(100%, 400px)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 32px 96px rgba(0,0,0,0.85)",
        overflow: "hidden",
      }}>

        {/* ── Header ── */}
        <div style={{
          padding: "18px 18px 0 18px",
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        }}>
          <div>
            <h2 style={{ color: "#fff", fontWeight: 700, fontSize: 16, margin: 0, letterSpacing: -0.3 }}>
              Escanear QR de Billetera
            </h2>
            <p style={{ color: "rgba(255,255,255,0.42)", fontSize: 12.5, margin: "5px 0 0 0", lineHeight: 1.4 }}>
              Apunta la cámara al código QR o sube una imagen.
            </p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "rgba(255,255,255,0.3)", padding: 4,
              display: "flex", alignItems: "center", borderRadius: 8,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Camera viewport ── */}
        <div style={{
          margin: "14px 18px",
          position: "relative",
          borderRadius: 14,
          overflow: "hidden",
          background: "#000",
          height: 300,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          {/* html5-qrcode render target — library places video here */}
          <div
            id={READER_ID}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "hidden" }}
          />

          {/* ── Custom scanning overlay (dark panels + corner brackets) ── */}
          {camState === "active" && (
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 10 }}>
              {/* Top dark panel */}
              <div style={{
                position: "absolute", top: 0, left: 0, right: 0,
                height: `calc(50% - ${half}px)`,
                background: "rgba(0,0,0,0.62)",
              }} />
              {/* Bottom dark panel */}
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0,
                height: `calc(50% - ${half}px)`,
                background: "rgba(0,0,0,0.62)",
              }} />
              {/* Left dark panel */}
              <div style={{
                position: "absolute",
                top: `calc(50% - ${half}px)`,
                height: FRAME,
                left: 0,
                width: `calc(50% - ${half}px)`,
                background: "rgba(0,0,0,0.62)",
              }} />
              {/* Right dark panel */}
              <div style={{
                position: "absolute",
                top: `calc(50% - ${half}px)`,
                height: FRAME,
                right: 0,
                width: `calc(50% - ${half}px)`,
                background: "rgba(0,0,0,0.62)",
              }} />

              {/* Corner bracket SVG — centered over the clear frame area */}
              <div style={{
                position: "absolute",
                top: "50%", left: "50%",
                transform: `translate(-50%, -50%)`,
                width: FRAME, height: FRAME,
              }}>
                <svg
                  width={FRAME} height={FRAME}
                  viewBox={`0 0 ${FRAME} ${FRAME}`}
                  fill="none"
                  style={{ display: "block" }}
                >
                  {/* Top-left */}
                  <path d={`M0 ${corner} L0 0 L${corner} 0`} stroke={PURPLE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  {/* Top-right */}
                  <path d={`M${FRAME - corner} 0 L${FRAME} 0 L${FRAME} ${corner}`} stroke={PURPLE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  {/* Bottom-left */}
                  <path d={`M0 ${FRAME - corner} L0 ${FRAME} L${corner} ${FRAME}`} stroke={PURPLE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  {/* Bottom-right */}
                  <path d={`M${FRAME - corner} ${FRAME} L${FRAME} ${FRAME} L${FRAME} ${FRAME - corner}`} stroke={PURPLE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          )}

          {/* ── Loading state ── */}
          {(camState === "idle" || camState === "loading") && (
            <div style={{
              position: "absolute", inset: 0, zIndex: 20,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 12,
            }}>
              <Loader2 size={32} style={{ color: PURPLE }} className="animate-spin" />
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: 0 }}>
                Iniciando cámara…
              </p>
            </div>
          )}

          {/* ── Error state ── */}
          {camState === "error" && (
            <div style={{
              position: "absolute", inset: 0, zIndex: 20,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              gap: 10, padding: 24,
            }}>
              <Camera size={40} style={{ color: "rgba(255,255,255,0.14)" }} />
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, textAlign: "center", margin: 0 }}>
                No se pudo acceder a la cámara.
              </p>
              <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, textAlign: "center", margin: 0 }}>
                Usa «Subir Imagen QR» para escanear desde galería.
              </p>
            </div>
          )}
        </div>

        {/* Hidden temp element for file-based QR scanning */}
        <div
          id={TEMP_ID}
          style={{ position: "fixed", top: -9999, left: -9999, width: 1, height: 1, overflow: "hidden", visibility: "hidden" }}
        />

        {/* ── Action buttons ── */}
        <div style={{ display: "flex", gap: 10, padding: "0 18px 18px 18px" }}>
          {/* Upload */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadLoading}
            style={{
              flex: 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              padding: "13px 12px", borderRadius: 13,
              cursor: uploadLoading ? "default" : "pointer",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.09)",
              color: uploadLoading ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.72)",
              fontSize: 13.5, fontWeight: 600,
              transition: "opacity 0.15s",
            }}
          >
            {uploadLoading
              ? <Loader2 size={15} className="animate-spin" />
              : <Upload size={15} />
            }
            Subir Imagen QR
          </button>

          {/* Cancel */}
          <button
            onClick={() => onOpenChange(false)}
            style={{
              flex: 1,
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "13px 12px", borderRadius: 13,
              cursor: "pointer",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.09)",
              color: "rgba(255,255,255,0.45)",
              fontSize: 13.5, fontWeight: 600,
            }}
          >
            Cancelar
          </button>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFile}
      />
    </div>
  );
};

export default QRScannerDialog;
