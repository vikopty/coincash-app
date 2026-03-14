import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { motion } from "framer-motion";
import { History, AlertTriangle, ArrowRightLeft, Ban, ShieldAlert } from "lucide-react";

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
}

const TronAnalysisReport = ({ reportData }: { reportData: ReportData }) => {
  const {
    address = "",
    accountType = "Normal",
    isFrozen = false,
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

  if (isFrozen) {
    riskScore = 100;
    riskLevel = "RISK LEVEL: CRITICAL";
    riskColor = "text-red-500";
  } else if (riskScore <= 25) {
    riskLevel = "Riesgo Bajo";
    riskColor = "text-green-500";
  } else if (riskScore <= 50) {
    riskLevel = "Riesgo Moderado";
    riskColor = "text-yellow-500";
  } else if (riskScore <= 75) {
    riskLevel = "Riesgo Alto";
    riskColor = "text-orange-500";
  } else {
    riskLevel = "Riesgo Severo";
    riskColor = "text-red-500";
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

  // Which risk segments are active (full opacity vs 20%)
  const seg1Active = riskScore > 0;   // Bajo    0-25
  const seg2Active = riskScore > 25;  // Moderado 25-50
  const seg3Active = riskScore > 50;  // Alto     50-75
  const seg4Active = riskScore > 75;  // Severo   75-100

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-4xl mx-auto space-y-6 mt-8"
    >
      {/* USDT Frozen Warning */}
      {isFrozen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-4 rounded-lg border border-red-500 bg-red-500/10 px-5 py-4"
        >
          <Ban className="h-7 w-7 shrink-0 text-red-500" />
          <div className="flex-1 space-y-0.5">
            <p className="font-bold uppercase tracking-widest text-red-500">
              STATUS: BLOCKED
            </p>
            <p className="text-sm text-red-400">LABEL: USDT FROZEN ADDRESS</p>
          </div>
          <Badge variant="destructive" className="shrink-0 px-3 py-1 text-xs uppercase tracking-widest">
            RISK LEVEL: CRITICAL
          </Badge>
        </motion.div>
      )}

      {/* Network Info & Risk Score */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Network Info */}
        <Card className="rounded-xl border bg-card shadow">
          <CardHeader className="pb-2">
            <CardTitle className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
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

        {/* Risk Score — linear 4-segment bar */}
        <Card className="rounded-xl border bg-card shadow">
          <CardHeader className="pb-2">
            <CardTitle className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
              Puntuación de Riesgo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-end">
                <span className={`text-3xl font-bold ${riskColor}`}>{riskScore}/100</span>
                <span className={`text-sm font-medium ${riskColor}`}>{riskLevel}</span>
              </div>
              {/* 4-segment bar with position indicator */}
              <div className="w-full h-3 bg-secondary rounded-full overflow-hidden flex relative">
                <div className={`h-full bg-green-500 w-1/4 ${seg1Active ? "" : "opacity-20"}`} />
                <div className={`h-full bg-yellow-500 w-1/4 ${seg2Active ? "" : "opacity-20"}`} />
                <div className={`h-full bg-orange-500 w-1/4 ${seg3Active ? "" : "opacity-20"}`} />
                <div className={`h-full bg-red-500 w-1/4 ${seg4Active ? "" : "opacity-20"}`} />
                <div
                  className="absolute top-0 bottom-0 w-1 bg-background"
                  style={{ left: `calc(${riskScore}% - 2px)` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>Bajo</span>
                <span>Moderado</span>
                <span>Alto</span>
                <span>Severo</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activity Summary */}
      <Card className="rounded-xl border bg-card shadow">
        <CardHeader className="pb-2">
          <CardTitle className="font-semibold tracking-tight flex items-center gap-2 text-lg">
            <History className="w-5 h-5 text-primary" />
            Resumen de Actividad
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Top stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1 bg-background/50 p-3 rounded-lg border border-border/50">
              <span className="text-xs text-muted-foreground">Estado</span>
              <div className="font-semibold flex items-center gap-1.5 text-green-500">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Activo
              </div>
            </div>
            <div className="space-y-1 bg-background/50 p-3 rounded-lg border border-border/50">
              <span className="text-xs text-muted-foreground">Balance Total</span>
              <div className="font-semibold text-lg">{formattedBalance} USDT</div>
            </div>
            <div className="space-y-1 bg-background/50 p-3 rounded-lg border border-border/50">
              <span className="text-xs text-muted-foreground">Wallet creada</span>
              <div className="font-medium text-sm">{formattedCreationDate}</div>
            </div>
            <div className="space-y-1 bg-background/50 p-3 rounded-lg border border-border/50">
              <span className="text-xs text-muted-foreground">Días de creada</span>
              <div className="font-medium text-sm">{daysSinceCreation} días</div>
            </div>
          </div>

          {/* Entradas / Salidas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="bg-background/50 p-4 rounded-lg border border-border/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/10 text-green-500 rounded-full">
                  <ArrowRightLeft className="w-5 h-5 rotate-90" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Entradas Totales</div>
                  <div className="font-bold text-xl">{formattedIn} USDT</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium">{txIn.toLocaleString()} Txns</div>
              </div>
            </div>
            <div className="bg-background/50 p-4 rounded-lg border border-border/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-500/10 text-red-500 rounded-full">
                  <ArrowRightLeft className="w-5 h-5 -rotate-90" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Salidas Totales</div>
                  <div className="font-bold text-xl">{formattedOut} USDT</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium">{txOut.toLocaleString()} Txns</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

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

      {/* Sanctions */}
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
                {isFrozen ? (
                  <TableRow>
                    <TableCell className="font-medium text-red-500">USDT Blacklist</TableCell>
                    <TableCell>{formattedLastTxDate}</TableCell>
                    <TableCell>
                      <Badge variant="destructive">Congelada</Badge>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-4">
                      No se encontraron sanciones ni congelamientos para esta dirección.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Address + account type info */}
      <div className="bg-muted/30 p-4 rounded-lg border border-border/50 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
        <div className="space-y-1 flex-1">
          <p className="text-xs text-muted-foreground font-mono break-all">{address}</p>
          <p className="text-xs text-muted-foreground">
            Tipo de cuenta: <span className="text-foreground font-medium">{accountType}</span>
            {" · "}Última transacción: <span className="text-foreground font-medium">{formattedLastTxDate}</span>
            {" · "}Contrapartes: <span className="text-foreground font-medium">{uniqueWalletsCount}</span>
          </p>
        </div>
      </div>

      {/* Legal Notice */}
      <div className="bg-muted/30 p-4 rounded-lg border border-border/50 mb-12 flex items-start gap-3">
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
