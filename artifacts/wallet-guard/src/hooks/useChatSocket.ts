import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

export interface ChatMessage {
  id: number;
  senderCcId: string;
  receiverCcId: string;
  message: string;
  timestamp: string;
}

const SOCKET_PATH = "/api-server/socket.io";

export function useChatSocket(myCcId: string | null) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    if (!myCcId) return;

    const socket = io("", {
      path: SOCKET_PATH,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("register", myCcId);
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

  return { connected, messages, sendMessage, loadHistory };
}
