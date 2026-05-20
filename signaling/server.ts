/**
 * attachSignaling — wires the Socket.IO room relay onto any http.Server.
 *
 * Lifted out of `server.ts` so the same room/relay logic is reused by:
 *   - the local dev server (Next.js + signaling on :3000)
 *   - the standalone Cloud Run deploy (Socket.IO only, no Next.js)
 *
 * Keep this file dependency-free apart from `socket.io` so the deploy image
 * stays small and so any drift between dev and prod is impossible.
 */

import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';

export interface AttachOptions {
  /** CORS origin — '*' for dev, the App Hosting URL for prod. */
  corsOrigin?: string | string[];
}

interface SignalPayload {
  target: string;
  caller?: string;
  signal: unknown;
}

export function attachSignaling(httpServer: HttpServer, opts: AttachOptions = {}): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: opts.corsOrigin ?? '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    // eslint-disable-next-line no-console
    console.log('[signaling] client connected:', socket.id);

    socket.on('join-room', (roomId: string, userId?: string) => {
      socket.join(roomId);
      // eslint-disable-next-line no-console
      console.log(`[signaling] ${userId ?? socket.id} joined room ${roomId}`);
      socket.to(roomId).emit('user-connected', userId ?? socket.id);
    });

    socket.on('offer',         (p: SignalPayload) => socket.to(p.target).emit('offer', p));
    socket.on('answer',        (p: SignalPayload) => socket.to(p.target).emit('answer', p));
    socket.on('ice-candidate', (p: SignalPayload) => socket.to(p.target).emit('ice-candidate', p));

    socket.on('disconnect', () => {
      // eslint-disable-next-line no-console
      console.log('[signaling] client disconnected:', socket.id);
    });
  });

  return io;
}
