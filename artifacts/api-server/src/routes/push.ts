import { Router } from "express";
import webpush from "web-push";
import { savePushSubscription, deletePushSubscription, getPushSubscriptionsForUser } from "../lib/db";

const router = Router();

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY  ?? "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_MAILTO  = process.env.VAPID_MAILTO      ?? "mailto:admin@coincash.app";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_MAILTO, VAPID_PUBLIC, VAPID_PRIVATE);
}

// GET /api/push/vapid-key
router.get("/push/vapid-key", (_req, res) => {
  res.json({ publicKey: VAPID_PUBLIC });
});

// POST /api/push/subscribe  { ccId, subscription: { endpoint, keys: { p256dh, auth } } }
router.post("/push/subscribe", async (req, res) => {
  const { ccId, subscription } = req.body ?? {};
  if (!ccId || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return res.status(400).json({ error: "Invalid subscription" });
  }
  await savePushSubscription({
    cc_id:    ccId,
    endpoint: subscription.endpoint,
    p256dh:   subscription.keys.p256dh,
    auth:     subscription.keys.auth,
  });
  res.json({ ok: true });
});

// DELETE /api/push/subscribe  { ccId, endpoint }
router.delete("/push/subscribe", async (req, res) => {
  const { ccId, endpoint } = req.body ?? {};
  if (!ccId || !endpoint) return res.status(400).json({ error: "Missing ccId or endpoint" });
  await deletePushSubscription(ccId, endpoint);
  res.json({ ok: true });
});

// Internal helper — called by Socket.io dm_send to push to receiver
export async function sendPushToUser(
  receiverId: string,
  payload: { title: string; body: string; data?: Record<string, string> },
): Promise<void> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  const subs = await getPushSubscriptionsForUser(receiverId);
  await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 60 },
      ).catch(() => {}),
    ),
  );
}

export default router;
