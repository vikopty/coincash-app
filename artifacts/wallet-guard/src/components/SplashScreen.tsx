import { useEffect, useState } from "react";

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
  0%, 100% {
    opacity: 1;
    transform: translateX(-50%) scale(1);
    box-shadow: 0 0 6px 3px rgba(0,220,160,0.55);
  }
  50% {
    opacity: 0.35;
    transform: translateX(-50%) scale(1.2);
    box-shadow: 0 0 14px 6px rgba(0,220,160,0.20);
  }
}
@keyframes cc-bar-fill {
  from { width: 0%; }
  to   { width: 100%; }
}
@keyframes cc-text-pulse {
  0%, 100% { opacity: 0.35; }
  50%       { opacity: 0.55; }
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

interface Props {
  onDone: () => void;
}

const MIN_MS     = 3000;
const FADEOUT_MS = 600;

export default function SplashScreen({ onDone }: Props) {
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");

  useEffect(() => {
    injectKeyframes();
    const t1 = setTimeout(() => setPhase("hold"), 500);
    const t2 = setTimeout(() => setPhase("out"), MIN_MS);
    const t3 = setTimeout(() => onDone(), MIN_MS + FADEOUT_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

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
      {/* Ambient radial glow behind logo */}
      <div style={{
        position:      "absolute",
        top:           "38%",
        left:          "50%",
        transform:     "translate(-50%, -50%)",
        width:         340,
        height:        340,
        borderRadius:  "50%",
        background:    "radial-gradient(circle, rgba(0,255,198,0.09) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* Content wrapper */}
      <div style={{
        display:       "flex",
        flexDirection: "column",
        alignItems:    "center",
        gap:           28,
        animation:     "cc-splash-in 0.7s cubic-bezier(0.22,1,0.36,1) 0.08s both",
        padding:       "0 24px",
      }}>

        {/* ── Icon logo — original image, mix-blend-mode:screen makes black transparent ── */}
        <img
          src="/cc-logo-icon-orig.png"
          alt="CoinCash icon"
          style={{
            width:        140,
            height:       140,
            objectFit:    "contain",
            mixBlendMode: "screen",
            animation:    "cc-icon-glow 2.6s ease-in-out infinite",
          }}
        />

        {/* ── Wordmark: "i" wraps the dot so position is relative to the letter ── */}
        <div style={{
          display:       "inline-flex",
          alignItems:    "baseline",
          animation:     "cc-fade-up 0.6s ease 0.35s both",
          fontFamily:    "'Inter', 'Helvetica Neue', Arial, sans-serif",
          fontWeight:    800,
          fontSize:      "clamp(30px, 9vw, 40px)",
          letterSpacing: "-0.5px",
          lineHeight:    1,
          userSelect:    "none",
          color:         "#FFFFFF",
        }}>
          {/* "Co" plain */}
          <span>Co</span>

          {/* "i" container — dot lives here, centered on the letter */}
          <span style={{ position: "relative", display: "inline-block" }}>
            {/* The letter i */}
            i
            {/* Dot: absolute, centered on the i's tittle position */}
            <span style={{
              position:     "absolute",
              top:          "-10px",
              left:         "50%",
              display:      "block",
              width:        8,
              height:       8,
              borderRadius: "50%",
              background:   "#00DCA0",
              animation:    "cc-dot-pulse 1.5s ease-in-out 0.9s infinite",
            }} />
          </span>

          {/* "n" plain */}
          <span>n</span>

          {/* "Cash" in green */}
          <span style={{ color: "#00DCA0" }}>Cash</span>
        </div>

        {/* ── Tagline ── */}
        <p style={{
          margin:        0,
          fontSize:      13,
          color:         "rgba(255,255,255,0.40)",
          letterSpacing: "0.05em",
          textAlign:     "center",
          fontFamily:    "'Inter', system-ui, sans-serif",
          fontWeight:    400,
          animation:     "cc-fade-up 0.6s ease 0.55s both, cc-text-pulse 3s ease 1.2s infinite",
        }}>
          Análisis de seguridad TRON en tiempo real
        </p>

        {/* ── Loading progress bar ── */}
        <div style={{
          width:        "min(200px, 55vw)",
          height:       2,
          background:   "rgba(255,255,255,0.07)",
          borderRadius: 2,
          overflow:     "hidden",
          animation:    "cc-fade-up 0.4s ease 0.7s both",
        }}>
          <div style={{
            height:       "100%",
            background:   "linear-gradient(90deg, #00B8A9, #00FFC6, #00B8A9)",
            borderRadius: 2,
            width:        "0%",
            animation:    `cc-bar-fill ${MIN_MS - 400}ms cubic-bezier(0.4,0,0.6,1) 0.7s forwards`,
          }} />
        </div>
      </div>
    </div>
  );
}
