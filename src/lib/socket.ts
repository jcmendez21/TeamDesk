import { io, Socket } from "socket.io-client";

let socket: Socket;

export const getSocket = (): Socket => {
    if (!socket) {
        socket = io({
            path: "/socket.io", // Default path for socket.io
            autoConnect: false,
        });
    }
    return socket;
};
