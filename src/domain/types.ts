/**
 * Domain types — the single shape definitions every feature in the web app
 * agrees on. Repositories return these, components consume these, the
 * Firestore wrappers map their raw documents into these. Nothing here knows
 * about Firestore — that isolation is what lets the repository layer swap
 * backends without rewriting the UI.
 *
 * `connectionId` is the 9-digit AnyDesk-style code. `userId` is the Firebase
 * Auth uid and is encoded in the Firestore path; we still carry it on the
 * document so authorization rules can verify path/payload consistency.
 */

import type { ScopeId } from '@teamdesk/shared';

// ── User ───────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  displayName?: string;
  createdAt: number;
}

// ── Machine ────────────────────────────────────────────────────────────────

export type MachineStatus = 'online' | 'offline' | 'unknown';
export type MachineOS = 'windows' | 'macos' | 'linux' | 'unknown';

/**
 * What a registered machine looks like end-to-end. The current UI only
 * collects `name` + `description` (commits 3d25d27 and cb6495b flag this as
 * a bug) — the dashboard form is being expanded to capture every field
 * below, so consumers should never assume optional fields will stay missing.
 */
export interface Machine {
  id: string;
  userId: string;
  name: string;
  description?: string;
  connectionId: string;          // 9-digit code, no spaces
  status: MachineStatus;
  os?: MachineOS;
  arch?: string;                 // e.g. "x64", "arm64"
  hostname?: string;
  lastSeenAt?: number;           // epoch ms — set by agent heartbeat
  createdAt: number;
  updatedAt: number;
}

export type NewMachineInput = Pick<Machine, 'name' | 'description' | 'connectionId' | 'os' | 'arch' | 'hostname'>;

// ── Session ────────────────────────────────────────────────────────────────

export type SessionStatus = 'active' | 'closed' | 'aborted';

export interface Session {
  id: string;
  userId: string;                // operator
  machineId: string;             // target machine document
  connectionId: string;          // 9-digit code used to join the room
  scope: ScopeId;
  startedAt: number;
  endedAt?: number;
  status: SessionStatus;
  recordingUrl?: string;
  closeReason?: string;
}

// ── Audit ──────────────────────────────────────────────────────────────────

export type AuditEventType =
  | 'INPUT_INJECTED'
  | 'FILE_TRANSFER'
  | 'UAC_INTERACTION'
  | 'SCOPE_CHANGE'
  | 'SCOPE_DENIED'
  | 'CONNECTION_EVENT'
  | 'CHAT_MESSAGE'
  | 'TERMINAL_COMMAND';

export interface AuditEvent {
  id: string;
  sessionId: string;
  type: AuditEventType;
  text: string;
  ts: number;                    // epoch ms — formatted at render time
  meta?: Record<string, unknown>;
}

// ── File transfer ──────────────────────────────────────────────────────────

export type TransferDirection = 'up' | 'down';
export type TransferStatus = 'queued' | 'in_progress' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface TransferItem {
  id: string;
  sessionId: string;
  name: string;
  sizeBytes: number;
  direction: TransferDirection;
  status: TransferStatus;
  chunksTotal: number;
  chunksDone: number;
  sha256: string;
  startedAt: number;
  endedAt?: number;
  error?: string;
}

// ── Chat ───────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  sessionId: string;
  from: 'operator' | 'host';
  text: string;
  ts: number;
}
