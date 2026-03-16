// @ts-nocheck
// PostgreSQL client — swap order logging + CoinCash user IDs.
// Uses DATABASE_URL from the Replit-managed environment.

import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err: Error) => {
  console.error("[db] Pool error:", err.message);
});

// ── Swap order logging ────────────────────────────────────────────────────────

export interface SwapOrderRecord {
  ffOrderId:      string;
  ffToken?:       string;
  userWallet:     string;
  direction:      "usdt_to_trx" | "trx_to_usdt";
  inputToken:     "USDT" | "TRX";
  inputAmount:    number;
  outputToken:    "USDT" | "TRX";
  expectedOutput: number;
  depositAddress: string;
  coinCashFee:    number;
  status?:        string;
  inputTxId?:     string;
  relayTxId?:     string;
}

export async function logSwapOrder(rec: SwapOrderRecord): Promise<number | null> {
  try {
    const res = await pool.query<{ id: number }>(
      `INSERT INTO swap_orders
         (ff_order_id, ff_token, user_wallet, direction, input_token, input_amount,
          output_token, expected_output, deposit_address, coincash_fee, status, input_tx_id, relay_tx_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id`,
      [
        rec.ffOrderId, rec.ffToken ?? null, rec.userWallet, rec.direction,
        rec.inputToken, rec.inputAmount, rec.outputToken, rec.expectedOutput,
        rec.depositAddress, rec.coinCashFee, rec.status ?? "pending",
        rec.inputTxId ?? null, rec.relayTxId ?? null,
      ],
    );
    const id = res.rows[0]?.id ?? null;
    console.log(`[db] swap_order logged id=${id} ff_order=${rec.ffOrderId}`);
    return id;
  } catch (err: any) {
    console.error("[db] logSwapOrder failed (non-fatal):", err?.message);
    return null;
  }
}

export async function updateSwapOrderTxIds(
  ffOrderId: string,
  inputTxId: string,
  relayTxId: string,
  status = "sent",
): Promise<void> {
  try {
    await pool.query(
      `UPDATE swap_orders
          SET input_tx_id = $1, relay_tx_id = $2, status = $3, updated_at = NOW()
        WHERE ff_order_id = $4`,
      [inputTxId, relayTxId, status, ffOrderId],
    );
    console.log(`[db] swap_order updated ff_order=${ffOrderId} status=${status}`);
  } catch (err: any) {
    console.error("[db] updateSwapOrderTxIds failed (non-fatal):", err?.message);
  }
}

// ── CoinCash user ID system ───────────────────────────────────────────────────

export interface UserRecord {
  id:             number;
  coincash_id:    string;
  wallet_address: string;
  created_at:     Date;
}

/** Create the users table if it doesn't already exist. */
export async function ensureUsersTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id             SERIAL PRIMARY KEY,
      coincash_id    TEXT UNIQUE NOT NULL,
      wallet_address TEXT        NOT NULL,
      created_at     TIMESTAMP   NOT NULL DEFAULT NOW()
    )
  `);
  // Index on wallet_address for fast lookups
  await pool.query(`
    CREATE INDEX IF NOT EXISTS users_wallet_address_idx ON users (wallet_address)
  `);
  console.log("[db] users table ready");
}

/** Generate a CC-XXXXXX ID with 6 random digits. */
function generateCoinCashId(): string {
  const digits = Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
  return `CC-${digits}`;
}

/**
 * Return the existing CoinCash ID for a wallet address, or create one.
 * Retries up to 5 times on the rare CC-ID collision.
 */
export async function getOrCreateUser(walletAddress: string): Promise<UserRecord> {
  // 1. Look up by wallet address first
  const existing = await pool.query<UserRecord>(
    `SELECT id, coincash_id, wallet_address, created_at
       FROM users
      WHERE wallet_address = $1
      LIMIT 1`,
    [walletAddress],
  );
  if (existing.rows.length > 0) return existing.rows[0];

  // 2. Generate a unique CC-ID and insert (retry on collision)
  for (let attempt = 0; attempt < 5; attempt++) {
    const ccId = generateCoinCashId();
    try {
      const res = await pool.query<UserRecord>(
        `INSERT INTO users (coincash_id, wallet_address)
         VALUES ($1, $2)
         ON CONFLICT (coincash_id) DO NOTHING
         RETURNING id, coincash_id, wallet_address, created_at`,
        [ccId, walletAddress],
      );
      if (res.rows.length > 0) {
        console.log(`[db] New user created: ${ccId} → ${walletAddress}`);
        return res.rows[0];
      }
      // Conflict on coincash_id — retry with a new one
    } catch (err: any) {
      console.error("[db] getOrCreateUser insert error:", err?.message);
      throw err;
    }
  }
  throw new Error("Failed to generate a unique CoinCash ID after 5 attempts");
}

/**
 * Get or create a user, but use the caller-supplied coincashId instead of
 * generating a random one.  Used when the client already generated a local ID.
 *
 * Priority:
 *   1. If coincashId already exists in DB → return that record (collision: shared ID)
 *   2. If walletAddress already exists in DB → return that record
 *   3. Insert with the provided coincashId
 */
export async function getOrCreateUserWithCcId(
  walletAddress: string,
  coincashId:    string,
): Promise<UserRecord> {
  // 1. CC-ID already registered?
  const byCcId = await pool.query<UserRecord>(
    `SELECT id, coincash_id, wallet_address, created_at
       FROM users WHERE coincash_id = $1 LIMIT 1`,
    [coincashId],
  );
  if (byCcId.rows.length > 0) return byCcId.rows[0];

  // 2. Wallet already registered under a different CC-ID?
  const byWallet = await pool.query<UserRecord>(
    `SELECT id, coincash_id, wallet_address, created_at
       FROM users WHERE wallet_address = $1 LIMIT 1`,
    [walletAddress],
  );
  if (byWallet.rows.length > 0) return byWallet.rows[0];

  // 3. Insert with the locally-generated CC-ID
  const res = await pool.query<UserRecord>(
    `INSERT INTO users (coincash_id, wallet_address)
     VALUES ($1, $2)
     ON CONFLICT (coincash_id) DO NOTHING
     RETURNING id, coincash_id, wallet_address, created_at`,
    [coincashId, walletAddress],
  );
  if (res.rows.length > 0) {
    console.log(`[db] New user registered: ${coincashId} → ${walletAddress}`);
    return res.rows[0];
  }
  // Race condition — another insert won; fetch the winner
  const winner = await pool.query<UserRecord>(
    `SELECT id, coincash_id, wallet_address, created_at
       FROM users WHERE coincash_id = $1`,
    [coincashId],
  );
  return winner.rows[0];
}

/** Look up a user by their CoinCash ID. */
export async function getUserByCoinCashId(ccId: string): Promise<UserRecord | null> {
  const res = await pool.query<UserRecord>(
    `SELECT id, coincash_id, wallet_address, created_at
       FROM users
      WHERE coincash_id = $1
      LIMIT 1`,
    [ccId],
  );
  return res.rows[0] ?? null;
}

/** Look up a user by wallet address. */
export async function getUserByWallet(walletAddress: string): Promise<UserRecord | null> {
  const res = await pool.query<UserRecord>(
    `SELECT id, coincash_id, wallet_address, created_at
       FROM users
      WHERE wallet_address = $1
      LIMIT 1`,
    [walletAddress],
  );
  return res.rows[0] ?? null;
}

// ── Chat messages ─────────────────────────────────────────────────────────────

export interface ChatMessage {
  id:                   number;
  sender_coincash_id:   string;
  receiver_coincash_id: string;
  message:              string;
  timestamp:            Date;
}

/** Create the chat_messages table if it doesn't already exist. */
export async function ensureMessagesTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id                   SERIAL PRIMARY KEY,
      sender_coincash_id   TEXT      NOT NULL,
      receiver_coincash_id TEXT      NOT NULL,
      message              TEXT      NOT NULL,
      timestamp            TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS chat_messages_sender_idx   ON chat_messages (sender_coincash_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS chat_messages_receiver_idx ON chat_messages (receiver_coincash_id)
  `);
  console.log("[db] chat_messages table ready");
}

/** Persist a new chat message. */
export async function saveChatMessage(
  senderCcId:   string,
  receiverCcId: string,
  message:      string,
): Promise<ChatMessage> {
  const res = await pool.query<ChatMessage>(
    `INSERT INTO chat_messages (sender_coincash_id, receiver_coincash_id, message)
     VALUES ($1, $2, $3)
     RETURNING id, sender_coincash_id, receiver_coincash_id, message, timestamp`,
    [senderCcId, receiverCcId, message],
  );
  return res.rows[0];
}

/**
 * Retrieve all messages where ccId is sender or receiver (full inbox).
 */
export async function getChatMessages(ccId: string, limit = 100): Promise<ChatMessage[]> {
  const res = await pool.query<ChatMessage>(
    `SELECT id, sender_coincash_id, receiver_coincash_id, message, timestamp
       FROM chat_messages
      WHERE sender_coincash_id = $1
         OR receiver_coincash_id = $1
      ORDER BY timestamp ASC
      LIMIT $2`,
    [ccId, limit],
  );
  return res.rows;
}

/**
 * Retrieve only the messages exchanged between two specific CoinCash IDs.
 * Ordered chronologically.
 */
export async function getConversation(
  ccId1: string,
  ccId2: string,
  limit = 200,
): Promise<ChatMessage[]> {
  const res = await pool.query<ChatMessage>(
    `SELECT id, sender_coincash_id, receiver_coincash_id, message, timestamp
       FROM chat_messages
      WHERE (sender_coincash_id = $1 AND receiver_coincash_id = $2)
         OR (sender_coincash_id = $2 AND receiver_coincash_id = $1)
      ORDER BY timestamp ASC
      LIMIT $3`,
    [ccId1, ccId2, limit],
  );
  return res.rows;
}
