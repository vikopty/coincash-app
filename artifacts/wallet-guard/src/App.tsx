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
import SwapPage from "@/pages/SwapPage";
import SettingsPage from "@/pages/SettingsPage";
import ChatPage from "@/pages/ChatPage";
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

type SubView = "blacklist" | "trm" | null;

function MainApp() {
  const [tab, setTab]             = useState<Tab>("dashboard");
  const [subView, setSubView]     = useState<SubView>(null);
  const [scanAddress, setScanAddress] = useState<string | undefined>();
  const [locked, setLocked]       = useState(() => isPinEnabled());
  const [wallets, setWallets]     = useState<SavedWallet[]>(() => loadWallets());

  // Keep wallets in sync with localStorage changes (user adds/removes wallets)
  useEffect(() => {
    const sync = () => setWallets(loadWallets());
    window.addEventListener("storage", sync);
    const t = setInterval(sync, 5_000);
    return () => { window.removeEventListener("storage", sync); clearInterval(t); };
  }, []);

  const handleScanWallet = (address: string) => {
    setSubView(null);
    setScanAddress(address);
    setTab("scanner");
  };

  // Close any open sub-view and switch tab
  const handleNavChange = (newTab: Tab) => {
    setSubView(null);
    setTab(newTab);
  };

  // ── Transaction monitor (only runs when unlocked and wallets exist) ──────────
  useTransactionMonitor(locked ? [] : wallets, handleScanWallet);

  if (locked) return <PinLockScreen onUnlock={() => { setLocked(false); setTab("dashboard"); }} />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Sub-views: render as full-screen pages in the content flow ── */}
      {subView === "blacklist" && (
        <BlacklistPage onClose={() => setSubView(null)} />
      )}
      {subView === "trm" && (
        <TRMPage onClose={() => setSubView(null)} />
      )}

      {/* ── Main tab content: hidden while a sub-view is active ── */}
      <div style={{ display: subView ? "none" : "block" }}>
        <div style={{ display: tab === "dashboard"   ? "block" : "none" }}>
          <DashboardPage
            onScanWallet={handleScanWallet}
            onOpenFrozen={() => setSubView("blacklist")}
            onOpenTRM={() => setSubView("trm")}
          />
        </div>
        <div style={{ display: tab === "wallets"     ? "block" : "none" }}>
          <WalletsPage onScan={handleScanWallet} activeTab={tab} onNavigateSwap={() => setTab("swap")} />
        </div>
        <div style={{ display: tab === "swap"        ? "block" : "none" }}>
          <SwapPage wallets={wallets} activeTab={tab} />
        </div>
        <div style={{ display: tab === "scanner"     ? "block" : "none" }}>
          <ScannerPage
            prefillAddress={tab === "scanner" ? scanAddress : undefined}
            onAddressConsumed={() => setScanAddress(undefined)}
          />
        </div>
        <div style={{ display: tab === "chat"       ? "block" : "none" }}>
          <ChatPage wallets={wallets} />
        </div>
        <div style={{ display: tab === "settings"   ? "block" : "none" }}>
          <SettingsPage />
        </div>
      </div>

      <BottomNav active={tab} onChange={handleNavChange} />
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
