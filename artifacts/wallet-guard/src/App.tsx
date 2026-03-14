import { useState } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import BottomNav, { Tab } from "@/components/BottomNav";
import DashboardPage from "@/pages/DashboardPage";
import WalletsPage from "@/pages/WalletsPage";
import ScannerPage from "@/pages/ScannerPage";
import ConnectionsPage from "@/pages/ConnectionsPage";
import SettingsPage from "@/pages/SettingsPage";
import BlacklistPage from "@/pages/BlacklistPage";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function MainApp() {
  const [tab, setTab] = useState<Tab>("scanner");
  const [scanAddress, setScanAddress] = useState<string | undefined>();

  const handleScanWallet = (address: string) => {
    setScanAddress(address);
    setTab("scanner");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Tab content */}
      <div style={{ display: tab === "dashboard"   ? "block" : "none" }}>
        <DashboardPage onScanWallet={handleScanWallet} />
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
      <Route path="/blacklist" component={BlacklistPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider defaultTheme="dark" storageKey="wallet-guard-theme">
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
