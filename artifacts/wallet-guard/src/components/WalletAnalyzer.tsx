import { useState } from "react";
import { Search, Loader2, QrCode } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import TronAnalysisReport from "@/components/TronAnalysisReport";
import QRScannerDialog from "@/components/QRScannerDialog";
import { toast } from "sonner";

interface ReportData {
  address: string;
  accountType: string;
  isFrozen: boolean;
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
  suspiciousInteractions: number;
}

// Known suspicious / high-risk TRON addresses (mixers, scams, sanctioned entities)
const SUSPICIOUS_WALLETS = new Set([
  "TDCLbZMHJJYNVMLMBBf63tKRgRGUhSQMmk",
  "THFgNEBXCmXnprDRaEf4bArVLphCwN7xNh",
  "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW",
  "TUFMa4D3j3S8rWB4hWMerGJqDcNEpBjNNT",
  "TNaRAoLUyYEV2uF7GUrzSjRQTU3v6CHdXM",
  "TXrkRCGqMjRhSfsFGr8bPxr7xHLGJFGJ2V",
  "TMuA6YqfCeX8EhbfYEg5y7S4DqzSJireY9",
  "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7",
  "TYukBQZ2XXCcRCReAUgCiWScMT6SLFRFAs",
  "TKVTdDBFUQH7FMnSQYELipCBYPegDhQwRJ",
  "TUea3MVQCWrYmKpBHe7aWAzSHHQHBGMQqz",
  "TVj7RNbeogwmasTB3fjnv75eV7teYmn74R",
  "TAPVF93s8dysXY8MzvqMoRdawoNMAPf7tL",
  "TWd4WrZ9wn84f5x1hZhL4DHvk738ns5jwH",
  "TXmVpin9hDD7YJAuaECRiEJVXPDnuGSo9f",
]);

// Decode a base58-encoded TRON address into a 64-char ABI-encoded hex parameter
const tronBase58ToAbiParam = (address: string): string => {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = 0n;
  for (const c of address) {
    const idx = ALPHABET.indexOf(c);
    if (idx < 0) throw new Error("Invalid base58 character");
    n = n * 58n + BigInt(idx);
  }
  // 25 bytes: [0x41 prefix][20-byte address][4-byte checksum]
  const hex = n.toString(16).padStart(50, "0");
  const addressHex = hex.slice(2, 42);
  return addressHex.padStart(64, "0");
};

const WalletAnalyzer = () => {
  const [address, setAddress] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [reportData, setReportData] = useState<ReportData | null>(null);

  const isValidTronAddress = (addr: string) => {
    return /^T[a-zA-Z0-9]{33}$/.test(addr);
  };

  const tronGridFetch = async (url: string) => {
    const headers: Record<string, string> = {
      "Accept": "application/json",
    };
    const apiKey = import.meta.env.VITE_TRON_API_KEY;
    if (apiKey) {
      headers["TRON-PRO-API-KEY"] = apiKey;
    }
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Error de API TronGrid (${res.status}): ${text}`);
    }
    return res.json();
  };

  const checkUsdtBlacklist = async (addr: string): Promise<boolean> => {
    try {
      // USDT TRC20 contract — exposes isBlackListed(address) in its ABI
      const usdtContract = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
      // ABI-encode the wallet address as a 32-byte hex parameter
      const param = tronBase58ToAbiParam(addr);
      const apiKey = import.meta.env.VITE_TRON_API_KEY;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) headers["TRON-PRO-API-KEY"] = apiKey;

      const res = await fetch("https://api.trongrid.io/wallet/triggerconstantcontract", {
        method: "POST",
        headers,
        body: JSON.stringify({
          owner_address: addr,
          contract_address: usdtContract,
          // Correct ABI function name — capital L (isBlackListed, not isBlacklisted)
          function_selector: "isBlackListed(address)",
          parameter: param,
          visible: true,
        }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      // Successful call: result.result === true and no revert message
      if (!data.result?.result) return false;
      // ABI bool result: 32 hex chars = 32 bytes
      // false → all zeros; true → ...0001 (any non-zero character)
      const result: string = data.constant_result?.[0] ?? "";
      return result.length === 64 && /[^0]/.test(result);
    } catch {
      return false;
    }
  };

  const fetchTronData = async (addr: string): Promise<ReportData> => {
    if (!isValidTronAddress(addr)) {
      throw new Error("Formato de dirección TRON inválido");
    }
    const usdtContract = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

    // 1. Account info + blacklist check in parallel
    const [accountData, isFrozen] = await Promise.all([
      tronGridFetch(`https://api.trongrid.io/v1/accounts/${encodeURIComponent(addr)}`),
      checkUsdtBlacklist(addr),
    ]);
    const account = accountData.data?.[0];
    if (!account) throw new Error("Dirección no encontrada en la red TRON");

    // Account type
    const accountTypeMap: Record<number, string> = {
      0: "Normal",
      1: "Emisor de Token",
      2: "Contrato",
    };
    const accountType = accountTypeMap[account.account_type as number] ?? "Normal";

    // USDT balance from trc20 map: { [contractAddress]: "amount_string" }
    const trc20Map: Record<string, string> = {};
    if (Array.isArray(account.trc20)) {
      account.trc20.forEach((entry: Record<string, string>) => {
        Object.assign(trc20Map, entry);
      });
    }
    const rawUsdt = trc20Map[usdtContract];
    const balanceUSDT = rawUsdt ? parseFloat(rawUsdt) / 1e6 : 0;
    const dateCreated: number = account.create_time || Date.now();

    // 2. Transaction counts via TronGrid
    //    txIn  = transactions where addr is RECEIVER (only_to=true)
    //    txOut = transactions where addr is SENDER   (only_from=true)
    let totalTx = 0;
    let txIn = 0;
    let txOut = 0;
    try {
      const base = `https://api.trongrid.io/v1/accounts/${encodeURIComponent(addr)}/transactions?limit=1&only_confirmed=true`;
      const [txTotalData, txInData, txOutData] = await Promise.all([
        tronGridFetch(base),
        tronGridFetch(`${base}&only_to=true`),
        tronGridFetch(`${base}&only_from=true`),
      ]);
      totalTx = txTotalData.meta?.total || 0;
      txIn    = txInData.meta?.total   || 0;   // receiver = wallet → incoming (green)
      txOut   = txOutData.meta?.total  || 0;   // sender   = wallet → outgoing (red)
    } catch {
      // Non-fatal; continue with zeros
    }

    // 3. Latest TRC20 transfer timestamp for lastTxDate
    let lastTxDate = Date.now();
    try {
      const latestData = await tronGridFetch(
        `https://api.trongrid.io/v1/accounts/${encodeURIComponent(addr)}/transactions/trc20?limit=1&contract_address=${usdtContract}&only_confirmed=true`
      );
      const first = latestData.data?.[0];
      if (first?.block_timestamp) lastTxDate = first.block_timestamp;
    } catch {
      // Non-fatal; keep default
    }

    // 4. Fetch up to 3 pages of TRC20 USDT transfers
    let totalInUSDT = 0;
    let totalOutUSDT = 0;
    const uniqueWallets = new Set<string>();
    let transfers: any[] = [];
    let exchangeInteractions = 0;
    let suspiciousInteractions = 0;

    let fingerprint: string | null = null;
    const maxPages = 3;
    for (let i = 0; i < maxPages; i++) {
      let url = `https://api.trongrid.io/v1/accounts/${encodeURIComponent(addr)}/transactions/trc20?limit=50&contract_address=${usdtContract}&only_confirmed=true`;
      if (fingerprint) url += `&fingerprint=${encodeURIComponent(fingerprint)}`;
      try {
        const data = await tronGridFetch(url);
        const batch: any[] = data.data || [];
        transfers = transfers.concat(batch);
        fingerprint = data.meta?.fingerprint || null;
        if (batch.length < 50 || !fingerprint) break;
      } catch {
        break;
      }
    }

    transfers.forEach((t: any) => {
      const decimals = parseInt(t.token_info?.decimals ?? "6", 10);
      const amount = parseFloat(t.value || "0") / Math.pow(10, decimals);
      if (t.to === addr) {
        totalInUSDT += amount;
      } else if (t.from === addr) {
        totalOutUSDT += amount;
      }
      if (t.from) uniqueWallets.add(t.from);
      if (t.to) uniqueWallets.add(t.to);

      // Counterparty risk: the other party in each transfer
      const counterparty = t.to === addr ? t.from : t.to;
      if (counterparty && counterparty !== addr && SUSPICIOUS_WALLETS.has(counterparty)) {
        suspiciousInteractions++;
      }
    });

    return {
      address: addr,
      accountType,
      isFrozen,
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
      suspiciousInteractions,
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
    <div className="flex flex-col items-center w-full max-w-4xl px-4 py-8 mx-auto">
      {/* Header */}
      <div className="text-center mb-8 w-full">
        <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl mb-1">
          Coin<span className="text-primary">Cash</span>
        </h1>
        <div
          className="flex items-center justify-center gap-1.5 mb-8"
          style={{ color: "rgb(31, 189, 20)", fontSize: "20px" }}
        >
          WalletGuard
        </div>

        {/* Search Card */}
        <div className="rounded-xl border w-full max-w-2xl mx-auto shadow-sm border-border/50 bg-card/50 backdrop-blur-sm">
          <div className="p-6">
            <form onSubmit={handleAnalyze} className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Ingrese dirección TRC20 (ej. T...)"
                  className="pl-10 h-12 bg-background border-input focus-visible:ring-primary text-base"
                  disabled={isAnalyzing}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsScannerOpen(true)}
                disabled={isAnalyzing}
                className="h-12 px-4 shrink-0 border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground"
              >
                <QrCode className="w-5 h-5 mr-2" />
                Escanear QR
              </Button>
              <Button
                type="submit"
                disabled={isAnalyzing}
                className="h-12 w-full sm:w-auto min-w-[140px] px-8"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analizando...
                  </>
                ) : (
                  "Analizar dirección"
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* Report or placeholder */}
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
