import { useEffect, useState, useRef } from "react";

const KEYFRAMES = `
@keyframes cc-splash-in {
  from { opacity: 0; transform: scale(0.93); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes cc-splash-out {
  from { opacity: 1; }
  to   { opacity: 0; }
}
@keyframes cc-icon-glow {
  0%, 100% {
    filter: drop-shadow(0 0 18px rgba(0,255,198,0.35))
            drop-shadow(0 0 40px rgba(0,184,169,0.18));
  }
  50% {
    filter: drop-shadow(0 0 36px rgba(0,255,198,0.65))
            drop-shadow(0 0 80px rgba(0,184,169,0.30));
  }
}
@keyframes cc-fade-up {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes cc-dot-pulse {
  0%, 100% { scale: 1;   box-shadow: 0 0 4px rgba(0,255,198,0.4); }
  50%       { scale: 1.2; box-shadow: 0 0 12px rgba(0,255,198,1);  }
}
`;

function injectKeyframes() {
  if (typeof document === "undefined") return;
  if (document.getElementById("cc-splash-kf")) return;
  const s = document.createElement("style");
  s.id = "cc-splash-kf";
  s.textContent = KEYFRAMES;
  document.head.appendChild(s);
}

// Non-linear increment per 50 ms tick to simulate realistic loading
function getIncrement(p: number): number {
  if (p < 30) return 1.00;   // fast:     0→30 in ~1.5 s
  if (p < 70) return 0.55;   // moderate: 30→70 in ~3.6 s
  if (p < 90) return 0.28;   // slow:     70→90 in ~3.6 s
  return 0.13;               // smooth:   90→100 in ~3.8 s
}

const MESSAGES = [
  "Conectando a la blockchain TRON...",
  "Sincronizando datos en tiempo real...",
  "Estableciendo conexión segura...",
  "Cargando información...",
  "Inicializando sistema...",
];
const FINAL_MSG    = "Sistema listo";
const MSG_FADE_MS  = 250;
const TOTAL_MS     = 10_000;   // 10 s visible splash
const FADEOUT_MS   = 600;

interface Props { onDone: () => void; }

export default function SplashScreen({ onDone }: Props) {
  const [phase, setPhase]         = useState<"in" | "hold" | "out">("in");
  const [progress, setProgress]   = useState(0);
  const [msgIdx, setMsgIdx]       = useState(0);
  const [msgVisible, setMsgVisible] = useState(true);
  const [showFinal, setShowFinal] = useState(false);

  const progressRef  = useRef(0);
  const doneRef      = useRef(false);

  // ── Screen lifecycle ─────────────────────────────────────────────────────
  useEffect(() => {
    injectKeyframes();
    const t1 = setTimeout(() => setPhase("hold"), 500);
    const t2 = setTimeout(() => setPhase("out"),  TOTAL_MS);
    const t3 = setTimeout(() => onDone(),         TOTAL_MS + FADEOUT_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  // ── Non-linear progress ticker (50 ms) ───────────────────────────────────
  useEffect(() => {
    const tick = setInterval(() => {
      if (progressRef.current >= 100) {
        clearInterval(tick);
        return;
      }
      const inc = getIncrement(progressRef.current);
      progressRef.current = Math.min(100, progressRef.current + inc);
      setProgress(Math.floor(progressRef.current));

      if (progressRef.current >= 100 && !doneRef.current) {
        doneRef.current = true;
        // Fade out current message, show final
        setMsgVisible(false);
        setTimeout(() => { setShowFinal(true); setMsgVisible(true); }, MSG_FADE_MS);
      }
    }, 50);
    return () => clearInterval(tick);
  }, []);

  // ── Message rotation (every 1.5 s) ───────────────────────────────────────
  useEffect(() => {
    const rotate = setInterval(() => {
      if (showFinal) return;
      setMsgVisible(false);
      setTimeout(() => {
        setMsgIdx(i => (i + 1) % MESSAGES.length);
        setMsgVisible(true);
      }, MSG_FADE_MS);
    }, 1500);
    return () => clearInterval(rotate);
  }, [showFinal]);

  const displayText = showFinal ? FINAL_MSG : MESSAGES[msgIdx];
  const pct         = Math.min(100, progress);

  return (
    <div
      style={{
        position:       "fixed",
        inset:          0,
        zIndex:         99999,
        background:     "linear-gradient(170deg, #0A0E18 0%, #0B1220 55%, #080C14 100%)",
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        animation: phase === "out"
          ? `cc-splash-out ${FADEOUT_MS}ms ease forwards`
          : "cc-splash-in 0.6s cubic-bezier(0.22,1,0.36,1) both",
        pointerEvents: phase === "out" ? "none" : "all",
      }}
    >
      {/* Ambient glow */}
      <div style={{
        position:      "absolute",
        top: "38%", left: "50%",
        transform:     "translate(-50%, -50%)",
        width: 340, height: 340,
        borderRadius:  "50%",
        background:    "radial-gradient(circle, rgba(0,255,198,0.09) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* Content */}
      <div style={{
        display:       "flex",
        flexDirection: "column",
        alignItems:    "center",
        gap:           28,
        animation:     "cc-splash-in 0.7s cubic-bezier(0.22,1,0.36,1) 0.08s both",
        padding:       "0 24px",
      }}>

        {/* Icon */}
        <img
          src="/cc-logo-icon-orig.png"
          alt="CoinCash icon"
          style={{
            width: 140, height: 140,
            objectFit:    "contain",
            mixBlendMode: "screen",
            animation:    "cc-icon-glow 2.6s ease-in-out infinite",
          }}
        />

        {/* Wordmark */}
        <div style={{
          display:       "inline-flex",
          alignItems:    "baseline",
          animation:     "cc-fade-up 0.6s ease 0.35s both",
          fontFamily:    "'Inter','Helvetica Neue',Arial,sans-serif",
          fontWeight:    800,
          fontSize:      "clamp(30px, 9vw, 40px)",
          letterSpacing: "-0.5px",
          lineHeight:    1,
          userSelect:    "none",
          color:         "#FFFFFF",
        }}>
          <span>Co</span>
          <span style={{ position: "relative", display: "inline-block", lineHeight: "inherit" }}>
            ı
            <span style={{
              position:        "absolute",
              bottom:          "100%",
              left:            "50%",
              marginBottom:    "1px",
              display:         "block",
              width:  8, height: 8,
              borderRadius:    "50%",
              background:      "#00FFC6",
              transform:       "translateX(-50%)",
              transformOrigin: "center center",
              boxShadow:       "0 0 8px rgba(0,255,198,0.8)",
              animation:       "cc-dot-pulse 1.5s ease-in-out infinite",
            }} />
          </span>
          <span>n</span>
          <span style={{ color: "#00DCA0" }}>Cash</span>
        </div>

        {/* Dynamic message */}
        <div style={{ height: 20, display: "flex", alignItems: "center", justifyContent: "center", animation: "cc-fade-up 0.5s ease 0.6s both" }}>
          <p style={{
            margin:        0,
            fontSize:      12,
            letterSpacing: "0.04em",
            textAlign:     "center",
            fontFamily:    "'Inter',system-ui,sans-serif",
            fontWeight:    400,
            color:         showFinal ? "rgba(0,255,198,0.85)" : "rgba(255,255,255,0.60)",
            transition:    `opacity ${MSG_FADE_MS}ms ease, color 400ms ease`,
            opacity:       msgVisible ? 1 : 0,
            whiteSpace:    "nowrap",
          }}>
            {displayText}
          </p>
        </div>

        {/* Progress bar + percentage */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, animation: "cc-fade-up 0.4s ease 0.7s both" }}>

          {/* Bar */}
          <div style={{
            width:        "min(220px, 60vw)",
            height:       2,
            background:   "rgba(255,255,255,0.07)",
            borderRadius: 2,
            overflow:     "hidden",
          }}>
            <div style={{
              height:       "100%",
              width:        `${pct}%`,
              background:   "linear-gradient(90deg, #00B8A9, #00FFC6)",
              borderRadius: 2,
              transition:   "width 80ms linear",
            }} />
          </div>

          {/* Percentage */}
          <span style={{
            fontSize:      11,
            fontFamily:    "'Inter',system-ui,sans-serif",
            fontWeight:    500,
            letterSpacing: "0.06em",
            color:         pct === 100
              ? "rgba(0,255,198,0.80)"
              : "rgba(255,255,255,0.30)",
            transition:    "color 400ms ease",
            tabularNums:   true as any,
            fontVariantNumeric: "tabular-nums",
          }}>
            {pct}%
          </span>
        </div>
      </div>
    </div>
  );
}
