import { LayoutDashboard, Wallet, ScanSearch, Link2, Settings } from "lucide-react";

export type Tab = "dashboard" | "wallets" | "scanner" | "connections" | "settings";

interface BottomNavProps {
  active: Tab;
  onChange: (tab: Tab) => void;
}

const GREEN  = "#19C37D";
const CARD   = "#0e1520";
const BORDER = "rgba(255,255,255,0.07)";

const TABS: { id: Tab; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: "dashboard",   label: "Dashboard",   Icon: LayoutDashboard },
  { id: "wallets",     label: "Wallets",     Icon: Wallet },
  { id: "scanner",     label: "Scanner",     Icon: ScanSearch },
  { id: "connections", label: "Connections", Icon: Link2 },
  { id: "settings",    label: "Settings",    Icon: Settings },
];

const BottomNav = ({ active, onChange }: BottomNavProps) => (
  <nav
    className="fixed bottom-0 inset-x-0 z-50 flex items-center justify-around"
    style={{ background: CARD, borderTop: `1px solid ${BORDER}`, backdropFilter: "blur(20px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
    {TABS.map(({ id, label, Icon }) => {
      const isActive = active === id;
      return (
        <button
          key={id}
          onClick={() => onChange(id)}
          className="relative flex flex-1 flex-col items-center gap-1 py-3 transition-all duration-150"
          style={{ color: isActive ? GREEN : "rgba(255,255,255,0.35)" }}
        >
          {/* Active dot indicator above icon */}
          {isActive && (
            <span
              className="absolute top-0 left-1/2 -translate-x-1/2 rounded-full"
              style={{ width: 28, height: 2, background: GREEN, boxShadow: `0 0 8px ${GREEN}` }}
            />
          )}
          <Icon className="h-5 w-5" />
          <span className="text-[10px] font-medium tracking-wide">{label}</span>
        </button>
      );
    })}
  </nav>
);

export default BottomNav;
