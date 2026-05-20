/**
 * SignalingClient — Singleton wrapper around the Socket.IO connection to
 * `server.ts`. Replaces the previous `lib/socket.ts` and adds typed
 * helpers so the rest of the code does not see Socket.IO directly.
 *
 * Why Singleton: a single browser tab should hold exactly one signaling
 * connection. Multiple PeerConnections share the same socket, identifying
 * messages by `target` (room id). Creating a second socket from a stray
 * caller would silently break room joins.
 */

'use client';

import { io, type Socket } from 'socket.io-client';
import type { SignalData } from 'simple-peer';

export interface SignalPayload {
  target: string;
  caller: string;
  signal: SignalData;
}

export interface IceCandidatePayload {
  target: string;
  caller: string;
  signal: SignalData;
}

type SignalHandler = (data: SignalPayload) => void;
type IceHandler = (data: IceCandidatePayload) => void;

export class SignalingClient {
  private static _instance: SignalingClient | null = null;

  private readonly socket: Socket;

  private constructor() {
    // In dev the signaling runs on the same origin (server.ts wraps it).
    // In production it lives on Cloud Run (or wherever) and the URL is
    // injected at build time via NEXT_PUBLIC_SIGNALING_URL — empty string
    // falls back to same-origin, which is what we want for `npm run dev`.
    const url = process.env.NEXT_PUBLIC_SIGNALING_URL ?? '';
    this.socket = io(url, {
      path: '/socket.io',
      autoConnect: false,
      transports: ['websocket', 'polling'],
    });
  }

  static getInstance(): SignalingClient {
    if (!SignalingClient._instance) {
      SignalingClient._instance = new SignalingClient();
    }
    return SignalingClient._instance;
  }

  get id(): string | undefined {
    return this.socket.id;
  }

  connect(): void {
    if (!this.socket.connected) this.socket.connect();
  }

  disconnect(): void {
    if (this.socket.connected) this.socket.disconnect();
  }

  joinRoom(roomId: string, userId?: string): void {
    this.connect();
    this.socket.emit('join-room', roomId, userId);
  }

  /** Operator-side authenticated join. Password goes in cleartext to the
   *  server (over TLS in prod); the server compares against the stored
   *  hash. Listen via `onAuthError` for failures. */
  joinRoomSecure(roomId: string, password: string, userId?: string): void {
    this.connect();
    this.socket.emit('join-room-secure', { roomId, password, userId });
  }

  onAuthError(handler: (data: { reason: string }) => void): () => void {
    this.socket.on('auth-error', handler);
    return () => this.socket.off('auth-error', handler);
  }
  onJoinOk(handler: (data: { roomId: string }) => void): () => void {
    this.socket.on('join-ok', handler);
    return () => this.socket.off('join-ok', handler);
  }

  sendOffer(payload: SignalPayload): void {
    this.socket.emit('offer', payload);
  }

  sendAnswer(payload: SignalPayload): void {
    this.socket.emit('answer', payload);
  }

  sendIceCandidate(payload: IceCandidatePayload): void {
    this.socket.emit('ice-candidate', payload);
  }

  /** Returns an unsubscribe handle so consumers can clean up on unmount. */
  onOffer(handler: SignalHandler): () => void {
    this.socket.on('offer', handler);
    return () => this.socket.off('offer', handler);
  }
  onAnswer(handler: SignalHandler): () => void {
    this.socket.on('answer', handler);
    return () => this.socket.off('answer', handler);
  }
  onIceCandidate(handler: IceHandler): () => void {
    this.socket.on('ice-candidate', handler);
    return () => this.socket.off('ice-candidate', handler);
  }
  onUserConnected(handler: (peerId: string) => void): () => void {
    this.socket.on('user-connected', handler);
    return () => this.socket.off('user-connected', handler);
  }
}

export const getSignalingClient = (): SignalingClient => SignalingClient.getInstance();
