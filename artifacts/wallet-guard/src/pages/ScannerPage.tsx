import WalletAnalyzer from "@/components/WalletAnalyzer";

interface ScannerPageProps {
  prefillAddress?: string;
  onAddressConsumed?: () => void;
}

const ScannerPage = ({ prefillAddress, onAddressConsumed }: ScannerPageProps) => (
  <div className="pb-24" style={{ minHeight: "100vh", background: "#0B0F14" }}>
    {/* Header */}
    <div className="px-5 pt-10 pb-5">
      <h1 className="text-xl font-bold text-white">Wallet Scanner</h1>
      <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
        Análisis de seguridad TRON en tiempo real
      </p>
    </div>

    {/* Input + results — everything else hidden until analysis */}
    <WalletAnalyzer prefillAddress={prefillAddress} onAddressConsumed={onAddressConsumed} />
  </div>
);

export default ScannerPage;
