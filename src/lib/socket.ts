import { io, Socket } from "socket.io-client";

let socket: Socket;

// Legacy export kept for `use-webrtc.ts` (the monolithic hook the new
// SessionMediator is replacing). New code should consume the typed
// SignalingClient singleton from `@/services/signaling-client` instead.
export const getSocket = (): Socket => {
    if (!socket) {
        const url = process.env.NEXT_PUBLIC_SIGNALING_URL ?? "";
        socket = io(url, {
            path: "/socket.io",
            autoConnect: false,
            transports: ["websocket", "polling"],
        });
    }
    return socket;
};
