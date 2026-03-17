import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import router from "./routes";
import {
  ensureUsersTable, ensureMessagesTable,
  ensureChatUsersTable, ensureChatContactsTable,
} from "./lib/db";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Serve wallet-guard static files in production ────────────────────────────
// When built, the dist lands at artifacts/wallet-guard/dist/public.
// The api-server binary sits at artifacts/api-server/dist/index.cjs, so
// __dirname resolves to …/api-server/dist — walk up two levels to reach the
// monorepo root, then down to the wallet-guard dist.
const walletGuardDist = path.join(
  __dirname,
  "..", "..",     // api-server/dist → monorepo root
  "wallet-guard", "dist", "public",
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
  } catch (err: any) {
    console.error("[app] DB bootstrap failed:", err?.message);
  }
})();

export default app;
