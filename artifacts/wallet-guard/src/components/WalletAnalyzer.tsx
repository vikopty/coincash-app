import { useState } from "react";
import { Search, Loader2, QrCode } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import TronAnalysisReport from "@/components/TronAnalysisReport";
import QRScannerDialog from "@/components/QRScannerDialog";
import { toast } from "sonner";

interface ReportData {
  address: string;
  balanceUSDT: number;
  totalTx: number;
  txIn: number;
  txOut: number;
  dateCreated: number;
  lastTxDate: number;
  totalInUSDT: number;
  totalOutUSDT: number;
  uniqueWalletsCount: number;
  transfersAnalyzed: number;
  exchangeInteractions: number;
}

const WalletAnalyzer = () => {
  const [address, setAddress] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [reportData, setReportData] = useState<ReportData | null>(null);

  const isValidTronAddress = (addr: string) => {
    return /^T[a-zA-Z0-9]{33}$/.test(addr);
  };

  const fetchTronData = async (addr: string): Promise<ReportData> => {
    if (!isValidTronAddress(addr)) {
      throw new Error("Formato de dirección TRON inválido");
    }
    const usdtContract = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

    const accountRes = await fetch(
      `https://apilist.tronscanapi.com/api/account?address=${encodeURIComponent(addr)}`
    );
    if (!accountRes.ok) throw new Error(`Error de API: ${accountRes.status}`);
    const accountData = await accountRes.json();
    const usdtToken = accountData.trc20token_balances?.find(
      (t: any) => t.tokenId === usdtContract
    );
    const balanceUSDT = usdtToken
      ? parseFloat(usdtToken.balance) / Math.pow(10, usdtToken.tokenDecimal)
      : 0;
    const dateCreated = accountData.date_created || Date.now();

    const statsRes = await fetch(
      `https://apilist.tronscanapi.com/api/account/stats?address=${encodeURIComponent(addr)}`
    );
    let totalTx = 0, txIn = 0, txOut = 0;
    if (statsRes.ok) {
      const statsData = await statsRes.json();
      totalTx = statsData.transactions || 0;
      txIn = statsData.transactions_in || 0;
      txOut = statsData.transactions_out || 0;
    }

    const latestTxRes = await fetch(
      `https://apilist.tronscanapi.com/api/transaction?sort=-timestamp&count=true&limit=1&start=0&address=${encodeURIComponent(addr)}`
    );
    let lastTxDate = Date.now();
    if (latestTxRes.ok) {
      const latestTxData = await latestTxRes.json();
      lastTxDate =
        latestTxData.data && latestTxData.data.length > 0
          ? latestTxData.data[0].timestamp
          : Date.now();
    }

    let totalInUSDT = 0;
    let totalOutUSDT = 0;
    const uniqueWallets = new Set<string>();
    let transfers: any[] = [];
    let exchangeInteractions = 0;

    const maxPages = 3;
    for (let i = 0; i < maxPages; i++) {
      const res = await fetch(
        `https://apilist.tronscanapi.com/api/token_trc20/transfers?limit=50&start=${i * 50}&sort=-timestamp&count=true&relatedAddress=${encodeURIComponent(addr)}&contract_address=${usdtContract}`
      );
      if (!res.ok) break;
      const data = await res.json();
      if (data.token_transfers && data.token_transfers.length > 0) {
        transfers = transfers.concat(data.token_transfers);
      }
      if (!data.token_transfers || data.token_transfers.length < 50) {
        break;
      }
    }

    transfers.forEach((t: any) => {
      const amount = parseFloat(t.quant) / Math.pow(10, t.tokenInfo?.tokenDecimal || 6);
      if (t.to_address === addr) {
        totalInUSDT += amount;
      } else if (t.from_address === addr) {
        totalOutUSDT += amount;
      }
      const isFromExchange = t.from_address_tag?.from_address_tag;
      const isToExchange = t.to_address_tag?.to_address_tag;
      if (isFromExchange || isToExchange) {
        exchangeInteractions++;
      }
      uniqueWallets.add(t.from_address);
      uniqueWallets.add(t.to_address);
    });

    return {
      address: addr,
      balanceUSDT,
      totalTx,
      txIn,
      txOut,
      dateCreated,
      lastTxDate,
      totalInUSDT,
      totalOutUSDT,
      uniqueWalletsCount: uniqueWallets.size,
      transfersAnalyzed: transfers.length,
      exchangeInteractions,
    };
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = address.trim();
    if (!trimmed) {
      toast.error("Por favor ingresa una dirección de billetera TRON");
      return;
    }
    if (!isValidTronAddress(trimmed)) {
      toast.error("Formato de dirección TRON inválido. Debe comenzar con T y tener 34 caracteres.");
      return;
    }

    setIsAnalyzing(true);
    setShowReport(false);
    try {
      const data = await fetchTronData(trimmed);
      setReportData(data);
      setShowReport(true);
    } catch (error: any) {
      toast.error(error.message || "Error al analizar la dirección");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleScanSuccess = (result: string) => {
    setAddress(result);
    toast.success("Dirección escaneada correctamente");
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4">
      <div className="flex flex-col items-center gap-6">
        <div className="text-center mt-8">
          <h1 className="text-3xl font-bold tracking-tight">CoinCash WalletGuard</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Analiza billeteras TRON y detecta riesgos en transacciones USDT (TRC20)
          </p>
        </div>

        <Card className="w-full max-w-2xl">
          <CardContent className="pt-6">
            <form onSubmit={handleAnalyze} className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Ingresa dirección TRON (ej: TXyz...)"
                  className="pr-10 font-mono text-sm"
                  disabled={isAnalyzing}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setIsScannerOpen(true)}
                disabled={isAnalyzing}
                title="Escanear QR"
              >
                <QrCode className="w-4 h-4" />
              </Button>
              <Button type="submit" disabled={isAnalyzing}>
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analizando
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Analizar
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="w-full">
        {showReport && reportData ? (
          <TronAnalysisReport reportData={reportData} />
        ) : !isAnalyzing ? (
          <div className="flex justify-center items-center py-12">
            <p className="text-muted-foreground text-center text-lg">
              Ingresa una dirección TRON para comenzar el análisis
            </p>
          </div>
        ) : null}
      </div>

      <QRScannerDialog
        open={isScannerOpen}
        onOpenChange={setIsScannerOpen}
        onScanSuccess={handleScanSuccess}
      />
    </div>
  );
};

export default WalletAnalyzer;
