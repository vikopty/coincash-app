import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2, Database, Globe, LineChart, Lock, Search } from "lucide-react";

const STEPS = [
  { icon: Globe,     label: "Escaneando blockchain",            detail: "Obteniendo datos de cuenta TRON..." },
  { icon: Search,    label: "Verificando transferencias TRC20", detail: "Analizando hasta 150 movimientos..." },
  { icon: LineChart, label: "Analizando patrones de riesgo",    detail: "Evaluando contrapartes y volumen..." },
  { icon: Database,  label: "Verificando base de datos blacklist", detail: "Cruzando con eventos AddedBlackList..." },
  { icon: Lock,      label: "Calculando puntuación de riesgo",  detail: "Generando informe final..." },
];

const STEP_DURATION = 1800; // ms per step

interface ScanningAnimationProps {
  isAnalyzing: boolean;
}

export default function ScanningAnimation({ isAnalyzing }: ScanningAnimationProps) {
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

  return (
    <AnimatePresence>
      <motion.div
        key="scanning"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.4 }}
        className="w-full rounded-xl border overflow-hidden mt-6"
        style={{
          borderColor: "rgba(31,189,20,0.3)",
          background: "linear-gradient(160deg, rgba(31,189,20,0.05) 0%, rgba(0,0,0,0) 50%)",
        }}
      >
        {/* Terminal header */}
        <div
          className="flex items-center gap-2 px-4 py-2.5 border-b"
          style={{ borderColor: "rgba(31,189,20,0.15)", background: "rgba(31,189,20,0.08)" }}
        >
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(31,189,20,0.8)" }} />
          </div>
          <span className="text-xs font-mono" style={{ color: "rgba(31,189,20,0.8)" }}>
            coincash-walletguard ~ análisis en progreso
          </span>
          <Loader2 className="w-3.5 h-3.5 ml-auto animate-spin" style={{ color: "#1fbd14" }} />
        </div>

        {/* Scan progress bar */}
        <div className="h-0.5 bg-muted/30 relative overflow-hidden">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ background: "linear-gradient(90deg, #1fbd14, #22d3ee)" }}
            initial={{ width: "0%" }}
            animate={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
            transition={{ duration: 0.6, ease: "easeInOut" }}
          />
          {/* Shimmer */}
          <motion.div
            className="absolute inset-y-0 w-16 opacity-60"
            style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)" }}
            animate={{ left: ["0%", "100%"] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
          />
        </div>

        {/* Steps */}
        <div className="p-5 space-y-3">
          {STEPS.map((step, i) => {
            const isDone = completedSteps.includes(i);
            const isActive = currentStep === i;
            const StepIcon = step.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{
                  opacity: isDone || isActive ? 1 : 0.3,
                  x: 0,
                }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
                className="flex items-center gap-3"
              >
                {/* Icon circle */}
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border transition-all duration-300"
                  style={
                    isDone
                      ? { borderColor: "#1fbd14", background: "rgba(31,189,20,0.15)", color: "#1fbd14" }
                      : isActive
                      ? { borderColor: "#22d3ee", background: "rgba(34,211,238,0.1)", color: "#22d3ee" }
                      : { borderColor: "rgba(255,255,255,0.08)", background: "transparent", color: "rgba(255,255,255,0.2)" }
                  }
                >
                  {isDone ? (
                    <Check className="w-4 h-4" />
                  ) : isActive ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <StepIcon className="w-4 h-4" />
                  )}
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <div
                    className="text-sm font-semibold transition-colors duration-300"
                    style={isDone ? { color: "#1fbd14" } : isActive ? { color: "#e2e8f0" } : { color: "rgba(255,255,255,0.3)" }}
                  >
                    {step.label}
                  </div>
                  {isActive && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="text-xs text-muted-foreground font-mono mt-0.5"
                    >
                      {step.detail}
                    </motion.div>
                  )}
                </div>

                {/* Status */}
                <div className="shrink-0 text-xs font-mono">
                  {isDone ? (
                    <span style={{ color: "#1fbd14" }}>OK</span>
                  ) : isActive ? (
                    <motion.span
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 0.9, repeat: Infinity }}
                      style={{ color: "#22d3ee" }}
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

          {/* Bottom status line */}
          <div className="pt-2 border-t border-border/20 flex items-center gap-2">
            <motion.div
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
              className="w-2 h-2 rounded-full"
              style={{ background: "#1fbd14" }}
            />
            <span className="text-xs font-mono text-muted-foreground">
              {currentStep < STEPS.length - 1
                ? `Paso ${currentStep + 1} de ${STEPS.length} — procesando...`
                : "Finalizando análisis..."}
            </span>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
