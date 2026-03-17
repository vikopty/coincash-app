// @ts-nocheck
import { createServer } from "http";
import { Server as SocketIO } from "socket.io";
import app from "./app";
import { saveChatMessage, getChatUserById, saveDmMessage } from "./lib/db";
import { sendPushToUser } from "./routes/push";

const rawPort = process.env["PORT"] ?? "3000";
const port    = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ── HTTP + Socket.io server ───────────────────────────────────────────────────
const httpServer = createServer(app);

const io = new SocketIO(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  // /api is the registered artifact path — both the Vite proxy (dev) and
  // Replit's deployment proxy (prod) route /api/* to this server on port 8080.
  path: "/api/socket.io",
});

// Attach io to the Express app so REST routes can emit events
app.set("io", io);

// ── Socket.io connection handling ─────────────────────────────────────────────
const SUPPORT_ID = "CC-SUPPORT";
const CC_RE      = /^CC-\d{6}$/;

io.on("connection", (socket) => {
  let myId: string | null = null;

  /**
   * register — client announces its CC-ID.
   * Joins a room named after the CC-ID so targeted events can be sent.
   */
  socket.on("register", (ccId: string) => {
    if (!CC_RE.test(ccId)) return;
    myId = ccId;
    socket.join(ccId);

    // Admins also join the CC-SUPPORT room so they receive incoming messages
    getChatUserById(ccId)
      .then((rec) => {
        if (rec?.linked_to) socket.join(rec.linked_to);
      })
      .catch(() => {});

    console.log(`[socket] ${ccId} connected (${socket.id})`);
  });

  /**
   * send_message — client sends a chat message.
   * { senderCcId, receiverCcId, message }
   *
   * Resolves admin → CC-SUPPORT proxy, saves to DB, and emits
   * receive_message to both sender and receiver rooms.
   */
  socket.on("send_message", async ({ senderCcId, receiverCcId, message }) => {
    if (!senderCcId || !CC_RE.test(senderCcId)) return;
    if (!receiverCcId || !message?.trim()) return;

    try {
      // Resolve admin proxy
      const senderRec      = await getChatUserById(senderCcId).catch(() => null);
      const effectiveSender = senderRec?.linked_to ?? senderCcId;
      const isAdmin        = senderRec?.role === "admin" && !!senderRec.linked_to;

      // Save message to DB
      const saved = await saveChatMessage(effectiveSender, receiverCcId, message.trim());
      const msg   = formatMsg(saved);

      // Deliver to receiver room + echo to sender
      io.to(receiverCcId).emit("receive_message", msg);
      io.to(senderCcId).emit("receive_message", msg);

      // Auto-reply: only when a regular user messages CC-SUPPORT
      if (!isAdmin && receiverCcId === SUPPORT_ID) {
        const replyText  = "Gracias por tu mensaje. Un agente de soporte se pondrá en contacto contigo pronto.";
        const reply      = await saveChatMessage(SUPPORT_ID, senderCcId, replyText);
        const replyMsg   = formatMsg(reply);
        io.to(senderCcId).emit("receive_message", replyMsg);
        // Also push to admin(s) watching CC-SUPPORT room
        io.to(SUPPORT_ID).emit("receive_message", replyMsg);
      }
    } catch (err: any) {
      console.error("[socket] send_message error:", err?.message);
      socket.emit("error", { error: "Failed to send message" });
    }
  });

  // ── Direct Message events ───────────────────────────────────────────────────
  socket.on("dm_send", async ({ to, msgType, ciphertext, iv, objectPath }) => {
    if (!myId || !CC_RE.test(to)) return;
    try {
      const saved = await saveDmMessage(
        myId, to,
        (msgType as "text" | "image" | "audio") ?? "text",
        ciphertext  ?? null,
        iv          ?? null,
        objectPath  ?? null,
      );
      const msg = {
        id:          saved.id,
        senderId:    saved.sender_id,
        receiverId:  saved.receiver_id,
        msgType:     saved.msg_type,
        ciphertext:  saved.ciphertext,
        iv:          saved.iv,
        objectPath:  saved.object_path,
        createdAt:   saved.created_at,
      };
      io.to(to).emit("dm_receive", msg);
      io.to(myId).emit("dm_receive", msg);
      // Push notification to receiver (fires & forgets)
      sendPushToUser(to, {
        title: `Nuevo mensaje de ${myId}`,
        body:  msgType === "text" ? "Mensaje cifrado" : msgType === "image" ? "📷 Foto" : "🎤 Nota de voz",
        data:  { senderId: myId },
      }).catch(() => {});
    } catch (err: any) {
      console.error("[socket] dm_send error:", err?.message);
      socket.emit("error", { error: "Failed to send DM" });
    }
  });

  socket.on("disconnect", () => {
    console.log(`[socket] ${myId ?? "?"} disconnected (${socket.id})`);
  });
});

function formatMsg(m: any) {
  return {
    id:          m.id,
    senderCcId:  m.sender_coincash_id,
    receiverCcId: m.receiver_coincash_id,
    message:     m.message,
    timestamp:   m.timestamp,
  };
}

// ── Start server ──────────────────────────────────────────────────────────────
httpServer.listen(port, () => {
  console.log(`Server listening on port ${port} (HTTP + Socket.io)`);
});
