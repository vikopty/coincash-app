// @ts-nocheck
// Chat routes
// POST /api/chat/user                  — register a CoinCash ID in chat_users
// GET  /api/chat/user/:coincash_id     — look up a chat user by CoinCash ID
// POST /api/chat/messages              — send a message
// GET  /api/chat/messages?user=CC-XXX  — fetch messages for a user

import { Router } from "express";
import {
  saveChatMessage, getChatMessages, getConversation,
  getOrCreateChatUser, getChatUserById, getAllChatUsers,
} from "../lib/db";

const SUPPORT_ID = "CC-SUPPORT";
const CC_RE      = /^CC-\d{6}$/;
const VALID_ID   = (id: string) => CC_RE.test(id) || id === SUPPORT_ID;
const router     = Router();

/**
 * POST /api/chat/user
 * Body: { coincashId: "CC-XXXXXX" }
 * Registers the CC-ID in chat_users (upsert). Called fire-and-forget when
 * the user opens the chat for the first time.
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

/**
 * GET /api/chat/user/:coincash_id
 * Returns the chat user record if found, 404 if not.
 * Accepts CC-XXXXXX and CC-SUPPORT.
 */
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

/**
 * POST /api/chat/broadcast
 * Body: { adminKey, message }
 * Admin-only: sends a message from CC-SUPPORT to every registered user.
 * Protect with ADMIN_BROADCAST_KEY env var (falls back to a dev key if unset).
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
    const promises = users.map(u => saveChatMessage(SUPPORT_ID, u.coincash_id, text));
    await Promise.all(promises);
    console.log(`[chat-broadcast] Sent to ${users.length} users: "${text.slice(0, 60)}"`);
    return res.json({ sent: users.length, message: text });
  } catch (err: any) {
    console.error("[chat-broadcast] error:", err?.message);
    return res.status(500).json({ error: "Broadcast failed" });
  }
});

/**
 * POST /api/chat/messages
 * Body: { senderCcId, message, receiverCcId? }
 *
 * If the sender has role='admin' and linked_to='CC-SUPPORT', the message is
 * stored as coming from CC-SUPPORT (transparent proxy).  The auto-reply is
 * suppressed in that case since the admin IS the support agent.
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
    // Resolve effective sender: admin → linked_to (CC-SUPPORT)
    const senderRecord   = await getChatUserById(senderCcId);
    const effectiveSender = senderRecord?.linked_to ?? senderCcId;
    const isAdmin        = senderRecord?.role === "admin" && !!senderRecord.linked_to;

    // Save the message (from effectiveSender to receiver)
    const saved = await saveChatMessage(effectiveSender, receiverCcId, message.trim());

    // Auto-reply from support only when a regular user messages support
    // (skip if the sender is already the admin acting as support)
    if (!isAdmin) {
      const reply = await saveChatMessage(
        SUPPORT_ID,
        senderCcId,
        "Gracias por tu mensaje. Un agente de soporte se pondrá en contacto contigo pronto.",
      );
      return res.json({ sent: formatMsg(saved), reply: formatMsg(reply) });
    }

    return res.json({ sent: formatMsg(saved) });
  } catch (err: any) {
    console.error("[chat] send error:", err?.message);
    return res.status(500).json({ error: "Failed to save message" });
  }
});

/**
 * GET /api/chat/messages?user=CC-XXXXXX[&peer=CC-YYYYYY]
 * Without peer: returns all messages where user is sender or receiver.
 * With peer:    returns only the conversation between user and peer.
 * peer may also be "CC-SUPPORT".
 *
 * If user has linked_to set (admin), messages are fetched for the linked
 * account (CC-SUPPORT) so the admin sees all support conversations.
 */
router.get("/chat/messages", async (req, res) => {
  const { user, peer } = req.query as { user?: string; peer?: string };
  if (!user || !CC_RE.test(user)) {
    return res.status(400).json({ error: "user must be a valid CoinCash ID (CC-XXXXXX)" });
  }
  if (peer !== undefined && !VALID_ID(peer)) {
    return res.status(400).json({ error: "peer must be CC-SUPPORT or a valid CC-XXXXXX" });
  }
  try {
    // Admin sees CC-SUPPORT's messages instead of their own
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

function formatMsg(m: any) {
  return {
    id:                   m.id,
    senderCcId:           m.sender_coincash_id,
    receiverCcId:         m.receiver_coincash_id,
    message:              m.message,
    timestamp:            m.timestamp,
  };
}

export default router;
