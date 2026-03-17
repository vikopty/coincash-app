/**
 * Runtime API / Socket.io configuration.
 *
 * Development: Vite dev server proxies /api-server/* → localhost:8080.
 *   We use the relative prefix so the proxy intercepts it.
 *
 * Production: The wallet-guard is served as static files on port 80.
 *   The api-server runs on port 8080 of the same host (external port 8080).
 *   We connect directly to hostname:8080 — CORS is open on the api-server.
 */

const isDev = import.meta.env.DEV;

function apiServerOrigin(): string {
  if (isDev) return "";                          // relative → Vite proxy
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:8080`;        // direct in production
}

const origin = apiServerOrigin();

/** Base URL for REST calls — no trailing slash. */
export const API_BASE = isDev ? "/api-server/api" : `${origin}/api`;

/** Socket.io connection URL (empty = same origin). */
export const SOCKET_URL = origin;

/** Socket.io path on the server. */
export const SOCKET_PATH = isDev ? "/api-server/socket.io" : "/socket.io";
