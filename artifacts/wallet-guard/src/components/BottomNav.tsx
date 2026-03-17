import { ScanSearch, MessageCircle, Settings } from "lucide-react";

export type Tab = "scanner" | "soporte" | "settings";

interface BottomNavProps {
  active: Tab;
  onChange: (tab: Tab) => void;
}

export default function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        background: "#0B1220",
        borderTop: "1px solid rgba(255,255,255,0.07)",
        display: "flex",
        alignItems: "center",
        height: "64px",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* Scanner — left */}
      <button
        onClick={() => onChange("scanner")}
        style={{
          width: "80px",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "4px",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          height: "100%",
        }}
      >
        <ScanSearch
          style={{
            width: "20px",
            height: "20px",
            color: active === "scanner" ? "#00FFC6" : "rgba(255,255,255,0.35)",
            transition: "color 0.2s",
          }}
        />
        <span
          style={{
            fontSize: "10px",
            fontWeight: active === "scanner" ? 600 : 400,
            color: active === "scanner" ? "#00FFC6" : "rgba(255,255,255,0.35)",
            transition: "color 0.2s",
          }}
        >
          Scanner
        </span>
      </button>

      {/* Soporte — center (pill) */}
      <button
        onClick={() => onChange("soporte")}
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "3px",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          height: "100%",
        }}
      >
        <div
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "14px",
            background:
              active === "soporte"
                ? "linear-gradient(135deg,#00FFC6 0%,#00B8A9 100%)"
                : "rgba(0,255,198,0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: active === "soporte" ? "0 0 18px rgba(0,255,198,0.45)" : "none",
            transition: "all 0.2s ease",
          }}
        >
          <MessageCircle
            style={{
              width: "20px",
              height: "20px",
              color: active === "soporte" ? "#0B1220" : "#00FFC6",
            }}
          />
        </div>
        <span
          style={{
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.04em",
            color: active === "soporte" ? "#00FFC6" : "rgba(0,255,198,0.6)",
          }}
        >
          Soporte
        </span>
      </button>

      {/* Settings — right */}
      <button
        onClick={() => onChange("settings")}
        style={{
          width: "80px",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "4px",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          height: "100%",
        }}
      >
        <Settings
          style={{
            width: "20px",
            height: "20px",
            color: active === "settings" ? "#00FFC6" : "rgba(255,255,255,0.35)",
            transition: "color 0.2s",
          }}
        />
        <span
          style={{
            fontSize: "10px",
            fontWeight: active === "settings" ? 600 : 400,
            color: active === "settings" ? "#00FFC6" : "rgba(255,255,255,0.35)",
            transition: "color 0.2s",
          }}
        >
          Settings
        </span>
      </button>
    </nav>
  );
}
