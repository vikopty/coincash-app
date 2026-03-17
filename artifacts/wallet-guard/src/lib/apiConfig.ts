/**
 * Runtime API / Socket.io configuration.
 *
 * The api-server artifact is registered at path "/api" in Replit's routing.
 * Both the Vite dev proxy and Replit's deployment proxy forward /api/* to
 * port 8080 (the api-server), so we can use the same paths everywhere.
 *
 * Socket.io is mounted at /api/socket.io on the server, keeping it inside
 * the /api prefix that is routed to port 8080 in production.
 */

/** Base URL for REST calls — no trailing slash. */
export const API_BASE = "/api";

/** Socket.io connection URL — empty string = connect to same origin. */
export const SOCKET_URL = "";

/** Socket.io path — must match the server's `path` option. */
export const SOCKET_PATH = "/api/socket.io";
