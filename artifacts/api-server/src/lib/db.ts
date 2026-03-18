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

// ── Chat users ────────────────────────────────────────────────────────────────

export interface ChatUserRecord {
  id:          number;
  coincash_id: string;
  name:        string;
  role:        string;
  linked_to:   string | null;
  created_at:  Date;
}

const SYSTEM_SUPPORT_ID = "CC-SUPPORT";
const ADMIN_CC_ID        = "CC-801286";

/** Create the chat_users table and seed system accounts. */
export async function ensureChatUsersTable(): Promise<void> {
  // Create base table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_users (
      id          SERIAL    PRIMARY KEY,
      coincash_id TEXT      UNIQUE NOT NULL,
      name        TEXT      NOT NULL DEFAULT '',
      role        TEXT      NOT NULL DEFAULT 'user',
      created_at  TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  // Idempotent column additions (safe if already exist)
  await pool.query(`ALTER TABLE chat_users ADD COLUMN IF NOT EXISTS name      TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE chat_users ADD COLUMN IF NOT EXISTS role      TEXT NOT NULL DEFAULT 'user'`);
  await pool.query(`ALTER TABLE chat_users ADD COLUMN IF NOT EXISTS linked_to TEXT`);

  // 1. Seed CC-SUPPORT system account
  await pool.query(
    `INSERT INTO chat_users (coincash_id, name, role, linked_to)
     VALUES ($1, $2, $3, NULL)
     ON CONFLICT (coincash_id) DO UPDATE
       SET name = EXCLUDED.name, role = EXCLUDED.role`,
    [SYSTEM_SUPPORT_ID, "Soporte CoinCash", "system"],
  );

  // 2. Seed CC-801286 as admin linked to CC-SUPPORT
  await pool.query(
    `INSERT INTO chat_users (coincash_id, name, role, linked_to)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (coincash_id) DO UPDATE
       SET name      = EXCLUDED.name,
           role      = EXCLUDED.role,
           linked_to = EXCLUDED.linked_to`,
    [ADMIN_CC_ID, "Soporte CoinCash", "admin", SYSTEM_SUPPORT_ID],
  );

  console.log("[db] chat_users table ready — CC-SUPPORT + admin seeded");
}

/**
 * Register a user CC-ID in chat_users (upsert).
 * Safe to call every time the chat opens — always returns the stored record.
 */
export async function getOrCreateChatUser(coincashId: string): Promise<ChatUserRecord> {
  const res = await pool.query<ChatUserRecord>(
    `INSERT INTO chat_users (coincash_id, name, role, linked_to)
     VALUES ($1, '', 'user', NULL)
     ON CONFLICT (coincash_id) DO UPDATE SET coincash_id = EXCLUDED.coincash_id
     RETURNING id, coincash_id, name, role, linked_to, created_at`,
    [coincashId],
  );
  return res.rows[0];
}

/** Look up a chat user by CoinCash ID. Returns null if not found. */
export async function getChatUserById(coincashId: string): Promise<ChatUserRecord | null> {
  const res = await pool.query<ChatUserRecord>(
    `SELECT id, coincash_id, name, role, linked_to, created_at
       FROM chat_users
      WHERE coincash_id = $1
      LIMIT 1`,
    [coincashId],
  );
  return res.rows[0] ?? null;
}

/** Return all regular (non-system) chat users. Used by broadcast. */
export async function getAllChatUsers(): Promise<ChatUserRecord[]> {
  const res = await pool.query<ChatUserRecord>(
    `SELECT id, coincash_id, name, role, linked_to, created_at
       FROM chat_users
      WHERE role != 'system'
      ORDER BY created_at ASC`,
  );
  return res.rows;
}

// ── Chat contacts ─────────────────────────────────────────────────────────────

export interface ChatContactRecord {
  id:         number;
  user_id:    string;
  contact_id: string;
  created_at: Date;
}

/** Create the chat_contacts table if it doesn't already exist. */
export async function ensureChatContactsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_contacts (
      id         SERIAL    PRIMARY KEY,
      user_id    TEXT      NOT NULL,
      contact_id TEXT      NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, contact_id)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS chat_contacts_user_idx    ON chat_contacts (user_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS chat_contacts_contact_idx ON chat_contacts (contact_id)
  `);
  console.log("[db] chat_contacts table ready");
}

/** Add a contact relationship (idempotent). Returns the record. */
export async function addChatContact(
  userId:    string,
  contactId: string,
): Promise<ChatContactRecord> {
  const res = await pool.query<ChatContactRecord>(
    `INSERT INTO chat_contacts (user_id, contact_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, contact_id) DO UPDATE SET user_id = EXCLUDED.user_id
     RETURNING id, user_id, contact_id, created_at`,
    [userId, contactId],
  );
  return res.rows[0];
}

/** Return all contacts for a given user. */
export async function getChatContacts(userId: string): Promise<ChatContactRecord[]> {
  const res = await pool.query<ChatContactRecord>(
    `SELECT id, user_id, contact_id, created_at
       FROM chat_contacts
      WHERE user_id = $1
      ORDER BY created_at ASC`,
    [userId],
  );
  return res.rows;
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

/** Delete support chat messages older than 24 hours. */
export async function deleteOldChatMessages(): Promise<number> {
  const res = await pool.query(
    `DELETE FROM chat_messages WHERE timestamp < NOW() - INTERVAL '24 hours'`
  );
  return res.rowCount ?? 0;
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

/** Summary of a support conversation for the admin panel. */
export interface ConversationSummary {
  userId:      string;
  lastMessage: string;
  lastTime:    Date;
  lastSender:  string;
}

/**
 * For the admin panel: return the latest message per user who has
 * chatted with CC-SUPPORT, ordered by most-recent first.
 */
export async function getConversationsForSupport(): Promise<ConversationSummary[]> {
  const res = await pool.query<ConversationSummary>(`
    SELECT DISTINCT ON (user_id)
      user_id       AS "userId",
      message       AS "lastMessage",
      timestamp     AS "lastTime",
      sender_coincash_id AS "lastSender"
    FROM (
      SELECT
        CASE
          WHEN sender_coincash_id = 'CC-SUPPORT' THEN receiver_coincash_id
          ELSE sender_coincash_id
        END AS user_id,
        message,
        timestamp,
        sender_coincash_id
      FROM chat_messages
      WHERE sender_coincash_id = 'CC-SUPPORT'
         OR receiver_coincash_id = 'CC-SUPPORT'
    ) sub
    ORDER BY user_id, "lastTime" DESC
  `);
  // Second sort: by time descending across all users
  return res.rows.sort(
    (a, b) => new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime(),
  );
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

// ── Direct Messages (DMs) ─────────────────────────────────────────────────────

export interface DmContact {
  id:         number;
  owner_id:   string;
  contact_id: string;
  nickname:   string | null;
  created_at: Date;
}

export interface DmMessage {
  id:          number;
  sender_id:   string;
  receiver_id: string;
  msg_type:    "text" | "image" | "audio";
  ciphertext:  string | null;
  iv:          string | null;
  object_path: string | null;
  created_at:  Date;
}

export async function ensureDmTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dm_contacts (
      id         SERIAL PRIMARY KEY,
      owner_id   TEXT NOT NULL,
      contact_id TEXT NOT NULL,
      nickname   TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(owner_id, contact_id)
    )
  `);
  // migrate: add nickname if missing
  await pool.query(`ALTER TABLE dm_contacts ADD COLUMN IF NOT EXISTS nickname TEXT`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dm_messages (
      id          SERIAL PRIMARY KEY,
      sender_id   TEXT NOT NULL,
      receiver_id TEXT NOT NULL,
      msg_type    TEXT NOT NULL DEFAULT 'text',
      ciphertext  TEXT,
      iv          TEXT,
      object_path TEXT,
      created_at  TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS dm_msgs_pair_idx ON dm_messages (sender_id, receiver_id)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id         SERIAL PRIMARY KEY,
      cc_id      TEXT NOT NULL,
      endpoint   TEXT NOT NULL,
      p256dh     TEXT NOT NULL,
      auth       TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(cc_id, endpoint)
    )
  `);
  console.log("[db] dm_contacts + dm_messages + push_subscriptions tables ready");
}

export async function setDmContactNickname(
  ownerId:   string,
  contactId: string,
  nickname:  string,
): Promise<void> {
  await pool.query(
    `UPDATE dm_contacts SET nickname = $1 WHERE owner_id = $2 AND contact_id = $3`,
    [nickname.trim() || null, ownerId, contactId],
  );
}

// ── Push subscriptions ──────────────────────────────────────────────────────

export interface PushSub {
  cc_id:    string;
  endpoint: string;
  p256dh:   string;
  auth:     string;
}

export async function savePushSubscription(sub: PushSub): Promise<void> {
  await pool.query(
    `INSERT INTO push_subscriptions (cc_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (cc_id, endpoint) DO UPDATE SET p256dh=$3, auth=$4`,
    [sub.cc_id, sub.endpoint, sub.p256dh, sub.auth],
  );
}

export async function deletePushSubscription(ccId: string, endpoint: string): Promise<void> {
  await pool.query(
    `DELETE FROM push_subscriptions WHERE cc_id=$1 AND endpoint=$2`,
    [ccId, endpoint],
  );
}

export async function getPushSubscriptionsForUser(ccId: string): Promise<PushSub[]> {
  const res = await pool.query<PushSub>(
    `SELECT cc_id, endpoint, p256dh, auth FROM push_subscriptions WHERE cc_id=$1`,
    [ccId],
  );
  return res.rows;
}

export async function addDmContact(ownerId: string, contactId: string): Promise<DmContact | null> {
  const res = await pool.query<DmContact>(
    `INSERT INTO dm_contacts (owner_id, contact_id)
     VALUES ($1, $2)
     ON CONFLICT (owner_id, contact_id) DO NOTHING
     RETURNING *`,
    [ownerId, contactId],
  );
  return res.rows[0] ?? null;
}

export async function getDmContacts(ownerId: string): Promise<DmContact[]> {
  const res = await pool.query<DmContact>(
    `SELECT * FROM dm_contacts WHERE owner_id = $1 ORDER BY created_at DESC`,
    [ownerId],
  );
  return res.rows;
}

export async function removeDmContact(ownerId: string, contactId: string): Promise<void> {
  await pool.query(
    `DELETE FROM dm_contacts WHERE owner_id = $1 AND contact_id = $2`,
    [ownerId, contactId],
  );
}

export async function saveDmMessage(
  senderId:   string,
  receiverId: string,
  msgType:    "text" | "image" | "audio",
  ciphertext: string | null,
  iv:         string | null,
  objectPath: string | null,
): Promise<DmMessage> {
  const res = await pool.query<DmMessage>(
    `INSERT INTO dm_messages (sender_id, receiver_id, msg_type, ciphertext, iv, object_path)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [senderId, receiverId, msgType, ciphertext, iv, objectPath],
  );
  return res.rows[0];
}

export async function getDmMessages(
  userId1: string,
  userId2: string,
  limit = 150,
): Promise<DmMessage[]> {
  const res = await pool.query<DmMessage>(
    `SELECT * FROM dm_messages
      WHERE (sender_id = $1 AND receiver_id = $2)
         OR (sender_id = $2 AND receiver_id = $1)
      ORDER BY created_at ASC
      LIMIT $3`,
    [userId1, userId2, limit],
  );
  return res.rows;
}

// ── Visit tracking ─────────────────────────────────────────────────────────────

/** Create the visit_log table if it doesn't already exist. */
export async function ensureVisitsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS visit_log (
      id           SERIAL    PRIMARY KEY,
      country      TEXT      NOT NULL DEFAULT 'Desconocido',
      country_code TEXT      NOT NULL DEFAULT 'xx',
      visited_at   TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS visit_log_visited_at_idx ON visit_log (visited_at)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS visit_log_country_code_idx ON visit_log (country_code)
  `);
  console.log("[db] visit_log table ready");
}

/** Record a single visit. */
export async function recordVisit(country: string, countryCode: string): Promise<void> {
  await pool.query(
    `INSERT INTO visit_log (country, country_code) VALUES ($1, $2)`,
    [country, countryCode],
  );
}

// ── Account PIN (recovery security) ──────────────────────────────────────────

export async function ensureAccountPinsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS account_pins (
      coincash_id TEXT PRIMARY KEY,
      pin_hash    TEXT NOT NULL,
      created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  console.log("[db] account_pins table ready");
}

export async function setAccountPin(ccId: string, pinHash: string): Promise<void> {
  await pool.query(
    `INSERT INTO account_pins (coincash_id, pin_hash, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (coincash_id) DO UPDATE SET pin_hash = $2, updated_at = NOW()`,
    [ccId, pinHash],
  );
}

export async function getAccountPinHash(ccId: string): Promise<string | null> {
  const res = await pool.query<{ pin_hash: string }>(
    `SELECT pin_hash FROM account_pins WHERE coincash_id = $1`,
    [ccId],
  );
  return res.rows[0]?.pin_hash ?? null;
}

export async function hasPinSet(ccId: string): Promise<boolean> {
  const res = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM account_pins WHERE coincash_id = $1) AS exists`,
    [ccId],
  );
  return res.rows[0]?.exists ?? false;
}

/** Return total visits, today's visits, online count and per-country breakdown. */
export async function getVisitStats(): Promise<{
  total: number;
  today: number;
  online: number;
  countries: { name: string; code: string; count: number }[];
}> {
  const [totalRes, todayRes, onlineRes, countryRes] = await Promise.all([
    pool.query<{ total: string }>(`SELECT COUNT(*) AS total FROM visit_log`),
    pool.query<{ total: string }>(`SELECT COUNT(*) AS total FROM visit_log WHERE created_at >= DATE_TRUNC('day', NOW())`),
    pool.query<{ total: string }>(`SELECT COUNT(*) AS total FROM visit_log WHERE created_at >= NOW() - INTERVAL '5 minutes'`),
    pool.query<{ name: string; code: string; count: string }>(`
      SELECT country AS name, country_code AS code, COUNT(*) AS count
        FROM visit_log
       GROUP BY country, country_code
       ORDER BY count DESC
       LIMIT 5
    `),
  ]);

  const total  = parseInt(totalRes.rows[0]?.total  ?? "0", 10);
  const today  = parseInt(todayRes.rows[0]?.total  ?? "0", 10);
  const online = parseInt(onlineRes.rows[0]?.total ?? "0", 10);

  const countries = countryRes.rows.map((r) => ({
    name:  r.name,
    code:  r.code,
    count: parseInt(r.count, 10),
  }));

  return { total, today, online, countries };
}
