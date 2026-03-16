import express, { type Express } from "express";
import cors from "cors";
import router from "./routes";
import { ensureUsersTable } from "./lib/db";

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Bootstrap DB tables
ensureUsersTable().catch(err =>
  console.error("[app] ensureUsersTable failed:", err?.message),
);

export default app;
