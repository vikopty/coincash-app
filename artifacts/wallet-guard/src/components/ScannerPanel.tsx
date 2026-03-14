import { useEffect, useState } from "react";
import { Activity, Ban, Clock, Shield, ShieldCheck, Wifi, Zap } from "lucide-react";
import { motion } from "framer-motion";

interface Stats {
  totalBlacklisted: number;
  lastFreezeTime: number | null;
}

interface ScannerPanelProps {
  analyzedToday: number;
  highRiskToday: number;
}

function useApiStats() {
  const [stats, setStats] = useState<Stats>({ totalBlacklisted: 0, lastFreezeTime: null });
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api-server/api/stats");
        if (res.ok) setStats(await res.json());
      } catch {}
    };
    load();
    const iv = setInterval(load, 60_000);
    return () => clearInterval(iv);
  }, []);
  return stats;
}

function formatFreezeTime(ts: number | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = diffMs / 3_600_000;
  if (diffH < 1) return `hace ${Math.round(diffMs / 60_000)} min`;
  if (diffH < 24) return `hace ${Math.round(diffH)} h`;
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const STATUS_ITEMS = [
  { label: "Red", value: "TRON", color: "#1fbd14", pulse: false },
  { label: "Token", value: "USDT (TRC20)", color: "#1fbd14", pulse: false },
  { label: "Motor de Riesgo", value: "Activo", color: "#22d3ee", pulse: true },
  { label: "Monitor Blacklist", value: "En Vivo", color: "#f87171", pulse: true },
];

export default function ScannerPanel({ analyzedToday, highRiskToday }: ScannerPanelProps) {
  const { totalBlacklisted, lastFreezeTime } = useApiStats();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(iv);
  }, []);

  const statCards = [
    {
      icon: <Shield className="w-5 h-5" />,
      label: "Billeteras analizadas hoy",
      value: analyzedToday.toLocaleString(),
      color: "#1fbd14",
      bg: "rgba(31,189,20,0.08)",
      border: "rgba(31,189,20,0.25)",
    },
    {
      icon: <Zap className="w-5 h-5" />,
      label: "Riesgos detectados hoy",
      value: highRiskToday.toLocaleString(),
      color: "#f97316",
      bg: "rgba(249,115,22,0.08)",
      border: "rgba(249,115,22,0.25)",
    },
    {
      icon: <Ban className="w-5 h-5" />,
      label: "Billeteras congeladas",
      value: totalBlacklisted.toLocaleString(),
      color: "#f87171",
      bg: "rgba(248,113,113,0.08)",
      border: "rgba(248,113,113,0.25)",
    },
    {
      icon: <Clock className="w-5 h-5" />,
      label: "Último congelamiento",
      value: formatFreezeTime(lastFreezeTime),
      color: "#22d3ee",
      bg: "rgba(34,211,238,0.08)",
      border: "rgba(34,211,238,0.25)",
    },
  ];

  return (
    <div className="w-full space-y-4">
      {/* Section title */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent to-border/40" />
        <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-border/40 bg-muted/20">
          <ShieldCheck className="w-3.5 h-3.5" style={{ color: "#1fbd14" }} />
          <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
            Wallet Security Scanner
          </span>
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: "#1fbd14" }}
          />
        </div>
        <div className="h-px flex-1 bg-gradient-to-l from-transparent to-border/40" />
      </div>

      {/* Status panel */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="rounded-xl border overflow-hidden"
        style={{
          borderColor: "rgba(31,189,20,0.2)",
          background: "linear-gradient(135deg, rgba(31,189,20,0.04) 0%, rgba(0,0,0,0) 60%)",
        }}
      >
        {/* Header bar */}
        <div
          className="flex items-center gap-2 px-4 py-2 border-b"
          style={{
            borderColor: "rgba(31,189,20,0.15)",
            background: "rgba(31,189,20,0.06)",
          }}
        >
          <Wifi className="w-3.5 h-3.5" style={{ color: "#1fbd14" }} />
          <span className="text-xs font-mono font-semibold tracking-wider" style={{ color: "#1fbd14" }}>
            SISTEMA DE ANÁLISIS BLOCKCHAIN — ONLINE
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="w-2 h-2 rounded-full bg-yellow-500" />
            <span className="w-2 h-2 rounded-full" style={{ background: "#1fbd14" }} />
          </div>
        </div>

        {/* Status grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border/20">
          {STATUS_ITEMS.map((item) => (
            <div
              key={item.label}
              className="flex flex-col gap-1 px-4 py-3 bg-background/80"
            >
              <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                {item.label}
              </span>
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${item.pulse ? "animate-pulse" : ""}`}
                  style={{ background: item.color }}
                />
                <span
                  className="text-sm font-bold font-mono"
                  style={{ color: item.color }}
                >
                  {item.value}
                </span>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Stats dashboard */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        {statCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, delay: 0.1 + i * 0.06 }}
            className="rounded-xl border p-4 flex flex-col gap-2 relative overflow-hidden"
            style={{ borderColor: card.border, background: card.bg }}
          >
            {/* Subtle corner glow */}
            <div
              className="absolute -top-4 -right-4 w-12 h-12 rounded-full blur-xl opacity-40"
              style={{ background: card.color }}
            />
            <div className="flex items-center justify-between relative">
              <div style={{ color: card.color }}>{card.icon}</div>
              <Activity className="w-3 h-3 text-muted-foreground/40" />
            </div>
            <div>
              <div
                className="text-2xl font-extrabold font-mono tabular-nums"
                style={{ color: card.color }}
              >
                {card.value}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 leading-tight">
                {card.label}
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
