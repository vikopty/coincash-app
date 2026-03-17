import { LayoutDashboard, Wallet, ArrowUpDown, ScanSearch, Settings } from "lucide-react";

export type Tab = "dashboard" | "wallets" | "swap" | "scanner" | "settings";

interface BottomNavProps {
  active: Tab;
  onChange: (tab: Tab) => void;
}

const TABS: { id: Tab; label: string; Icon: React.ElementType }[] = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { id: "wallets",   label: "Wallets",   Icon: Wallet          },
  { id: "swap",      label: "Swap",      Icon: ArrowUpDown     },
  { id: "scanner",   label: "Scanner",   Icon: ScanSearch      },
  { id: "settings",  label: "Settings",  Icon: Settings        },
];

export default function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav style={{
      position: "fixed",
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 1000,
      background: "#0B1220",
      borderTop: "1px solid rgba(255,255,255,0.07)",
      display: "flex",
      alignItems: "stretch",
      height: "64px",
      paddingBottom: "env(safe-area-inset-bottom)",
    }}>
      {TABS.map(({ id, label, Icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "3px",
              background: "none",
              border: "none",
              borderTop: isActive ? "2px solid #00FFC6" : "2px solid transparent",
              cursor: "pointer",
              padding: "0 2px",
              transition: "border-color 0.2s",
            }}
          >
            <Icon style={{
              width: "20px",
              height: "20px",
              color: isActive ? "#00FFC6" : "rgba(255,255,255,0.35)",
              transition: "color 0.2s",
            }} />
            <span style={{
              fontSize: "10px",
              fontWeight: isActive ? 700 : 400,
              color: isActive ? "#00FFC6" : "rgba(255,255,255,0.35)",
              letterSpacing: "0.02em",
              transition: "color 0.2s",
            }}>
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
