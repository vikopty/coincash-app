// TronGrid proxy with server-side caching.
// The API key never leaves the server; responses are cached 30 s for GET
// and 10 s for POST (constant contract calls) to absorb repeated scans.
import { Router } from "express";
import type { Request, Response } from "express";

const router = Router();

const TRONGRID_BASE = "https://api.trongrid.io";
const TRON_API_KEY  = process.env["TRON_API_KEY"] ?? process.env["VITE_TRON_API_KEY"] ?? "";

// ── Simple in-memory cache ─────────────────────────────────────────────────
interface CacheEntry { data: unknown; expiresAt: number; }
const cache = new Map<string, CacheEntry>();
const GET_TTL  = 30_000; // 30 s
const POST_TTL = 10_000; // 10 s

function getCached(key: string): unknown | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null; }
  return entry.data;
}
function setCached(key: string, data: unknown, ttl: number) {
  cache.set(key, { data, expiresAt: Date.now() + ttl });
  // Evict old entries (keep cache below 500 entries)
  if (cache.size > 500) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    oldest.slice(0, 100).forEach(([k]) => cache.delete(k));
  }
}

// ── Proxy handler ──────────────────────────────────────────────────────────
// Mounted at /tron via router.use(), so req.path is the sub-path after /tron
async function proxyTron(req: Request, res: Response) {
  // req.path = "/v1/accounts/..." or "/wallet/triggerconstantcontract"
  const subPath     = req.path.replace(/^\/+/, "");
  const qs          = Object.keys(req.query).length
    ? "?" + new URLSearchParams(req.query as Record<string, string>).toString()
    : "";
  const upstreamUrl = `${TRONGRID_BASE}/${subPath}${qs}`;

  const isPost   = req.method === "POST";
  const cacheKey = isPost
    ? `POST:${upstreamUrl}:${JSON.stringify(req.body)}`
    : `GET:${upstreamUrl}`;

  const cached = getCached(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(isPost ? { "Content-Type": "application/json" } : {}),
  };
  if (TRON_API_KEY) headers["TRON-PRO-API-KEY"] = TRON_API_KEY;

  try {
    const upstream = await fetch(upstreamUrl, {
      method:  req.method,
      headers,
      body:    isPost ? JSON.stringify(req.body) : undefined,
    });

    if (upstream.status === 429) {
      return res.status(429).json({ error: "TronGrid rate limit — retry shortly" });
    }
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => upstream.statusText);
      return res.status(upstream.status).json({ error: text });
    }

    const data = await upstream.json();
    setCached(cacheKey, data, isPost ? POST_TTL : GET_TTL);
    return res.json(data);
  } catch (err: any) {
    console.error("[tron-proxy] error:", err?.message);
    return res.status(502).json({ error: "TronGrid upstream error" });
  }
}

// router.use() supports plain prefix matching (no path-to-regexp wildcards needed).
// All GET and POST requests to /tron/... are handled here.
router.use("/tron", (req, res, next) => {
  if (req.method !== "GET" && req.method !== "POST") { next(); return; }
  proxyTron(req as Request, res as Response);
});

export default router;
