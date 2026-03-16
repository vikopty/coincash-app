import express, { type Express } from "express";
import cors from "cors";
import router from "./routes";
import { ensureUsersTable, ensureMessagesTable, ensureChatUsersTable } from "./lib/db";

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Bootstrap DB tables
Promise.all([
  ensureUsersTable(),
  ensureMessagesTable(),
  ensureChatUsersTable(),
]).catch(err => console.error("[app] DB bootstrap failed:", err?.message));

export default app;
