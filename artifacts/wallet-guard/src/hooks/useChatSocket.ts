import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { SOCKET_URL, SOCKET_PATH } from "@/lib/apiConfig";

export interface ChatMessage {
  id: number;
  senderCcId: string;
  receiverCcId: string;
  message: string;
  timestamp: string;
}

export function useChatSocket(myCcId: string | null) {
  const socketRef      = useRef<Socket | null>(null);
  const [connected, setConnected]       = useState(false);
  const [messages,  setMessages]        = useState<ChatMessage[]>([]);
  const [reconnectCount, setReconnectCount] = useState(0);

  useEffect(() => {
    if (!myCcId) return;

    const socket = io(SOCKET_URL, {
      path: SOCKET_PATH,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("register", myCcId);
      setReconnectCount((n) => n + 1);
    });

    socket.on("disconnect", () => setConnected(false));

    socket.on("receive_message", (msg: ChatMessage) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [myCcId]);

  const sendMessage = useCallback(
    (receiverCcId: string, text: string) => {
      if (!socketRef.current || !myCcId || !text.trim()) return;
      socketRef.current.emit("send_message", {
        senderCcId: myCcId,
        receiverCcId,
        message: text.trim(),
      });
    },
    [myCcId],
  );

  const loadHistory = useCallback((msgs: ChatMessage[]) => {
    setMessages(msgs);
  }, []);

  const mergeMessages = useCallback((msgs: ChatMessage[]) => {
    setMessages((prev) => {
      const existingIds = new Set(prev.map((m) => m.id));
      const incoming    = msgs.filter((m) => !existingIds.has(m.id));
      if (incoming.length === 0) return prev;
      return [...prev, ...incoming].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
    });
  }, []);

  return { connected, messages, sendMessage, loadHistory, mergeMessages, reconnectCount };
}
