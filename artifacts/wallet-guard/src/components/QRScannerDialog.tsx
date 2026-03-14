import { useEffect, useRef, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import jsQR from "jsqr";
import { Upload, Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface QRScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScanSuccess: (result: string) => void;
}

const QRScannerDialog = ({ open, onOpenChange, onScanSuccess }: QRScannerDialogProps) => {
  const [cameraState, setCameraState] = useState<"loading" | "active" | "error">("loading");
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const detectedRef = useRef(false);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    detectedRef.current = false;
    setCameraState("loading");
  }, []);

  const scanFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert",
    });

    if (code && code.data && !detectedRef.current) {
      detectedRef.current = true;
      stopCamera();
      onScanSuccess(code.data);
      onOpenChange(false);
      return;
    }

    rafRef.current = requestAnimationFrame(scanFrame);
  }, [stopCamera, onScanSuccess, onOpenChange]);

  const startCamera = useCallback(async () => {
    detectedRef.current = false;
    setCameraState("loading");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });

      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      video.srcObject = stream;
      // Required for iOS Safari: play() after srcObject assignment
      await video.play();
      setCameraState("active");
      rafRef.current = requestAnimationFrame(scanFrame);
    } catch (err) {
      console.error("Camera error:", err);
      setCameraState("error");
    }
  }, [scanFrame]);

  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }
    // Small delay to let the dialog DOM mount before accessing videoRef
    const timer = setTimeout(() => startCamera(), 200);
    return () => clearTimeout(timer);
  }, [open, startCamera, stopCamera]);

  // File-based QR scanning using jsQR + canvas — no external library needed
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessingFile(true);

    try {
      const bitmap = await createImageBitmap(file);
      const offscreen = document.createElement("canvas");
      offscreen.width = bitmap.width;
      offscreen.height = bitmap.height;
      const ctx = offscreen.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0);
      const imageData = ctx.getImageData(0, 0, offscreen.width, offscreen.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "attemptBoth",
      });

      if (code?.data) {
        onScanSuccess(code.data);
        onOpenChange(false);
        toast.success("QR escaneado correctamente desde imagen");
      } else {
        toast.error("No se pudo leer el QR de la imagen");
      }
    } catch (err) {
      console.error("File scan error:", err);
      toast.error("No se pudo leer el QR de la imagen");
    } finally {
      setIsProcessingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Escanear QR de Billetera</DialogTitle>
          <DialogDescription>
            Apunta la cámara al código QR o sube una imagen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Camera viewport */}
          <div className="relative w-full rounded-lg overflow-hidden bg-black min-h-[280px] flex items-center justify-center">
            {/* Native video — playsinline is mandatory for iOS Safari */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ display: cameraState === "active" ? "block" : "none" }}
            />

            {/* Scanning overlay — only shown while camera is active */}
            {cameraState === "active" && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-56 h-56 border-2 border-primary rounded-lg opacity-80" />
              </div>
            )}

            {/* Loading state */}
            {cameraState === "loading" && (
              <div className="flex flex-col items-center gap-3 p-6">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Iniciando cámara…</p>
              </div>
            )}

            {/* Error state */}
            {cameraState === "error" && (
              <div className="text-center p-6 space-y-2">
                <Camera className="w-12 h-12 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">
                  No se pudo acceder a la cámara.
                </p>
                <p className="text-xs text-muted-foreground">
                  Usa la opción de subir imagen en su lugar.
                </p>
              </div>
            )}
          </div>

          {/* Hidden canvas used for frame analysis */}
          <canvas ref={canvasRef} className="hidden" />

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessingFile}
            >
              {isProcessingFile ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              Subir Imagen QR
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileUpload}
        />
      </DialogContent>
    </Dialog>
  );
};

export default QRScannerDialog;
