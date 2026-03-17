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
      <div style={{ display: tab === "mensajes" ? "block" : "none" }}>
        <DmPage />
      </div>

      {/* Soporte chat — full screen with back button */}
      {tab === "soporte" && (
        <div style={{ position: "fixed", inset: 0, zIndex: 500 }}>
          <button
            onClick={() => setTab("settings")}
            style={{
              position: "absolute", top: 16, left: 16, zIndex: 600,
              background: "rgba(11,18,32,0.85)", border: "1px solid rgba(0,255,198,0.2)",
              borderRadius: 20, padding: "6px 14px 6px 10px",
              display: "flex", alignItems: "center", gap: 6,
              color: "#00FFC6", fontSize: 13, fontWeight: 600,
              cursor: "pointer", backdropFilter: "blur(8px)",
              fontFamily: "'Inter', sans-serif",
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>‹</span> Config
          </button>
          <ChatPage />
        </div>
      )}

      <div style={{ display: tab === "settings" ? "block" : "none" }}>
        <SettingsPage onOpenSupport={() => setTab("soporte")} />
      </div>

      {tab !== "soporte" && (
        <>
          <BottomNav active={tab} onChange={setTab} />
          <IOSInstallBanner />
        </>
      )}
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
