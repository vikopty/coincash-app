// TronGrid proxy with server-side caching and transparent retry.
// The API key never leaves the server; responses are cached and 429s
// are retried internally so the client never has to deal with rate limits.
import { Router } from "express";
import type { Request, Response } from "express";

const router = Router();

const TRONGRID_BASE = "https://api.trongrid.io";
const TRON_API_KEY  = process.env["TRON_API_KEY"] ?? process.env["VITE_TRON_API_KEY"] ?? "";

// ── In-memory cache ────────────────────────────────────────────────────────
interface CacheEntry { data: unknown; expiresAt: number; freshUntil: number; }
const cache = new Map<string, CacheEntry>();

// Fresh TTL: how long to serve without hitting TronGrid again.
// Stale TTL: serve old cached data when TronGrid is returning 429.
const GET_FRESH_MS  = 60_000;        // 1 min fresh
const GET_STALE_MS  = 5 * 60_000;   // 5 min stale fallback
const POST_FRESH_MS = 15_000;        // 15 s fresh
const POST_STALE_MS = 2 * 60_000;   // 2 min stale fallback

function getCached(key: string): { data: unknown; stale: boolean } | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null; }
  return { data: entry.data, stale: Date.now() > entry.freshUntil };
}
function setCached(key: string, data: unknown, freshMs: number, staleMs: number) {
  const now = Date.now();
  cache.set(key, { data, freshUntil: now + freshMs, expiresAt: now + staleMs });
  if (cache.size > 500) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    oldest.slice(0, 100).forEach(([k]) => cache.delete(k));
  }
}

// ── Server-side retry on 429 ───────────────────────────────────────────────
const PROXY_RETRIES   = 4;
const PROXY_DELAY_MS  = 2_000; // 2 s between retries

async function fetchFromTronGrid(
  upstreamUrl: string,
  method: string,
  body?: string,
): Promise<{ ok: boolean; status: number; data?: unknown; text?: string }> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (method === "POST") headers["Content-Type"] = "application/json";
  if (TRON_API_KEY)      headers["TRON-PRO-API-KEY"] = TRON_API_KEY;

  for (let attempt = 0; attempt <= PROXY_RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponential-ish back-off: 2s, 4s, 6s, 8s
      await new Promise(r => setTimeout(r, PROXY_DELAY_MS * attempt));
    }
    try {
      const res = await fetch(upstreamUrl, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(15_000),
      });

      if (res.status === 429) {
        console.warn(`[tron-proxy] 429 on attempt ${attempt + 1}/${PROXY_RETRIES + 1}: ${upstreamUrl}`);
        if (attempt < PROXY_RETRIES) continue; // retry
        return { ok: false, status: 429 };
      }

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        return { ok: false, status: res.status, text };
      }

      const data = await res.json();
      return { ok: true, status: res.status, data };
    } catch (err: any) {
      console.error(`[tron-proxy] fetch error attempt ${attempt + 1}: ${err?.message}`);
      if (attempt < PROXY_RETRIES) continue;
      return { ok: false, status: 502, text: err?.message };
    }
  }
  return { ok: false, status: 502, text: "max retries exceeded" };
}

// ── Proxy handler ──────────────────────────────────────────────────────────
async function proxyTron(req: Request, res: Response) {
  const subPath     = req.path.replace(/^\/+/, "");
  const qs          = Object.keys(req.query).length
    ? "?" + new URLSearchParams(req.query as Record<string, string>).toString()
    : "";
  const upstreamUrl = `${TRONGRID_BASE}/${subPath}${qs}`;
  const isPost      = req.method === "POST";
  const bodyStr     = isPost ? JSON.stringify(req.body) : undefined;
  const cacheKey    = isPost ? `POST:${upstreamUrl}:${bodyStr}` : `GET:${upstreamUrl}`;

  // ① Return fresh cache immediately
  const cached = getCached(cacheKey);
  if (cached && !cached.stale) {
    return res.json(cached.data);
  }

  // ② Fetch from TronGrid (with internal retries)
  const result = await fetchFromTronGrid(upstreamUrl, req.method, bodyStr);

  if (result.ok && result.data !== undefined) {
    const freshMs = isPost ? POST_FRESH_MS : GET_FRESH_MS;
    const staleMs = isPost ? POST_STALE_MS : GET_STALE_MS;
    setCached(cacheKey, result.data, freshMs, staleMs);
    return res.json(result.data);
  }

  // ③ All retries exhausted — serve stale cache if available (better than error)
  if (cached) {
    console.warn(`[tron-proxy] Serving stale cache for ${upstreamUrl}`);
    return res.json(cached.data);
  }

  // ④ No cache, no data — return error
  if (result.status === 429) {
    return res.status(429).json({ error: "TronGrid no disponible temporalmente. Intente de nuevo en unos segundos." });
  }
  return res.status(result.status ?? 502).json({ error: result.text ?? "TronGrid upstream error" });
}

// ── Mount ──────────────────────────────────────────────────────────────────
router.use("/tron", (req, res, next) => {
  if (req.method !== "GET" && req.method !== "POST") { next(); return; }
  proxyTron(req as Request, res as Response);
});

export default router;
