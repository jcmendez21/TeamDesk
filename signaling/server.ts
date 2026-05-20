/**
 * attachSignaling — wires the Socket.IO room relay onto any http.Server.
 *
 * Lifted out of `server.ts` so the same room/relay logic is reused by:
 *   - the local dev server (Next.js + signaling on :3000)
 *   - the standalone Cloud Run / Render deploy (Socket.IO only)
 *
 * Auth model:
 *   - Hosts (the Electron agent, primarily) call `register-room` with a
 *     SHA-256 hash of the room password. The signaling stores the hash
 *     per room and treats the registering socket as the host.
 *   - Operators call `join-room-secure` with the *cleartext* password.
 *     The server hashes it server-side and compares to the stored hash.
 *     Mismatch → `auth-error` and the socket is NOT added to the room.
 *   - The legacy `join-room` event (no password) is preserved for the
 *     old web-as-host path. A room registered with a password rejects
 *     legacy joins via `auth-error`.
 *
 * State is in-memory only. A signaling restart drops every active room.
 */

import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { createHash } from 'crypto';

export interface AttachOptions {
  /** CORS origin — '*' for dev, the App Hosting URL for prod. */
  corsOrigin?: string | string[];
}

interface SignalPayload {
  target: string;
  caller?: string;
  signal: unknown;
}

interface RoomRecord {
  passwordHash: string;
  hostSocketId: string;
}

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

export function attachSignaling(httpServer: HttpServer, opts: AttachOptions = {}): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: opts.corsOrigin ?? '*',
      methods: ['GET', 'POST'],
    },
  });

  // roomId → record. Pruned when the host disconnects.
  const rooms = new Map<string, RoomRecord>();

  io.on('connection', (socket) => {
    // eslint-disable-next-line no-console
    console.log('[signaling] client connected:', socket.id);

    // ── Host registers a room with its password hash ─────────────────────
    socket.on('register-room', (payload: { roomId: string; passwordHash: string }) => {
      const { roomId, passwordHash } = payload ?? {};
      if (!roomId || typeof passwordHash !== 'string' || passwordHash.length < 16) {
        socket.emit('register-error', { reason: 'invalid-payload' });
        return;
      }
      const existing = rooms.get(roomId);
      if (existing && existing.hostSocketId !== socket.id) {
        socket.emit('register-error', { reason: 'room-taken' });
        return;
      }
      rooms.set(roomId, { passwordHash, hostSocketId: socket.id });
      socket.join(roomId);
      socket.emit('registered', { roomId });
      // eslint-disable-next-line no-console
      console.log(`[signaling] room ${roomId} registered by host ${socket.id}`);
    });

    // ── Operator joins with a cleartext password ────────────────────────
    socket.on('join-room-secure', (payload: { roomId: string; password: string; userId?: string }) => {
      const { roomId, password, userId } = payload ?? {};
      const record = rooms.get(roomId);
      if (!record) {
        socket.emit('auth-error', { reason: 'no-such-room' });
        return;
      }
      if (sha256(password ?? '') !== record.passwordHash) {
        socket.emit('auth-error', { reason: 'bad-password' });
        return;
      }
      socket.join(roomId);
      socket.emit('join-ok', { roomId });
      socket.to(roomId).emit('user-connected', userId ?? socket.id);
      // eslint-disable-next-line no-console
      console.log(`[signaling] operator ${socket.id} authed into room ${roomId}`);
    });

    // ── Legacy: no auth, rejected if the room has a password ────────────
    socket.on('join-room', (roomId: string, userId?: string) => {
      const record = rooms.get(roomId);
      if (record) {
        socket.emit('auth-error', { reason: 'password-required' });
        return;
      }
      socket.join(roomId);
      socket.to(roomId).emit('user-connected', userId ?? socket.id);
      // eslint-disable-next-line no-console
      console.log(`[signaling] ${userId ?? socket.id} joined unsecured room ${roomId}`);
    });

    // ── WebRTC relay ────────────────────────────────────────────────────
    socket.on('offer',         (p: SignalPayload) => socket.to(p.target).emit('offer', p));
    socket.on('answer',        (p: SignalPayload) => socket.to(p.target).emit('answer', p));
    socket.on('ice-candidate', (p: SignalPayload) => socket.to(p.target).emit('ice-candidate', p));

    socket.on('disconnect', () => {
      // eslint-disable-next-line no-console
      console.log('[signaling] client disconnected:', socket.id);
      // If the host of any room disconnects, drop that room so it doesn't
      // become squatted. A reconnect from the agent will re-register.
      for (const [roomId, record] of rooms.entries()) {
        if (record.hostSocketId === socket.id) {
          rooms.delete(roomId);
          // eslint-disable-next-line no-console
          console.log(`[signaling] room ${roomId} dropped (host left)`);
        }
      }
    });
  });

  return io;
}
