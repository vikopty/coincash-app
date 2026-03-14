import { Globe, Wifi, ExternalLink } from "lucide-react";

const BG     = "#0B0F14";
const CARD   = "#121821";
const GREEN  = "#19C37D";
const BLUE   = "#3B82F6";
const BORDER = "rgba(255,255,255,0.06)";
const SHADOW = "0 4px 24px rgba(0,0,0,0.45)";

const CONNECTIONS = [
  { name: "TronGrid API",           desc: "Blockchain data & events",                       ok: true,  url: "https://api.trongrid.io", logo: "/tron-logo.png" },
  { name: "USDT TRC20 Contract",    desc: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",            ok: true,  url: "https://tronscan.org/#/contract/TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", logo: null },
  { name: "Blacklist Monitor",      desc: "PostgreSQL · sincronización cada 5 min",          ok: true,  url: null, logo: null },
];

const DETAILS = [
  ["Blockchain",    "TRON Mainnet"],
  ["Token",         "USDT TRC20"],
  ["Rate limit",    "10 req / seg"],
  ["Blacklist sync","cada 5 min"],
  ["Contrapartes",  "Hasta 30 por análisis"],
];

const ConnectionsPage = () => (
  <div style={{ background: BG, minHeight: "100vh" }} className="flex flex-col pb-24">
    <div className="px-5 pt-10 pb-6">
      <h1 className="text-xl font-bold text-white">Connections</h1>
      <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>Servicios blockchain conectados</p>
    </div>

    {/* Status banner */}
    <div className="mx-4 mb-5 rounded-2xl p-4 flex items-center gap-3"
      style={{ background: `${GREEN}10`, border: `1px solid ${GREEN}30` }}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: `${GREEN}20` }}>
        <Wifi className="h-4 w-4" style={{ color: GREEN }} />
      </div>
      <div>
        <p className="text-sm font-semibold" style={{ color: GREEN }}>Todos los servicios operativos</p>
        <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>3 de 3 conexiones activas</p>
      </div>
    </div>

    {/* Connection list */}
    <p className="px-5 text-xs font-semibold mb-3 uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>Conexiones</p>
    <div className="mx-4 rounded-2xl overflow-hidden mb-5" style={{ background: CARD, border: `1px solid ${BORDER}`, boxShadow: SHADOW }}>
      {CONNECTIONS.map(({ name, desc, ok, url, logo }, i) => (
        <div key={name} className="flex items-center gap-3 px-4 py-4"
          style={{ borderBottom: i < CONNECTIONS.length - 1 ? `1px solid ${BORDER}` : "none" }}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full overflow-hidden"
            style={{ background: "rgba(255,255,255,0.05)" }}>
            {logo
              ? <img src={logo} alt={name} className="h-full w-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
              : <Globe className="h-5 w-5" style={{ color: "rgba(255,255,255,0.3)" }} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{name}</p>
            <p className="text-[11px] truncate mt-0.5" style={{ color: "rgba(255,255,255,0.38)" }}>{desc}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: ok ? GREEN : "#FF4D4F" }} />
              <span className="text-xs font-medium" style={{ color: ok ? GREEN : "#FF4D4F" }}>{ok ? "OK" : "Error"}</span>
            </div>
            {url && (
              <a href={url} target="_blank" rel="noreferrer"
                className="flex h-6 w-6 items-center justify-center rounded-lg"
                style={{ background: "rgba(255,255,255,0.06)" }}>
                <ExternalLink className="h-3 w-3" style={{ color: "rgba(255,255,255,0.4)" }} />
              </a>
            )}
          </div>
        </div>
      ))}
    </div>

    {/* Network details */}
    <p className="px-5 text-xs font-semibold mb-3 uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>Detalles de red</p>
    <div className="mx-4 rounded-2xl overflow-hidden" style={{ background: CARD, border: `1px solid ${BORDER}`, boxShadow: SHADOW }}>
      {DETAILS.map(([label, val], i) => (
        <div key={label} className="flex items-center justify-between px-4 py-3.5"
          style={{ borderBottom: i < DETAILS.length - 1 ? `1px solid ${BORDER}` : "none" }}>
          <span className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>{label}</span>
          <span className="text-sm font-semibold text-white">{val}</span>
        </div>
      ))}
    </div>
  </div>
);

export default ConnectionsPage;
