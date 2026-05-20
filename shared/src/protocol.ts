/**
 * Wire protocol for messages flowing over the WebRTC RTCDataChannels
 * between the operator (web) and the host (web today, Electron agent next).
 *
 * Each channel carries a single message family — splitting them avoids
 * head-of-line blocking between high-frequency input events and bulk
 * file transfers. The discriminated union below documents what is legal
 * on each channel; the runtime guards in `peer-factory` reject messages
 * that arrive on the wrong channel.
 */

import type { ScopeId } from './scopes';

// ── Input channel (low-latency, unordered) ─────────────────────────────────

export type InputMsg =
  | { type: 'mousemove'; x: number; y: number }            // x,y in 0..1 normalized
  | { type: 'mousedown'; x: number; y: number; button: 0 | 1 | 2 }
  | { type: 'mouseup';   x: number; y: number; button: 0 | 1 | 2 }
  | { type: 'wheel';     x: number; y: number; dx: number; dy: number }
  | { type: 'keydown';   code: string; key: string; modifiers: KeyModifiers }
  | { type: 'keyup';     code: string; key: string; modifiers: KeyModifiers }
  | { type: 'cad' }                                        // Ctrl+Alt+Del / SAS
  | { type: 'clipboard'; text: string };

export interface KeyModifiers {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

// ── File channel (reliable, ordered) ───────────────────────────────────────

export type FileMsg =
  | { type: 'file:meta';    transferId: string; name: string; size: number; sha256: string; chunks: number }
  | { type: 'file:chunk';   transferId: string; index: number; data: string /* base64 */; sha256: string }
  | { type: 'file:ack';     transferId: string; index: number }
  | { type: 'file:pause';   transferId: string }
  | { type: 'file:resume';  transferId: string; fromIndex: number }
  | { type: 'file:cancel';  transferId: string }
  | { type: 'file:done';    transferId: string };

export const FILE_CHUNK_BYTES = 64 * 1024;

// ── Chat channel ───────────────────────────────────────────────────────────

export interface ChatMsg {
  type: 'chat';
  id: string;
  from: 'operator' | 'host';
  text: string;
  ts: number;
}

// ── Control channel (scope changes, telemetry feedback) ────────────────────

export type ControlMsg =
  | { type: 'scope:request'; requested: ScopeId }
  | { type: 'scope:granted'; active: ScopeId }
  | { type: 'scope:denied';  requested: ScopeId; reason: string }
  | { type: 'telemetry'; rttMs: number; lossPct: number; bandwidthMbps: number };

// ── Aggregate ──────────────────────────────────────────────────────────────

export type ChannelName = 'input' | 'file' | 'chat' | 'control';

export type AnyMsg = InputMsg | FileMsg | ChatMsg | ControlMsg;
