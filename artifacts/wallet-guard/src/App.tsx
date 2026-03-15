import { useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import BottomNav, { Tab } from "@/components/BottomNav";
import DashboardPage from "@/pages/DashboardPage";
import WalletsPage, { type SavedWallet } from "@/pages/WalletsPage";
import ScannerPage from "@/pages/ScannerPage";
import ConnectionsPage from "@/pages/ConnectionsPage";
import SettingsPage from "@/pages/SettingsPage";
import BlacklistPage from "@/pages/BlacklistPage";
import TRMPage from "@/pages/TRMPage";
import PinLockScreen from "@/components/PinLockScreen";
import NotFound from "@/pages/not-found";
import { isPinEnabled } from "@/lib/security";
import { useTransactionMonitor } from "@/hooks/useTransactionMonitor";

const queryClient = new QueryClient();

// ── Wallet loader (mirrors WalletsPage logic) ─────────────────────────────────
function loadWallets(): SavedWallet[] {
  try { return JSON.parse(localStorage.getItem("wg_wallets") || "[]"); }
  catch { return []; }
}

function MainApp() {
  const [tab, setTab]             = useState<Tab>("dashboard");
  const [scanAddress, setScanAddress] = useState<string | undefined>();
  const [locked, setLocked]       = useState(() => isPinEnabled());
  const [frozenOpen, setFrozenOpen] = useState(false);
  const [trmOpen, setTrmOpen]       = useState(false);
  const [wallets, setWallets]     = useState<SavedWallet[]>(() => loadWallets());

  // Keep wallets in sync with localStorage changes (user adds/removes wallets)
  useEffect(() => {
    const sync = () => setWallets(loadWallets());
    window.addEventListener("storage", sync);
    // Also poll every 5 seconds so changes from the same tab are picked up
    const t = setInterval(sync, 5_000);
    return () => { window.removeEventListener("storage", sync); clearInterval(t); };
  }, []);

  const handleScanWallet = (address: string) => {
    setScanAddress(address);
    setTab("scanner");
  };

  // ── Transaction monitor (only runs when unlocked and wallets exist) ──────────
  useTransactionMonitor(locked ? [] : wallets, handleScanWallet);

  if (locked) return <PinLockScreen onUnlock={() => { setLocked(false); setTab("dashboard"); }} />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {frozenOpen && <BlacklistPage onClose={() => setFrozenOpen(false)} />}
      {trmOpen    && <TRMPage      onClose={() => setTrmOpen(false)}    />}
      <div style={{ display: tab === "dashboard"   ? "block" : "none" }}>
        <DashboardPage
          onScanWallet={handleScanWallet}
          onOpenFrozen={() => setFrozenOpen(true)}
          onOpenTRM={() => setTrmOpen(true)}
        />
      </div>
      <div style={{ display: tab === "wallets"     ? "block" : "none" }}>
        <WalletsPage onScan={handleScanWallet} />
      </div>
      <div style={{ display: tab === "scanner"     ? "block" : "none" }}>
        <ScannerPage
          prefillAddress={tab === "scanner" ? scanAddress : undefined}
          onAddressConsumed={() => setScanAddress(undefined)}
        />
      </div>
      <div style={{ display: tab === "connections" ? "block" : "none" }}>
        <ConnectionsPage />
      </div>
      <div style={{ display: tab === "settings"   ? "block" : "none" }}>
        <SettingsPage />
      </div>
      <BottomNav active={tab} onChange={setTab} />
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={MainApp} />
      <Route path="/blacklist">{() => <BlacklistPage />}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider defaultTheme="dark" storageKey="wallet-guard-theme">
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster richColors position="top-center" />
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
