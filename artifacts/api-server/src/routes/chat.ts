// @ts-nocheck
// Chat routes
// POST /api/chat/create-user           — generate or register a CoinCash ID
// POST /api/chat/user                  — register a CoinCash ID in chat_users (legacy)
// GET  /api/chat/user/:coincash_id     — look up a chat user by CoinCash ID
// POST /api/chat/add-contact           — add a contact by CoinCash ID
// GET  /api/chat/contacts/:coincash_id — list contacts for a user
// POST /api/chat/messages              — send a message (REST + Socket.io emit)
// GET  /api/chat/messages              — fetch messages ?user=CC-XXX[&peer=CC-YYY]
// GET  /api/chat/messages/:user1/:user2 — fetch conversation between two users
// POST /api/chat/broadcast             — send CC-SUPPORT message to all users

import { Router } from "express";
import {
  saveChatMessage, getChatMessages, getConversation,
  getOrCreateChatUser, getChatUserById, getAllChatUsers,
  addChatContact, getChatContacts, getConversationsForSupport,
} from "../lib/db";

const SUPPORT_ID = "CC-SUPPORT";
const CC_RE      = /^CC-\d{6}$/;
const VALID_ID   = (id: string) => CC_RE.test(id) || id === SUPPORT_ID;
const router     = Router();

// ── Helper ────────────────────────────────────────────────────────────────────
function formatMsg(m: any) {
  return {
    id:           m.id,
    senderCcId:   m.sender_coincash_id,
    receiverCcId: m.receiver_coincash_id,
    message:      m.message,
    timestamp:    m.timestamp,
  };
}

function generateCcId(): string {
  const n = Math.floor(Math.random() * 1_000_000);
  return `CC-${String(n).padStart(6, "0")}`;
}

// ── POST /api/chat/create-user ─────────────────────────────────────────────────
/**
 * Body: { coincashId?: string }
 * If coincashId is provided and valid, registers that ID.
 * If omitted, generates a new random CC-XXXXXX.
 * Returns: { coincashId, createdAt }
 */
router.post("/chat/create-user", async (req, res) => {
  let { coincashId } = req.body ?? {};

  if (coincashId !== undefined) {
    // Caller supplied an ID — validate it
    if (typeof coincashId !== "string" || !CC_RE.test(coincashId)) {
      return res.status(400).json({ error: "coincashId must match CC-XXXXXX" });
    }
  } else {
    // Generate a fresh ID (retry up to 5 times to avoid collision)
    for (let i = 0; i < 5; i++) {
      coincashId = generateCcId();
      const existing = await getChatUserById(coincashId).catch(() => null);
      if (!existing) break;
    }
  }

  try {
    const user = await getOrCreateChatUser(coincashId);
    console.log(`[chat-users] create-user: ${coincashId}`);
    return res.json({ coincashId: user.coincash_id, createdAt: user.created_at });
  } catch (err: any) {
    console.error("[chat-users] create-user error:", err?.message);
    return res.status(500).json({ error: "Failed to create user" });
  }
});

// ── POST /api/chat/user (legacy registration) ──────────────────────────────────
/**
 * Body: { coincashId: "CC-XXXXXX" }
 * Registers the CC-ID in chat_users (upsert). Fire-and-forget from frontend.
 */
router.post("/chat/user", async (req, res) => {
  const { coincashId } = req.body ?? {};
  if (!coincashId || !CC_RE.test(coincashId)) {
    return res.status(400).json({ error: "coincashId must match CC-XXXXXX" });
  }
  try {
    const user = await getOrCreateChatUser(coincashId);
    console.log(`[chat-users] registered: ${coincashId}`);
    return res.json({ coincashId: user.coincash_id, createdAt: user.created_at });
  } catch (err: any) {
    console.error("[chat-users] register error:", err?.message);
    return res.status(500).json({ error: "Failed to register user" });
  }
});

// ── GET /api/chat/user/:coincash_id ────────────────────────────────────────────
router.get("/chat/user/:coincash_id", async (req, res) => {
  const ccId = req.params.coincash_id;
  if (!VALID_ID(ccId)) {
    return res.status(400).json({ error: "Invalid CoinCash ID format. Use CC-XXXXXX" });
  }
  try {
    const user = await getChatUserById(ccId);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    return res.json({
      coincashId: user.coincash_id,
      name:       user.name,
      role:       user.role,
      createdAt:  user.created_at,
    });
  } catch (err: any) {
    console.error("[chat-users] lookup error:", err?.message);
    return res.status(500).json({ error: "Failed to look up user" });
  }
});

// ── POST /api/chat/add-contact ─────────────────────────────────────────────────
/**
 * Body: { userId: "CC-XXXXXX", contactId: "CC-YYYYYY" }
 * Validates both users exist, then persists the contact relationship.
 * Returns: { userId, contactId, createdAt }
 */
router.post("/chat/add-contact", async (req, res) => {
  const { userId, contactId } = req.body ?? {};

  if (!userId || !CC_RE.test(userId)) {
    return res.status(400).json({ error: "userId must be a valid CC-XXXXXX" });
  }
  if (!contactId || !VALID_ID(contactId)) {
    return res.status(400).json({ error: "contactId must be a valid CC-XXXXXX or CC-SUPPORT" });
  }
  if (userId === contactId) {
    return res.status(400).json({ error: "Cannot add yourself as a contact" });
  }

  try {
    // Ensure both users are registered
    const [userRec, contactRec] = await Promise.all([
      getChatUserById(userId),
      getChatUserById(contactId),
    ]);
    if (!userRec)    return res.status(404).json({ error: "Usuario no encontrado" });
    if (!contactRec) return res.status(404).json({ error: "Contacto no encontrado" });

    const row = await addChatContact(userId, contactId);
    console.log(`[chat-contacts] ${userId} → ${contactId}`);
    return res.json({ userId: row.user_id, contactId: row.contact_id, createdAt: row.created_at });
  } catch (err: any) {
    console.error("[chat-contacts] error:", err?.message);
    return res.status(500).json({ error: "Failed to add contact" });
  }
});

// ── GET /api/chat/contacts/:coincash_id ────────────────────────────────────────
router.get("/chat/contacts/:coincash_id", async (req, res) => {
  const ccId = req.params.coincash_id;
  if (!CC_RE.test(ccId)) {
    return res.status(400).json({ error: "Invalid CoinCash ID format. Use CC-XXXXXX" });
  }
  try {
    const rows = await getChatContacts(ccId);
    return res.json({ contacts: rows.map(r => ({ contactId: r.contact_id, addedAt: r.created_at })) });
  } catch (err: any) {
    console.error("[chat-contacts] list error:", err?.message);
    return res.status(500).json({ error: "Failed to list contacts" });
  }
});

// ── POST /api/chat/broadcast ───────────────────────────────────────────────────
/**
 * Body: { adminKey, message }
 * Admin-only: sends a message from CC-SUPPORT to every registered user.
 */
router.post("/chat/broadcast", async (req, res) => {
  const { adminKey, message } = req.body ?? {};
  const validKey = process.env.ADMIN_BROADCAST_KEY || "coincash-admin-dev";
  if (!adminKey || adminKey !== validKey) {
    return res.status(403).json({ error: "Unauthorized" });
  }
  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "message is required" });
  }
  try {
    const users    = await getAllChatUsers();
    const text     = message.trim();
    const io       = req.app.get("io");
    const saved    = await Promise.all(users.map(u => saveChatMessage(SUPPORT_ID, u.coincash_id, text)));

    // Push via Socket.io to all connected users
    if (io) {
      saved.forEach((m) => {
        const msg = formatMsg(m);
        io.to(m.receiver_coincash_id).emit("receive_message", msg);
      });
    }

    console.log(`[chat-broadcast] Sent to ${users.length} users: "${text.slice(0, 60)}"`);
    return res.json({ sent: users.length, message: text });
  } catch (err: any) {
    console.error("[chat-broadcast] error:", err?.message);
    return res.status(500).json({ error: "Broadcast failed" });
  }
});

// ── POST /api/chat/messages ────────────────────────────────────────────────────
/**
 * Body: { senderCcId, message, receiverCcId? }
 * Admin proxy: if sender has role='admin' + linked_to, stores as CC-SUPPORT.
 * Also emits receive_message via Socket.io to connected clients.
 */
router.post("/chat/messages", async (req, res) => {
  const { senderCcId, message, receiverCcId = SUPPORT_ID } = req.body ?? {};

  if (!senderCcId || typeof senderCcId !== "string" || !CC_RE.test(senderCcId)) {
    return res.status(400).json({ error: "senderCcId must be a valid CoinCash ID (CC-XXXXXX)" });
  }
  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return res.status(400).json({ error: "message is required" });
  }

  try {
    const senderRecord    = await getChatUserById(senderCcId);
    const effectiveSender = senderRecord?.linked_to ?? senderCcId;
    const isAdmin         = senderRecord?.role === "admin" && !!senderRecord.linked_to;

    const saved = await saveChatMessage(effectiveSender, receiverCcId, message.trim());
    const msg   = formatMsg(saved);
    const io    = req.app.get("io");

    // Push real-time to receiver and sender
    if (io) {
      io.to(receiverCcId).emit("receive_message", msg);
      io.to(senderCcId).emit("receive_message", msg);
    }

    if (!isAdmin) {
      const reply = await saveChatMessage(
        SUPPORT_ID,
        senderCcId,
        "Gracias por tu mensaje. Un agente de soporte se pondrá en contacto contigo pronto.",
      );
      const replyMsg = formatMsg(reply);
      if (io) {
        io.to(senderCcId).emit("receive_message", replyMsg);
        io.to(SUPPORT_ID).emit("receive_message", replyMsg);
      }
      return res.json({ sent: msg, reply: replyMsg });
    }

    return res.json({ sent: msg });
  } catch (err: any) {
    console.error("[chat] send error:", err?.message);
    return res.status(500).json({ error: "Failed to save message" });
  }
});

// ── GET /api/chat/messages?user=CC-XXX[&peer=CC-YYY] ──────────────────────────
router.get("/chat/messages", async (req, res) => {
  const { user, peer } = req.query as { user?: string; peer?: string };
  if (!user || !CC_RE.test(user)) {
    return res.status(400).json({ error: "user must be a valid CoinCash ID (CC-XXXXXX)" });
  }
  if (peer !== undefined && !VALID_ID(peer)) {
    return res.status(400).json({ error: "peer must be CC-SUPPORT or a valid CC-XXXXXX" });
  }
  try {
    const userRecord    = await getChatUserById(user);
    const effectiveUser = userRecord?.linked_to ?? user;
    const rows = peer
      ? await getConversation(effectiveUser, peer)
      : await getChatMessages(effectiveUser);
    return res.json({ messages: rows.map(formatMsg) });
  } catch (err: any) {
    console.error("[chat] fetch error:", err?.message);
    return res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// ── GET /api/chat/messages/:user1/:user2 ───────────────────────────────────────
/**
 * Fetch the full conversation between user1 and user2.
 * Resolves admin proxy for user1 if applicable.
 */
router.get("/chat/messages/:user1/:user2", async (req, res) => {
  const { user1, user2 } = req.params;

  if (!CC_RE.test(user1) && user1 !== SUPPORT_ID) {
    return res.status(400).json({ error: "user1 must be CC-XXXXXX or CC-SUPPORT" });
  }
  if (!CC_RE.test(user2) && user2 !== SUPPORT_ID) {
    return res.status(400).json({ error: "user2 must be CC-XXXXXX or CC-SUPPORT" });
  }

  try {
    const user1Rec     = CC_RE.test(user1) ? await getChatUserById(user1) : null;
    const effectiveU1  = user1Rec?.linked_to ?? user1;
    const rows         = await getConversation(effectiveU1, user2);
    return res.json({ messages: rows.map(formatMsg) });
  } catch (err: any) {
    console.error("[chat] conversation fetch error:", err?.message);
    return res.status(500).json({ error: "Failed to fetch conversation" });
  }
});

// ── GET /api/chat/conversations ───────────────────────────────────────────────
/**
 * Admin panel: returns list of all users who've messaged CC-SUPPORT,
 * with their latest message and timestamp. Sorted by most-recent first.
 */
router.get("/chat/conversations", async (_req, res) => {
  try {
    const conversations = await getConversationsForSupport();
    return res.json({ conversations });
  } catch (err: any) {
    console.error("[chat] conversations error:", err?.message);
    return res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

export default router;
