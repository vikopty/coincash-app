import { useState } from "react";
import WalletAnalyzer from "@/components/WalletAnalyzer";

interface ScannerPageProps {
  prefillAddress?: string;
  onAddressConsumed?: () => void;
}

const ScannerPage = ({ prefillAddress, onAddressConsumed }: ScannerPageProps) => {
  const [showModal, setShowModal] = useState(true);

  return (
    <div className="pb-24" style={{ minHeight: "100vh", background: "#0B0F14" }}>

      {/* ── Legal Disclaimer Modal ── */}
      {showModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.78)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
        >
          <div
            style={{
              background: "#131920",
              border: "1.5px solid #c0392b",
              borderRadius: "16px",
              maxWidth: "400px",
              width: "100%",
              overflow: "hidden",
              boxShadow: "0 8px 48px rgba(0,0,0,0.6)",
            }}
          >
            {/* Red header bar */}
            <div
              style={{
                background: "#c0392b",
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ color: "#fff", fontWeight: 700, fontSize: "15px" }}>
                ⚠ Aviso Legal
              </span>
              {/* Close ×  */}
              <button
                onClick={() => setShowModal(false)}
                style={{
                  background: "rgba(255,255,255,0.18)",
                  border: "none",
                  borderRadius: "6px",
                  color: "#fff",
                  fontSize: "16px",
                  fontWeight: 700,
                  lineHeight: 1,
                  width: "28px",
                  height: "28px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: "20px 20px 24px" }}>
              <div
                style={{
                  color: "rgba(255,255,255,0.75)",
                  fontSize: "13px",
                  lineHeight: "1.65",
                  marginBottom: "20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <p>
                  La información proporcionada en este informe es generada a partir de datos
                  on-chain y bases de datos públicas de terceros. CoinCashWalletGuard no
                  garantiza la exactitud absoluta, integridad o actualidad de los datos presentados.
                </p>
                <p>
                  Esta información tiene fines puramente analíticos e informativos y no constituye
                  asesoramiento financiero, legal ni recomendación de inversión.
                </p>
                <p>
                  El usuario asume toda la responsabilidad por las decisiones tomadas en base a
                  este análisis.
                </p>
                <p>
                  En caso de dudas sobre la legalidad de los fondos, consulte con un profesional
                  legal o las autoridades competentes.
                </p>
              </div>

              <button
                onClick={() => setShowModal(false)}
                style={{
                  width: "100%",
                  padding: "12px 0",
                  borderRadius: "10px",
                  background: "#c0392b",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "14px",
                  border: "none",
                  cursor: "pointer",
                  letterSpacing: "0.02em",
                }}
              >
                Aceptar y continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page header ── */}
      <div className="px-5 pt-10 pb-5">
        <h1 className="text-xl font-bold text-white">Wallet Scanner</h1>
        <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
          Análisis de seguridad TRON en tiempo real
        </p>
      </div>

      <WalletAnalyzer prefillAddress={prefillAddress} onAddressConsumed={onAddressConsumed} />
    </div>
  );
};

export default ScannerPage;
