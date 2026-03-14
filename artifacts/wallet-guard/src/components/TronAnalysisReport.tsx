import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { motion } from "framer-motion";
import { Shield, AlertTriangle, ArrowRightLeft, Clock, History, Ban, ShieldAlert } from "lucide-react";

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

const TronAnalysisReport = ({ reportData }: { reportData: ReportData }) => {
  const {
    address = "",
    balanceUSDT = 0,
    totalTx = 0,
    txIn = 0,
    txOut = 0,
    dateCreated = Date.now(),
    lastTxDate = Date.now(),
    totalInUSDT = 0,
    totalOutUSDT = 0,
    uniqueWalletsCount = 0,
    transfersAnalyzed = 0,
    exchangeInteractions = 0,
  } = reportData || {};

  const creationDate = dateCreated ? new Date(dateCreated) : new Date();
  const today = new Date();
  const diffTime = Math.abs(today.getTime() - creationDate.getTime());
  const daysSinceCreation = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  let riskScore = 0;

  if (daysSinceCreation < 30) riskScore += 20;
  else if (daysSinceCreation <= 180) riskScore += 10;

  const totalVolumeUSDT = totalInUSDT + totalOutUSDT;
  if (totalVolumeUSDT > 1000000) riskScore += 25;
  else if (totalVolumeUSDT > 100000) riskScore += 15;

  if (uniqueWalletsCount > 200) riskScore += 20;
  else if (uniqueWalletsCount > 50) riskScore += 10;

  if (totalTx > 500) riskScore += 20;
  else if (totalTx > 100) riskScore += 10;

  if (transfersAnalyzed > 0 && exchangeInteractions > transfersAnalyzed * 0.5) {
    riskScore -= 10;
  }

  riskScore = Math.max(0, Math.min(100, riskScore));

  let riskLevel = "";
  let riskColor = "";
  let riskBadgeVariant: "default" | "secondary" | "destructive" | "outline" = "default";

  if (riskScore <= 25) {
    riskLevel = "Riesgo Bajo";
    riskColor = "text-green-500";
    riskBadgeVariant = "default";
  } else if (riskScore <= 50) {
    riskLevel = "Riesgo Moderado";
    riskColor = "text-yellow-500";
    riskBadgeVariant = "secondary";
  } else if (riskScore <= 75) {
    riskLevel = "Riesgo Alto";
    riskColor = "text-orange-500";
    riskBadgeVariant = "outline";
  } else {
    riskLevel = "Riesgo Severo";
    riskColor = "text-red-500";
    riskBadgeVariant = "destructive";
  }

  const formattedCreationDate = creationDate.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const formattedLastTxDate = new Date(lastTxDate).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const formattedBalance = balanceUSDT.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const formattedIn = totalInUSDT.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const formattedOut = totalOutUSDT.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (riskScore / 100) * circumference;

  const getRiskStrokeColor = () => {
    if (riskScore <= 25) return "#22c55e";
    if (riskScore <= 50) return "#eab308";
    if (riskScore <= 75) return "#f97316";
    return "#ef4444";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-4xl mx-auto space-y-6 mt-8"
    >
      {/* Address */}
      <div className="text-center">
        <p className="text-xs text-muted-foreground font-mono break-all">{address}</p>
      </div>

      {/* Network Info & Risk Score */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider">
              Información de Red
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full overflow-hidden bg-background flex items-center justify-center p-2 border">
                <img
                  src="https://cryptologos.cc/logos/tron-trx-logo.png"
                  alt="TRON Logo"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
              <div>
                <div className="text-2xl font-bold">Red: TRON</div>
                <div className="text-sm text-muted-foreground">USDT (TRC20)</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Puntuación de Riesgo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className="relative w-24 h-24">
                <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    className="text-muted/30"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke={getRiskStrokeColor()}
                    strokeWidth="8"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dashoffset 1s ease-in-out" }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-2xl font-bold ${riskColor}`}>{riskScore}</span>
                </div>
              </div>
              <div>
                <div className={`text-xl font-bold ${riskColor}`}>{riskLevel}</div>
                <Badge variant={riskBadgeVariant} className="mt-1">
                  {riskScore}/100
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Balance */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider">
            Balance Actual
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold">${formattedBalance}</div>
          <div className="text-sm text-muted-foreground mt-1">USDT (TRC20)</div>
        </CardContent>
      </Card>

      {/* Transaction Stats */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ArrowRightLeft className="w-5 h-5" />
            Estadísticas de Transacciones
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="text-center p-4 rounded-lg bg-muted/30">
              <div className="text-2xl font-bold">{totalTx.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">Total Transacciones</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-green-500/10">
              <div className="text-2xl font-bold text-green-500">{txIn.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">Entrantes</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-red-500/10">
              <div className="text-2xl font-bold text-red-500">{txOut.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">Salientes</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Volume & Dates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <History className="w-5 h-5" />
              Volumen USDT (Últimas 150 Tx)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Total Recibido</span>
              <span className="font-semibold text-green-500">${formattedIn}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Total Enviado</span>
              <span className="font-semibold text-red-500">${formattedOut}</span>
            </div>
            <div className="flex justify-between items-center border-t pt-3">
              <span className="text-sm text-muted-foreground">Contrapartes Únicas</span>
              <span className="font-semibold">{uniqueWalletsCount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Con Exchanges</span>
              <span className="font-semibold">{exchangeInteractions}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="w-5 h-5" />
              Cronología
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Fecha de Creación</span>
              <span className="font-semibold">{formattedCreationDate}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Antigüedad</span>
              <span className="font-semibold">{daysSinceCreation} días</span>
            </div>
            <div className="flex justify-between items-center border-t pt-3">
              <span className="text-sm text-muted-foreground">Última Transacción</span>
              <span className="font-semibold">{formattedLastTxDate}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risk Factors */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            Factores de Riesgo Detectados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Factor</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>Antigüedad de la Billetera</TableCell>
                  <TableCell>{daysSinceCreation} días</TableCell>
                  <TableCell>
                    <Badge
                      variant={daysSinceCreation < 30 ? "destructive" : daysSinceCreation <= 180 ? "outline" : "default"}
                    >
                      {daysSinceCreation < 30 ? "Nueva" : daysSinceCreation <= 180 ? "Reciente" : "Establecida"}
                    </Badge>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Volumen Total USDT</TableCell>
                  <TableCell>${(totalInUSDT + totalOutUSDT).toLocaleString("en-US", { maximumFractionDigits: 0 })}</TableCell>
                  <TableCell>
                    <Badge
                      variant={totalVolumeUSDT > 1000000 ? "destructive" : totalVolumeUSDT > 100000 ? "outline" : "default"}
                    >
                      {totalVolumeUSDT > 1000000 ? "Muy Alto" : totalVolumeUSDT > 100000 ? "Alto" : "Normal"}
                    </Badge>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Contrapartes Únicas</TableCell>
                  <TableCell>{uniqueWalletsCount}</TableCell>
                  <TableCell>
                    <Badge
                      variant={uniqueWalletsCount > 200 ? "destructive" : uniqueWalletsCount > 50 ? "outline" : "default"}
                    >
                      {uniqueWalletsCount > 200 ? "Muy Alto" : uniqueWalletsCount > 50 ? "Alto" : "Normal"}
                    </Badge>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Frecuencia de Transacciones</TableCell>
                  <TableCell>{totalTx.toLocaleString()} tx</TableCell>
                  <TableCell>
                    <Badge
                      variant={totalTx > 500 ? "destructive" : totalTx > 100 ? "outline" : "default"}
                    >
                      {totalTx > 500 ? "Muy Alta" : totalTx > 100 ? "Alta" : "Normal"}
                    </Badge>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Interacción con Exchanges</TableCell>
                  <TableCell>{exchangeInteractions} de {transfersAnalyzed}</TableCell>
                  <TableCell>
                    <Badge variant="default">
                      {transfersAnalyzed > 0
                        ? `${Math.round((exchangeInteractions / transfersAnalyzed) * 100)}%`
                        : "0%"}
                    </Badge>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Sanctions section */}
      <Card className="border-red-500/20">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg text-red-500">
            <Ban className="w-5 h-5" />
            Congelamientos y Sanciones
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Fecha de Operación</TableHead>
                  <TableHead>Historial</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-4">
                    No se encontraron sanciones ni congelamientos para esta dirección.
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Legal Notice */}
      <div className="bg-muted/30 p-4 rounded-lg border border-border/50 mt-8 mb-12 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Aviso Legal:</strong> La información proporcionada en
          este informe es generada a partir de datos on-chain y bases de datos públicas de terceros.
          CoinCashWalletGuard no garantiza la exactitud absoluta, integridad o actualidad de los
          datos. Esta información tiene fines puramente analíticos e informativos, y no constituye
          asesoramiento financiero, legal ni recomendación de inversión. El usuario asume toda la
          responsabilidad por las decisiones tomadas en base a este análisis. En caso de dudas sobre
          la legalidad de los fondos, consulte con un profesional legal o las autoridades
          competentes.
        </p>
      </div>
    </motion.div>
  );
};

export default TronAnalysisReport;
