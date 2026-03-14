import { LayoutDashboard, Wallet, ScanSearch, Link2, Settings } from "lucide-react";

export type Tab = "dashboard" | "wallets" | "scanner" | "connections" | "settings";

interface BottomNavProps {
  active: Tab;
  onChange: (tab: Tab) => void;
}

const TABS: { id: Tab; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: "dashboard",   label: "Dashboard",    Icon: LayoutDashboard },
  { id: "wallets",     label: "Wallets",      Icon: Wallet },
  { id: "scanner",     label: "Scanner",      Icon: ScanSearch },
  { id: "connections", label: "Connections",  Icon: Link2 },
  { id: "settings",    label: "Settings",     Icon: Settings },
];

const BottomNav = ({ active, onChange }: BottomNavProps) => (
  <nav className="fixed bottom-0 inset-x-0 z-50 flex items-center justify-around border-t border-white/8 bg-black/95 backdrop-blur-md pb-safe">
    {TABS.map(({ id, label, Icon }) => {
      const isActive = active === id;
      return (
        <button
          key={id}
          onClick={() => onChange(id)}
          className="relative flex flex-1 flex-col items-center gap-0.5 py-3 transition-colors"
          style={{ color: isActive ? "#00ff88" : "rgba(255,255,255,0.4)" }}
        >
          <Icon className="h-5 w-5" />
          <span className="text-[10px] font-medium tracking-wide">{label}</span>
          {isActive && (
            <span
              className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full"
              style={{ background: "#00ff88" }}
            />
          )}
        </button>
      );
    })}
  </nav>
);

export default BottomNav;
