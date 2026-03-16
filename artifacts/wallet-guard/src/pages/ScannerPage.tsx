import { useState, useEffect } from "react";
import WalletAnalyzer from "@/components/WalletAnalyzer";

const LS_KEY = "legalDisclaimerAccepted";

interface ScannerPageProps {
  prefillAddress?: string;
  onAddressConsumed?: () => void;
}

const ScannerPage = ({ prefillAddress, onAddressConsumed }: ScannerPageProps) => {
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(LS_KEY)) {
      setShowDisclaimer(true);
    }
  }, []);

  function accept() {
    localStorage.setItem(LS_KEY, "true");
    setShowDisclaimer(false);
  }

  return (
    <div className="pb-24" style={{ minHeight: "100vh", background: "#0B0F14" }}>
      {/* ── Legal Disclaimer Modal ── */}
      {showDisclaimer && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.82)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
        >
          <div
            style={{
              background: "#131920",
              border: "1.5px solid #ef4444",
              borderRadius: "16px",
              maxWidth: "400px",
              width: "100%",
              padding: "28px 24px 24px",
              boxShadow: "0 0 40px rgba(239,68,68,0.18)",
            }}
          >
            {/* Warning icon */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
              <div
                style={{
                  width: "52px",
                  height: "52px",
                  borderRadius: "50%",
                  background: "rgba(239,68,68,0.12)",
                  border: "1.5px solid rgba(239,68,68,0.4)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
            </div>

            {/* Title */}
            <h2
              style={{
                textAlign: "center",
                color: "#ef4444",
                fontSize: "18px",
                fontWeight: 700,
                marginBottom: "16px",
                letterSpacing: "0.01em",
              }}
            >
              Aviso Legal
            </h2>

            {/* Body text */}
            <p
              style={{
                color: "rgba(255,255,255,0.72)",
                fontSize: "13px",
                lineHeight: "1.65",
                textAlign: "left",
                marginBottom: "24px",
              }}
            >
              La información proporcionada en este informe es generada a partir de datos
              on-chain y bases de datos públicas de terceros. CoinCashWalletGuard no
              garantiza la exactitud absoluta, integridad o actualidad de los datos. Esta
              información tiene fines puramente analíticos e informativos y no constituye
              asesoramiento financiero, legal ni recomendación de inversión. El usuario
              asume toda la responsabilidad por las decisiones tomadas en base a este
              análisis.
            </p>

            {/* Accept button */}
            <button
              onClick={accept}
              style={{
                width: "100%",
                padding: "13px 0",
                borderRadius: "10px",
                background: "#ef4444",
                color: "#fff",
                fontWeight: 700,
                fontSize: "15px",
                border: "none",
                cursor: "pointer",
                letterSpacing: "0.01em",
                transition: "background 0.15s",
              }}
              onMouseEnter={e => ((e.target as HTMLButtonElement).style.background = "#dc2626")}
              onMouseLeave={e => ((e.target as HTMLButtonElement).style.background = "#ef4444")}
            >
              Aceptar y continuar
            </button>
          </div>
        </div>
      )}

      {/* ── Page content ── */}
      <div className="px-5 pt-10 pb-5">
        <h1 className="text-xl font-bold text-white">Wallet Scanner</h1>
        <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
          Análisis de seguridad TRON en tiempo real
        </p>
      </div>

      <WalletAnalyzer prefillAddress={prefillAddress} onAddressConsumed={onAddressConsumed} />

      {/* ── Fixed legal disclaimer banner ── */}
      <div
        style={{
          position: "fixed",
          bottom: "75px",
          left: "12px",
          right: "12px",
          borderRadius: "10px",
          zIndex: 999,
          padding: "10px",
          background: "#a00000",
          color: "#fff",
          fontSize: "11px",
          lineHeight: "1.3",
          maxHeight: "80px",
          overflow: "hidden",
        }}
      >
        <span style={{ fontWeight: 700 }}>⚠ Aviso Legal&nbsp;&nbsp;</span>
        La información proporcionada en este informe es generada a partir de datos on-chain y bases
        de datos públicas de terceros. CoinCashWalletGuard no garantiza la exactitud absoluta,
        integridad o actualidad de los datos. Esta información tiene fines puramente analíticos e
        informativos y no constituye asesoramiento financiero ni legal.
      </div>
    </div>
  );
};

export default ScannerPage;
