import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import {
  ensureUsersTable, ensureMessagesTable,
  ensureChatUsersTable, ensureChatContactsTable,
} from "./lib/db";
import router from "./routes";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Serve CoinCash homepage static files ──────────────────────────────────────
const homePublic = path.join(__dirname, "..", "home", "public");
app.use(express.static(homePublic));

app.use("/api", router);

// ── Fallback → homepage index.html ───────────────────────────────────────────
app.get("/", (_req, res) => {
  res.sendFile(path.join(homePublic, "index.html"));
});

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
