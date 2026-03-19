import WalletAnalyzer from "@/components/WalletAnalyzer";

interface ScannerPageProps {
  prefillAddress?: string;
  onAddressConsumed?: () => void;
}

const ScannerPage = ({ prefillAddress, onAddressConsumed }: ScannerPageProps) => {
  return (
    <div className="pb-24" style={{ minHeight: "100vh", background: "#0B0F14" }}>

      {/* ── Logo header ── */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "8px",
        padding: "40px 24px 20px",
      }}>
        <img
          src={`${import.meta.env.BASE_URL}logo.png`}
          alt="CoinCash"
          style={{ width: "200px", height: "auto", objectFit: "contain" }}
        />
        <span style={{
          fontSize: "11.5px",
          color: "#9CA3AF",
          letterSpacing: "0.01em",
          lineHeight: 1.4,
          textAlign: "center",
        }}>
          Análisis de seguridad TRON en tiempo real
        </span>
      </div>

      <WalletAnalyzer prefillAddress={prefillAddress} onAddressConsumed={onAddressConsumed} />
    </div>
  );
};

export default ScannerPage;
