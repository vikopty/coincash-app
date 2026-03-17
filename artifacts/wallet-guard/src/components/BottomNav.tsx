import { ScanSearch, MessageSquare, Settings } from "lucide-react";

export type Tab = "scanner" | "mensajes" | "soporte" | "settings";

interface BottomNavProps {
  active: Tab;
  onChange: (tab: Tab) => void;
}

const TEAL  = "#00FFC6";
const MUTED = "rgba(255,255,255,0.35)";

function NavBtn({
  label, icon, active: isActive, onClick,
}: {
  label: string; icon: React.ReactNode; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 4, background: "none", border: "none", cursor: "pointer",
        padding: "8px 0", height: "100%",
      }}
    >
      <div style={{ color: isActive ? TEAL : MUTED, transition: "color 0.2s" }}>{icon}</div>
      <span style={{
        fontSize: 10, fontWeight: isActive ? 700 : 400,
        color: isActive ? TEAL : MUTED, transition: "color 0.2s",
      }}>{label}</span>
    </button>
  );
}

export default function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 1000,
      background: "#0B1220", borderTop: "1px solid rgba(255,255,255,0.07)",
      display: "flex", alignItems: "stretch", height: 64,
      paddingBottom: "env(safe-area-inset-bottom)",
    }}>
      <NavBtn label="Scanner" icon={<ScanSearch size={20} />}
        active={active === "scanner"} onClick={() => onChange("scanner")} />

      {/* Mensajes — accent pill */}
      <button
        onClick={() => onChange("mensajes")}
        style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          gap: 3, background: "none", border: "none", cursor: "pointer",
          padding: 0, height: "100%",
        }}
      >
        <div style={{
          width: 40, height: 40, borderRadius: 13,
          background: active === "mensajes"
            ? "linear-gradient(135deg,#00FFC6 0%,#00B8A9 100%)"
            : "rgba(0,255,198,0.1)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: active === "mensajes" ? "0 0 16px rgba(0,255,198,0.4)" : "none",
          transition: "all 0.2s ease",
        }}>
          <MessageSquare size={19} style={{ color: active === "mensajes" ? "#0B1220" : TEAL }} />
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700,
          color: active === "mensajes" ? TEAL : "rgba(0,255,198,0.55)",
          letterSpacing: "0.04em",
        }}>Mensajes</span>
      </button>

      <NavBtn label="Config" icon={<Settings size={20} />}
        active={active === "settings" || active === "soporte"}
        onClick={() => onChange("settings")} />
    </nav>
  );
}
