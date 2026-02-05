import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = 3000;
// when using middleware `hostname` and `port` must be provided below
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
    const httpServer = createServer((req, res) => {
        const parsedUrl = parse(req.url!, true);
        handle(req, res, parsedUrl);
    });

    const io = new Server(httpServer, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
        },
    });

    io.on("connection", (socket) => {
        console.log("Client connected:", socket.id);

        socket.on("join-room", (roomId, userId) => {
            socket.join(roomId);
            console.log(`User ${userId || socket.id} joined room: ${roomId}`);
            socket.to(roomId).emit("user-connected", userId || socket.id);
        });

        socket.on("offer", (payload) => {
            // payload: { target: string, caller: string, sdp: RTCSessionDescriptionInit }
            socket.to(payload.target).emit("offer", payload);
        });

        socket.on("answer", (payload) => {
            // payload: { target: string, caller: string, sdp: RTCSessionDescriptionInit }
            socket.to(payload.target).emit("answer", payload);
        });

        socket.on("ice-candidate", (payload) => {
            // payload: { target: string, candidate: RTCIceCandidate }
            socket.to(payload.target).emit("ice-candidate", payload);
        });

        socket.on("disconnect", () => {
            console.log("Client disconnected:", socket.id);
        });
    });

    httpServer.listen(port, () => {
        console.log(`> Ready on http://${hostname}:${port}`);
    });
});
