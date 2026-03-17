import { useEffect, useRef, useCallback, useState } from "react";
import { io, Socket } from "socket.io-client";
import { SOCKET_URL, SOCKET_PATH } from "@/lib/apiConfig";

export interface DmMsg {
  id:         number;
  senderId:   string;
  receiverId: string;
  msgType:    "text" | "image" | "audio";
  ciphertext: string | null;
  iv:         string | null;
  objectPath: string | null;
  createdAt:  string;
}

interface UseDmSocketOptions {
  myId:      string | null;
  onReceive: (msg: DmMsg) => void;
}

export function useDmSocket({ myId, onReceive }: UseDmSocketOptions) {
  const socketRef    = useRef<Socket | null>(null);
  const onReceiveRef = useRef(onReceive);
  const [connected, setConnected] = useState(false);
  onReceiveRef.current = onReceive;

  useEffect(() => {
    if (!myId) return;

    const socket = io(SOCKET_URL, { path: SOCKET_PATH, transports: ["polling", "websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("register", myId);
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("dm_receive", (msg: DmMsg) => onReceiveRef.current(msg));

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [myId]);

  const sendDm = useCallback((
    to: string,
    msgType: "text" | "image" | "audio",
    opts: { ciphertext?: string; iv?: string; objectPath?: string },
  ) => {
    socketRef.current?.emit("dm_send", { to, msgType, ...opts });
  }, []);

  return { sendDm, connected };
}
