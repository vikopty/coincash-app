import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import BottomNav, { type Tab } from "@/components/BottomNav";
import ScannerPage from "@/pages/ScannerPage";
import ChatPage from "@/pages/ChatPage";
import AdminPage from "@/pages/AdminPage";
import SettingsPage from "@/pages/SettingsPage";
import VideoPage from "@/pages/VideoPage";
import IOSInstallBanner from "@/components/IOSInstallBanner";
import { API_BASE } from "@/lib/apiConfig";

const queryClient = new QueryClient();

function getHash() {
  return typeof window !== "undefined" ? window.location.hash : "";
}

function MainApp() {
  const [tab, setTab] = useState<Tab>("scanner");
  const [hash, setHash] = useState<string>(getHash);

  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const isAdmin = hash === "#soporte-admin";
  const isVideo = hash === "#video";

  useEffect(() => {
    if (isAdmin || isVideo) return;
    fetch(`${API_BASE}/visit`, { method: "POST" }).catch(() => {});
  }, [isAdmin, isVideo]);

  if (isAdmin) return <AdminPage />;
  if (isVideo) return <VideoPage />;

  return (
    <div style={{ minHeight: "100vh", background: "#0B0F14" }}>
      <div style={{ display: tab === "scanner" ? "block" : "none" }}>
        <ScannerPage />
      </div>

      <div style={{ display: tab === "soporte" ? "block" : "none" }}>
        <ChatPage />
      </div>

      <div style={{ display: tab === "settings" ? "block" : "none" }}>
        <SettingsPage onOpenSupport={() => setTab("soporte")} />
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
