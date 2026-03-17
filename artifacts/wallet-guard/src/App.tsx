import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import BottomNav, { type Tab } from "@/components/BottomNav";
import ScannerPage from "@/pages/ScannerPage";
import ChatPage from "@/pages/ChatPage";
import AdminPage from "@/pages/AdminPage";
import DmPage from "@/pages/DmPage";
import SettingsPage from "@/pages/SettingsPage";
import IOSInstallBanner from "@/components/IOSInstallBanner";
import { API_BASE } from "@/lib/apiConfig";

const queryClient = new QueryClient();

// Admin panel: navigate to the app URL with #soporte-admin hash
const IS_ADMIN = typeof window !== "undefined" && window.location.hash === "#soporte-admin";

function MainApp() {
  const [tab, setTab] = useState<Tab>("scanner");

  // Register visit on app load (only for real users, not admin)
  useEffect(() => {
    if (IS_ADMIN) return;
    fetch(`${API_BASE}/visit`, { method: "POST" }).catch(() => {});
  }, []);

  if (IS_ADMIN) {
    return <AdminPage />;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0B0F14" }}>
      <div style={{ display: tab === "scanner" ? "block" : "none" }}>
        <ScannerPage />
      </div>
      <div style={{ display: tab === "mensajes" ? "block" : "none" }}>
        <DmPage />
      </div>
      <div style={{ display: tab === "soporte" ? "block" : "none" }}>
        <ChatPage />
      </div>
      <div style={{ display: tab === "settings" ? "block" : "none" }}>
        <SettingsPage />
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
