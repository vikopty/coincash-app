import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import { existsSync } from "fs";
import router from "./routes";
import {
  ensureUsersTable, ensureMessagesTable,
  ensureChatUsersTable, ensureChatContactsTable,
  ensureDmTables, ensureVisitsTable, ensureAccountPinsTable,
  deleteOldChatMessages,
} from "./lib/db";

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Serve wallet-guard static files in production ────────────────────────────
// process.cwd() is the monorepo root in both dev (tsx) and production (node).
// import.meta.url is NOT used here because the CJS build sets it to undefined.
const walletGuardDist = path.join(
  process.cwd(),
  "artifacts", "wallet-guard", "dist", "public",
);

if (existsSync(walletGuardDist)) {
  app.use(express.static(walletGuardDist));
  console.log("[app] Serving wallet-guard static files from", walletGuardDist);
}

// ── API routes ───────────────────────────────────────────────────────────────
app.use("/api", router);

// ── SPA fallback — return index.html for all non-API routes ─────────────────
const indexHtml = path.join(walletGuardDist, "index.html");
if (existsSync(walletGuardDist)) {
  app.use((_req, res) => {
    res.sendFile(indexHtml);
  });
}

// Bootstrap DB tables (sequential so foreign-key-like order is respected)
(async () => {
  try {
    await ensureUsersTable();
    await ensureMessagesTable();
    await ensureChatUsersTable();
    await ensureChatContactsTable();
    await ensureDmTables();
    await ensureVisitsTable();
    await ensureAccountPinsTable();

    // Run immediately on start, then every hour
    const runCleanup = async () => {
      try {
        const deleted = await deleteOldChatMessages();
        if (deleted > 0) console.log(`[cleanup] Deleted ${deleted} support messages older than 24h`);
      } catch (err: any) {
        console.error("[cleanup] Failed:", err?.message);
      }
    };
    await runCleanup();
    setInterval(runCleanup, 60 * 60 * 1000); // every hour
  } catch (err: any) {
    console.error("[app] DB bootstrap failed:", err?.message);
  }
})();

export default app;
