import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Html5Qrcode } from "html5-qrcode";
import { Upload, Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface QRScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScanSuccess: (result: string) => void;
}

const QRScannerDialog = ({ open, onOpenChange, onScanSuccess }: QRScannerDialogProps) => {
  const [isScanning, setIsScanning] = useState(false);
  const [hasCameraError, setHasCameraError] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isTransitioningRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    if (open) {
      setTimeout(() => {
        if (isMounted) startCamera();
      }, 100);
    } else {
      stopCamera();
    }

    return () => {
      isMounted = false;
      stopCamera();
    };
  }, [open]);

  const startCamera = async () => {
    if (isTransitioningRef.current) return;

    setHasCameraError(false);
    setIsScanning(true);

    let attempts = 0;
    while (!document.getElementById("qr-reader") && attempts < 20) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      attempts++;
    }

    if (!document.getElementById("qr-reader")) {
      setHasCameraError(true);
      setIsScanning(false);
      return;
    }

    try {
      isTransitioningRef.current = true;

      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode("qr-reader");
      }

      if (html5QrCodeRef.current.isScanning) {
        isTransitioningRef.current = false;
        return;
      }

      await html5QrCodeRef.current.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          if (!isTransitioningRef.current) {
            await stopCamera();
            onScanSuccess(decodedText);
            onOpenChange(false);
          }
        },
        () => {}
      );
    } catch (err) {
      console.error("Camera start error:", err);
      setHasCameraError(true);
      setIsScanning(false);
    } finally {
      isTransitioningRef.current = false;
    }
  };

  const stopCamera = async () => {
    if (isTransitioningRef.current) {
      let waitAttempts = 0;
      while (isTransitioningRef.current && waitAttempts < 10) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        waitAttempts++;
      }
    }

    if (!html5QrCodeRef.current) {
      setIsScanning(false);
      return;
    }

    try {
      isTransitioningRef.current = true;
      if (html5QrCodeRef.current.isScanning) {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current.clear();
      }
    } catch (err) {
      console.error("Failed to stop camera:", err);
    } finally {
      isTransitioningRef.current = false;
      setIsScanning(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessingFile(true);
    try {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        await stopCamera();
      }

      let attempts = 0;
      while (!document.getElementById("qr-reader") && attempts < 20) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        attempts++;
      }

      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode("qr-reader");
      }

      const result = await html5QrCodeRef.current.scanFile(file, true);
      onScanSuccess(result);
      onOpenChange(false);
      toast.success("QR escaneado correctamente desde imagen");
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
          <div
            id="qr-reader"
            ref={scannerRef}
            className="w-full rounded-lg overflow-hidden bg-muted min-h-[280px] flex items-center justify-center"
          >
            {hasCameraError && (
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
            {!hasCameraError && !isScanning && (
              <div className="flex items-center justify-center p-6">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>

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
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
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
