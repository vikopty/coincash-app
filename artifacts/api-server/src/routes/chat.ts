// @ts-nocheck
// Chat routes
// POST /api/chat/user                  — register a CoinCash ID in chat_users
// GET  /api/chat/user/:coincash_id     — look up a chat user by CoinCash ID
// POST /api/chat/messages              — send a message
// GET  /api/chat/messages?user=CC-XXX  — fetch messages for a user

import { Router } from "express";
import {
  saveChatMessage, getChatMessages, getConversation,
  getOrCreateChatUser, getChatUserById,
} from "../lib/db";

const SUPPORT_ID = "CC-SUPPORT";
const CC_RE      = /^CC-\d{6}$/;
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
 */
router.get("/chat/user/:coincash_id", async (req, res) => {
  const ccId = req.params.coincash_id;
  if (!CC_RE.test(ccId)) {
    return res.status(400).json({ error: "Invalid CoinCash ID format. Use CC-XXXXXX" });
  }
  try {
    const user = await getChatUserById(ccId);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    return res.json({ coincashId: user.coincash_id, createdAt: user.created_at });
  } catch (err: any) {
    console.error("[chat-users] lookup error:", err?.message);
    return res.status(500).json({ error: "Failed to look up user" });
  }
});

/**
 * POST /api/chat/messages
 * Body: { senderCcId, message, receiverCcId? }
 * Saves message and returns auto-reply from support.
 */
router.post("/chat/messages", async (req, res) => {
  const { senderCcId, message, receiverCcId = SUPPORT_ID } = req.body ?? {};

  if (!senderCcId || typeof senderCcId !== "string" || !/^CC-\d{6}$/.test(senderCcId)) {
    return res.status(400).json({ error: "senderCcId must be a valid CoinCash ID (CC-XXXXXX)" });
  }
  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return res.status(400).json({ error: "message is required" });
  }

  try {
    // Save the user's message
    const saved = await saveChatMessage(senderCcId, receiverCcId, message.trim());

    // Auto-reply from support
    const reply = await saveChatMessage(
      SUPPORT_ID,
      senderCcId,
      "Gracias por tu mensaje. Un agente de soporte se pondrá en contacto contigo pronto.",
    );

    return res.json({
      sent:  formatMsg(saved),
      reply: formatMsg(reply),
    });
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
 */
router.get("/chat/messages", async (req, res) => {
  const { user, peer } = req.query as { user?: string; peer?: string };
  if (!user || !/^CC-\d{6}$/.test(user)) {
    return res.status(400).json({ error: "user must be a valid CoinCash ID (CC-XXXXXX)" });
  }
  if (peer !== undefined && peer !== SUPPORT_ID && !/^CC-\d{6}$/.test(peer)) {
    return res.status(400).json({ error: "peer must be CC-SUPPORT or a valid CC-XXXXXX" });
  }
  try {
    const rows = peer
      ? await getConversation(user, peer)
      : await getChatMessages(user);
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
