import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import BottomNav, { type Tab } from "@/components/BottomNav";
import DashboardPage from "@/pages/DashboardPage";
import ScannerPage from "@/pages/ScannerPage";
import PlaceholderPage from "@/pages/PlaceholderPage";
import IOSInstallBanner from "@/components/IOSInstallBanner";

const queryClient = new QueryClient();

function MainApp() {
  const [tab, setTab] = useState<Tab>("dashboard");

  return (
    <div style={{ minHeight: "100vh", background: "#0B0F14" }}>
      <div style={{ display: tab === "dashboard" ? "block" : "none" }}>
        <DashboardPage onNavigateToScanner={() => setTab("scanner")} />
      </div>
      <div style={{ display: tab === "wallets" ? "block" : "none" }}>
        <PlaceholderPage title="Wallets" icon="💼" />
      </div>
      <div style={{ display: tab === "swap" ? "block" : "none" }}>
        <PlaceholderPage title="Swap" icon="🔄" />
      </div>
      <div style={{ display: tab === "scanner" ? "block" : "none" }}>
        <ScannerPage />
      </div>
      <div style={{ display: tab === "settings" ? "block" : "none" }}>
        <PlaceholderPage title="Settings" icon="⚙️" />
      </div>

      <BottomNav active={tab} onChange={setTab} />
      <IOSInstallBanner />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider defaultTheme="dark" storageKey="wallet-guard-theme">
          <MainApp />
          <Toaster richColors position="top-center" />
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
