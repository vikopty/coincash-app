import { Router } from "express";
import {
  addDmContact, getDmContacts, removeDmContact, getDmMessages, setDmContactNickname,
} from "../lib/db";

const router = Router();
const CC_RE  = /^CC-\d{6}$/;

// GET /api/dm/contacts?ownerId=CC-XXXXXX
router.get("/dm/contacts", async (req, res) => {
  const ownerId = req.query.ownerId as string;
  if (!ownerId || !CC_RE.test(ownerId)) {
    return res.status(400).json({ error: "Invalid ownerId" });
  }
  const contacts = await getDmContacts(ownerId);
  res.json({ contacts });
});

// POST /api/dm/contacts   { ownerId, contactId }
router.post("/dm/contacts", async (req, res) => {
  const { ownerId, contactId } = req.body ?? {};
  if (!CC_RE.test(ownerId) || !CC_RE.test(contactId)) {
    return res.status(400).json({ error: "Invalid CC-IDs" });
  }
  if (ownerId === contactId) {
    return res.status(400).json({ error: "No puedes agregarte a ti mismo" });
  }
  const contact = await addDmContact(ownerId, contactId);
  res.json({ contact });
});

// PUT /api/dm/contacts/nickname   { ownerId, contactId, nickname }
router.put("/dm/contacts/nickname", async (req, res) => {
  const { ownerId, contactId, nickname } = req.body ?? {};
  if (!CC_RE.test(ownerId) || !CC_RE.test(contactId)) {
    return res.status(400).json({ error: "Invalid CC-IDs" });
  }
  await setDmContactNickname(ownerId, contactId, nickname ?? "");
  res.json({ ok: true });
});

// DELETE /api/dm/contacts  { ownerId, contactId }
router.delete("/dm/contacts", async (req, res) => {
  const { ownerId, contactId } = req.body ?? {};
  if (!CC_RE.test(ownerId) || !CC_RE.test(contactId)) {
    return res.status(400).json({ error: "Invalid CC-IDs" });
  }
  await removeDmContact(ownerId, contactId);
  res.json({ ok: true });
});

// GET /api/dm/messages?userId1=CC-XXXXXX&userId2=CC-YYYYYY
router.get("/dm/messages", async (req, res) => {
  const { userId1, userId2 } = req.query as Record<string, string>;
  if (!CC_RE.test(userId1) || !CC_RE.test(userId2)) {
    return res.status(400).json({ error: "Invalid CC-IDs" });
  }
  const messages = await getDmMessages(userId1, userId2);
  res.json({ messages });
});

export default router;
