import { Bell, ScanSearch, Ban, TrendingUp, ChevronRight } from "lucide-react";

interface DashboardPageProps {
  onNavigateToScanner?: () => void;
}

// Circular progress ring
function RingProgress({ pct, size = 72, stroke = 5 }: { pct: number; size?: number; stroke?: number }) {
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0,255,198,0.12)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="#00FFC6" strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
      />
      {/* pct label rendered outside via absolute positioning */}
    </svg>
  );
}

export default function DashboardPage({ onNavigateToScanner }: DashboardPageProps) {
  const score = 100;
  const analizadas = 8;
  const altoRiesgo = 0;
  const wallets = 1;

  const securityRows = [
    { label: "Contrato USDT",     value: "Activo",           color: "#22C55E" },
    { label: "Blacklist Monitor", value: "200 detectadas",   color: "#EF4444" },
    { label: "TronGrid API",      value: "Conectado",        color: "#22C55E" },
    { label: "Motor de riesgo",   value: "En línea",         color: "#22C55E" },
  ];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0B0F14",
      paddingBottom: "88px",
      overflowY: "auto",
    }}>

      {/* ── Header ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "52px 20px 16px",
      }}>
        <img
          src={`${import.meta.env.BASE_URL}logo.png`}
          alt="CoinCash"
          style={{ width: "140px", height: "auto", objectFit: "contain" }}
        />
        <button style={{
          width: "40px", height: "40px", borderRadius: "50%",
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.09)",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer",
        }}>
          <Bell style={{ width: 18, height: 18, color: "rgba(255,255,255,0.6)" }} />
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "24px", padding: "0 16px" }}>

        {/* ── SEGURIDAD DE RED card ── */}
        <div style={{
          background: "linear-gradient(145deg, #0E1E18 0%, #0B1A14 60%, #071410 100%)",
          border: "1px solid rgba(0,255,198,0.14)",
          borderRadius: "20px",
          padding: "20px",
          boxShadow: "0 4px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(0,255,198,0.06)",
        }}>
          <div style={{
            fontSize: "10px", fontWeight: 700, letterSpacing: "0.12em",
            color: "rgba(255,255,255,0.45)", marginBottom: "12px",
            textTransform: "uppercase",
          }}>
            Seguridad de Red
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {/* Score + status */}
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
                <span style={{ fontSize: "52px", fontWeight: 800, color: "#ffffff", lineHeight: 1 }}>
                  {score}
                </span>
                <span style={{ fontSize: "18px", color: "rgba(255,255,255,0.35)", fontWeight: 500 }}>
                  /100
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "6px" }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2.5 7.5L5.5 10.5L11.5 4" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span style={{ fontSize: "13px", color: "#22C55E", fontWeight: 600 }}>Red segura</span>
              </div>
            </div>

            {/* Ring */}
            <div style={{ position: "relative", width: "72px", height: "72px" }}>
              <RingProgress pct={score} size={72} stroke={5} />
              <div style={{
                position: "absolute", inset: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "12px", fontWeight: 700, color: "#00FFC6",
              }}>
                {score}%
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: "flex", gap: "8px", marginTop: "18px" }}>
            {[
              { value: analizadas, label: "Analizadas",  color: "#60A5FA" },
              { value: altoRiesgo, label: "Alto riesgo", color: "#F87171" },
              { value: wallets,    label: "Wallets",     color: "#60A5FA" },
            ].map((s) => (
              <div key={s.label} style={{
                flex: 1,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: "12px",
                padding: "10px 8px",
                textAlign: "center",
              }}>
                <div style={{ fontSize: "20px", fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.45)", marginTop: "2px" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── ACCIONES RÁPIDAS ── */}
        <div>
          <div style={{
            fontSize: "10px", fontWeight: 700, letterSpacing: "0.12em",
            color: "rgba(255,255,255,0.35)", marginBottom: "12px",
            textTransform: "uppercase",
          }}>
            Acciones Rápidas
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            {[
              {
                icon: <ScanSearch style={{ width: 24, height: 24, color: "#00FFC6" }} />,
                label: "Escanear",
                bg: "rgba(0,255,198,0.12)",
                border: "rgba(0,255,198,0.2)",
                onClick: onNavigateToScanner,
              },
              {
                icon: <Ban style={{ width: 24, height: 24, color: "#F87171" }} />,
                label: "Congelados",
                bg: "rgba(239,68,68,0.1)",
                border: "rgba(239,68,68,0.2)",
                onClick: undefined,
              },
              {
                icon: <TrendingUp style={{ width: 24, height: 24, color: "#F59E0B" }} />,
                label: "TRM 🇨🇴",
                bg: "rgba(245,158,11,0.1)",
                border: "rgba(245,158,11,0.2)",
                onClick: undefined,
              },
            ].map((a) => (
              <button
                key={a.label}
                onClick={a.onClick}
                style={{
                  flex: 1,
                  background: "#111827",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: "16px",
                  padding: "16px 8px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "10px",
                  cursor: a.onClick ? "pointer" : "default",
                }}
              >
                <div style={{
                  width: "48px", height: "48px", borderRadius: "14px",
                  background: a.bg, border: `1px solid ${a.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {a.icon}
                </div>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>
                  {a.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ── ESTADO DE SEGURIDAD ── */}
        <div>
          <div style={{
            fontSize: "10px", fontWeight: 700, letterSpacing: "0.12em",
            color: "rgba(255,255,255,0.35)", marginBottom: "12px",
            textTransform: "uppercase",
          }}>
            Estado de Seguridad
          </div>
          <div style={{
            background: "#111827",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: "16px",
            overflow: "hidden",
          }}>
            {securityRows.map((row, i) => (
              <div key={row.label} style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 16px",
                borderBottom: i < securityRows.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
              }}>
                <span style={{ fontSize: "14px", color: "rgba(255,255,255,0.8)", fontWeight: 500 }}>
                  {row.label}
                </span>
                <span style={{ fontSize: "13px", fontWeight: 600, color: row.color }}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── BLOCKCHAIN ── */}
        <div>
          <div style={{
            fontSize: "10px", fontWeight: 700, letterSpacing: "0.12em",
            color: "rgba(255,255,255,0.35)", marginBottom: "12px",
            textTransform: "uppercase",
          }}>
            Blockchain
          </div>
          <div style={{
            background: "#111827",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: "16px",
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            gap: "14px",
          }}>
            {/* TRON logo */}
            <div style={{
              width: "44px", height: "44px", borderRadius: "50%",
              background: "#CC0000",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <img
                src={`${import.meta.env.BASE_URL}tron-logo.png`}
                alt="TRON"
                style={{ width: "26px", height: "26px", objectFit: "contain" }}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
              <span style={{
                fontSize: "13px", fontWeight: 800, color: "#fff",
                display: "none",
              }}>T</span>
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "15px", fontWeight: 700, color: "#ffffff" }}>TRON Mainnet</div>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginTop: "2px" }}>
                USDT TRC20 · TronGrid
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{
                width: "8px", height: "8px", borderRadius: "50%",
                background: "#22C55E",
                boxShadow: "0 0 6px #22C55E",
              }} />
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#22C55E" }}>Live</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
