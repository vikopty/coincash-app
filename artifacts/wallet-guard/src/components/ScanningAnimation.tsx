import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2, Database, Globe, LineChart, Lock, Search, Clock } from "lucide-react";

const STEPS = [
  { icon: Globe,     label: "Escaneando blockchain",               detail: "Obteniendo datos de cuenta TRON...",          status: "OK" },
  { icon: Search,    label: "Verificando transferencias TRC20",    detail: "Analizando hasta 150 movimientos...",         status: "OK" },
  { icon: LineChart, label: "Analizando patrones de riesgo",       detail: "Evaluando contrapartes y volumen...",         status: "OK" },
  { icon: Database,  label: "Verificando base de datos blacklist", detail: "Cruzando con eventos AddedBlackList...",      status: "loading" },
  { icon: Lock,      label: "Calculando puntuación de riesgo",     detail: "Generando informe final...",                  status: "pending" },
];

const STEP_DURATION = 1800;

interface ScanningAnimationProps {
  isAnalyzing: boolean;
  waitingMessage?: string | null;
}

export default function ScanningAnimation({ isAnalyzing, waitingMessage }: ScanningAnimationProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);

  useEffect(() => {
    if (!isAnalyzing) {
      setCurrentStep(0);
      setCompletedSteps([]);
      return;
    }
    setCurrentStep(0);
    setCompletedSteps([]);
    const timers: ReturnType<typeof setTimeout>[] = [];
    STEPS.forEach((_, i) => {
      if (i === 0) return;
      timers.push(
        setTimeout(() => {
          setCompletedSteps((prev) => [...prev, i - 1]);
          setCurrentStep(i);
        }, i * STEP_DURATION)
      );
    });
    return () => timers.forEach(clearTimeout);
  }, [isAnalyzing]);

  if (!isAnalyzing) return null;

  const progress = ((currentStep + 1) / STEPS.length) * 100;

  return (
    <AnimatePresence>
      <motion.div
        key="scanning"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.4 }}
        style={{
          width: "100%",
          marginTop: "24px",
          borderRadius: "16px",
          border: "1.5px solid rgba(0,255,198,0.35)",
          background: "linear-gradient(160deg, rgba(0,255,198,0.04) 0%, rgba(11,18,32,0.98) 60%)",
          boxShadow: "0 0 32px rgba(0,255,198,0.12), 0 0 8px rgba(0,255,198,0.08), inset 0 1px 0 rgba(0,255,198,0.08)",
          overflow: "hidden",
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
        }}
      >
        {/* ── Terminal title bar ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "10px 16px",
            borderBottom: "1px solid rgba(0,255,198,0.12)",
            background: "rgba(0,255,198,0.06)",
          }}
        >
          {/* Traffic lights */}
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#ff5f57", display: "block" }} />
            <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#febc2e", display: "block" }} />
            <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#28c840", display: "block" }} />
          </div>
          <span style={{ flex: 1, fontSize: "11px", color: "rgba(0,255,198,0.85)", letterSpacing: "0.03em" }}>
            coincash-walletguard ~ análisis en progreso
          </span>
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}>
            <Loader2 style={{ width: "13px", height: "13px", color: "#00FFC6" }} />
          </motion.div>
        </div>

        {/* ── Progress bar ── */}
        <div style={{ height: "3px", background: "rgba(255,255,255,0.05)", position: "relative", overflow: "hidden" }}>
          <motion.div
            style={{
              position: "absolute",
              inset: 0,
              left: 0,
              background: "linear-gradient(90deg, #00FFC6 0%, #22d3ee 100%)",
              boxShadow: "0 0 8px rgba(0,255,198,0.8)",
              borderRadius: "9999px",
            }}
            initial={{ width: "0%" }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.7, ease: "easeInOut" }}
          />
          <motion.div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              width: "60px",
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)",
              opacity: 0.6,
            }}
            animate={{ left: ["-60px", "100%"] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
          />
        </div>

        {/* ── Steps ── */}
        <div style={{ padding: "20px 20px 8px" }}>
          {STEPS.map((step, i) => {
            const isDone = completedSteps.includes(i);
            const isActive = currentStep === i;
            const isPending = !isDone && !isActive;
            const StepIcon = step.icon;

            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: isPending ? 0.28 : 1, x: 0 }}
                transition={{ duration: 0.3, delay: i * 0.06 }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "14px",
                }}
              >
                {/* Status icon */}
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "8px",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px solid",
                    transition: "all 0.3s",
                    ...(isDone
                      ? { borderColor: "#00FFC6", background: "rgba(0,255,198,0.12)", color: "#00FFC6" }
                      : isActive
                      ? { borderColor: "#60a5fa", background: "rgba(96,165,250,0.1)", color: "#60a5fa" }
                      : { borderColor: "rgba(255,255,255,0.08)", background: "transparent", color: "rgba(255,255,255,0.18)" }),
                  }}
                >
                  {isDone ? (
                    <Check style={{ width: "14px", height: "14px" }} />
                  ) : isActive ? (
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                      <Loader2 style={{ width: "14px", height: "14px" }} />
                    </motion.div>
                  ) : (
                    <StepIcon style={{ width: "14px", height: "14px" }} />
                  )}
                </div>

                {/* Label + detail */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "12.5px",
                      fontWeight: 600,
                      letterSpacing: "0.01em",
                      transition: "color 0.3s",
                      ...(isDone
                        ? { color: "#00FFC6" }
                        : isActive
                        ? { color: "#e2e8f0" }
                        : { color: "rgba(255,255,255,0.25)" }),
                    }}
                  >
                    {step.label}
                  </div>
                  {isActive && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      style={{ fontSize: "10.5px", color: "rgba(96,165,250,0.75)", marginTop: "2px" }}
                    >
                      {step.detail}
                    </motion.div>
                  )}
                </div>

                {/* Right status badge */}
                <div style={{ flexShrink: 0, fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em" }}>
                  {isDone ? (
                    <span
                      style={{
                        color: "#00FFC6",
                        background: "rgba(0,255,198,0.1)",
                        border: "1px solid rgba(0,255,198,0.25)",
                        borderRadius: "4px",
                        padding: "1px 7px",
                      }}
                    >
                      OK
                    </span>
                  ) : isActive ? (
                    <motion.span
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 0.8, repeat: Infinity }}
                      style={{
                        color: "#60a5fa",
                        background: "rgba(96,165,250,0.1)",
                        border: "1px solid rgba(96,165,250,0.2)",
                        borderRadius: "4px",
                        padding: "1px 7px",
                        display: "inline-block",
                      }}
                    >
                      ...
                    </motion.span>
                  ) : (
                    <span style={{ color: "rgba(255,255,255,0.15)" }}>—</span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* ── Warning box (rate limit) ── */}
        <div style={{ padding: "0 20px" }}>
          <AnimatePresence>
            {waitingMessage && (
              <motion.div
                key="waiting"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                style={{ overflow: "hidden", marginBottom: "12px" }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                    borderRadius: "10px",
                    padding: "12px 14px",
                    border: "1px solid rgba(251,191,36,0.35)",
                    background: "rgba(251,191,36,0.06)",
                    boxShadow: "0 0 16px rgba(251,191,36,0.08)",
                  }}
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
                    style={{ marginTop: "1px", flexShrink: 0 }}
                  >
                    <Clock style={{ width: "14px", height: "14px", color: "#fbbf24" }} />
                  </motion.div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "11.5px", fontWeight: 700, color: "#fbbf24", marginBottom: "3px" }}>
                      Esperando respuesta de blockchain...
                    </div>
                    <div style={{ fontSize: "10.5px", color: "rgba(251,191,36,0.6)" }}>
                      TronGrid rate limit — reintentando en 10s
                    </div>
                  </div>
                  <motion.span
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      color: "#fbbf24",
                      background: "rgba(251,191,36,0.15)",
                      border: "1px solid rgba(251,191,36,0.3)",
                      borderRadius: "4px",
                      padding: "2px 6px",
                      flexShrink: 0,
                    }}
                  >
                    429
                  </motion.span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Footer status ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 20px 14px",
            borderTop: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <motion.div
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.4, repeat: Infinity }}
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              flexShrink: 0,
              background: waitingMessage ? "#fbbf24" : "#00FFC6",
              boxShadow: waitingMessage ? "0 0 6px #fbbf24" : "0 0 6px #00FFC6",
            }}
          />
          <span style={{ fontSize: "10.5px", color: "rgba(255,255,255,0.35)", letterSpacing: "0.02em" }}>
            {waitingMessage
              ? "En pausa — esperando respuesta de blockchain..."
              : currentStep < STEPS.length - 1
              ? `Paso ${currentStep + 1} de ${STEPS.length} — procesando...`
              : "Finalizando análisis..."}
          </span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
