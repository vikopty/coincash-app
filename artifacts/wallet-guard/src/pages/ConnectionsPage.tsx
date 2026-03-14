import { Globe, Wifi, WifiOff, ExternalLink } from "lucide-react";

const CONNECTIONS = [
  {
    name: "TronGrid API",
    desc: "Blockchain data & events",
    status: "connected",
    url: "https://api.trongrid.io",
    logo: "/tron-logo.png",
  },
  {
    name: "USDT TRC20 Contract",
    desc: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    status: "connected",
    url: "https://tronscan.org/#/contract/TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    logo: "https://assets.coingecko.com/coins/images/325/small/Tether.png",
  },
  {
    name: "Blacklist Monitor",
    desc: "PostgreSQL · sincronización cada 5 min",
    status: "connected",
    url: null,
    logo: null,
  },
];

const ConnectionsPage = () => (
  <div className="flex flex-col gap-5 px-4 py-6 pb-24">
    <div>
      <h1 className="text-xl font-bold text-white">Connections</h1>
      <p className="text-xs text-white/40 mt-0.5">Servicios blockchain conectados</p>
    </div>

    {/* Active connections */}
    <div className="space-y-3">
      <p className="text-xs font-semibold text-white/40 uppercase tracking-widest">Activas</p>
      {CONNECTIONS.map(({ name, desc, status, url, logo }) => (
        <div key={name} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/4 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/8 overflow-hidden">
            {logo
              ? <img src={logo} alt={name} className="h-full w-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
              : <Globe className="h-5 w-5 text-white/40" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{name}</p>
            <p className="text-[11px] text-white/40 truncate mt-0.5">{desc}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5">
              {status === "connected"
                ? <Wifi className="h-4 w-4 text-green-400" />
                : <WifiOff className="h-4 w-4 text-red-400" />}
              <span className={`text-xs font-medium ${status === "connected" ? "text-green-400" : "text-red-400"}`}>
                {status === "connected" ? "OK" : "Error"}
              </span>
            </div>
            {url && (
              <a href={url} target="_blank" rel="noreferrer" className="text-white/25 hover:text-white/60">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
      ))}
    </div>

    {/* Info block */}
    <div className="rounded-xl border border-white/8 bg-white/4 p-4 space-y-2">
      <p className="text-xs font-semibold text-white/40 uppercase tracking-widest">Red</p>
      <div className="flex justify-between text-sm">
        <span className="text-white/50">Blockchain</span>
        <span className="text-white font-medium">TRON Mainnet</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-white/50">Token</span>
        <span className="text-white font-medium">USDT TRC20</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-white/50">API Rate limit</span>
        <span className="text-white font-medium">10 req / seg</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-white/50">Blacklist sync</span>
        <span className="text-white font-medium">cada 5 min</span>
      </div>
    </div>
  </div>
);

export default ConnectionsPage;
