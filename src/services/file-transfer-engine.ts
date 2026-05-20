/**
 * FileTransferEngine — chunked, SHA-256 verified, resumable file transfer
 * over the file RTCDataChannel.
 *
 * Wire protocol (defined in `shared/protocol.ts`):
 *   sender                                                receiver
 *     ─ file:meta  ──────────────────────────────────────►
 *                                          file:ack idx=0 ◄─
 *     ─ file:chunk idx=0 ──────────────────────────────────►
 *                                          file:ack idx=0 ◄─
 *     ...
 *     ─ file:done  ──────────────────────────────────────►
 *
 * Backpressure: the sender waits for the previous chunk's ACK before
 * sending the next. This trades throughput for simplicity and a clean
 * resume semantics — at any moment the receiver can request `file:resume`
 * with the last index it ack'd.
 *
 * The engine is transport-agnostic: it takes a `send` callback and emits
 * snapshots of the queue. The `useFileChannel` hook adapts it to React.
 */

import type { FileMsg } from '@teamdesk/shared';
import { FILE_CHUNK_BYTES } from '@teamdesk/shared';
import type { TransferItem, TransferStatus } from '@/domain/types';
import { auditBus } from '@/services/audit-bus';

const ENC = new TextEncoder();

async function sha256Hex(bytes: Uint8Array | ArrayBuffer): Promise<string> {
  // crypto.subtle.digest expects a BufferSource backed by ArrayBuffer; the
  // TS lib widens Uint8Array's buffer to ArrayBufferLike (which includes
  // SharedArrayBuffer) so we hand it the underlying ArrayBuffer slice.
  const buf = bytes instanceof Uint8Array
    ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    : bytes;
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

interface OutboundTransfer {
  item: TransferItem;
  file: File;
  ackedIndex: number;        // -1 means meta hasn't been ack'd yet
  paused: boolean;
}

interface InboundTransfer {
  item: TransferItem;
  parts: Uint8Array[];       // accumulator
  expectedSha: string;
}

export interface EngineEvents {
  /** Called whenever a transfer's status changes. */
  onChange: (transfers: TransferItem[]) => void;
  /** Called once a download finishes; supplies the assembled Blob. */
  onComplete?: (item: TransferItem, blob: Blob) => void;
}

export class FileTransferEngine {
  private outbound = new Map<string, OutboundTransfer>();
  private inbound = new Map<string, InboundTransfer>();

  constructor(
    private readonly send: (msg: FileMsg) => void,
    private readonly events: EngineEvents,
    private readonly sessionId: string,
  ) {}

  // ── Public API ───────────────────────────────────────────────────────────

  async enqueueUpload(file: File): Promise<string> {
    const transferId = `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const buf = new Uint8Array(await file.arrayBuffer());
    const sha = await sha256Hex(buf);
    const chunks = Math.max(1, Math.ceil(file.size / FILE_CHUNK_BYTES));
    const item: TransferItem = {
      id: transferId,
      sessionId: this.sessionId,
      name: file.name,
      sizeBytes: file.size,
      direction: 'up',
      status: 'in_progress',
      chunksTotal: chunks,
      chunksDone: 0,
      sha256: sha,
      startedAt: Date.now(),
    };
    this.outbound.set(transferId, { item, file, ackedIndex: -1, paused: false });
    this.emitChange();

    this.send({ type: 'file:meta', transferId, name: file.name, size: file.size, sha256: sha, chunks });
    auditBus.log(this.sessionId, 'FILE_TRANSFER', `Upload started → ${file.name} (${file.size} B)`);
    return transferId;
  }

  pause(transferId: string): void {
    const t = this.outbound.get(transferId);
    if (!t) return;
    t.paused = true;
    this.updateOutbound(transferId, { status: 'paused' });
    this.send({ type: 'file:pause', transferId });
  }

  resume(transferId: string): void {
    const t = this.outbound.get(transferId);
    if (!t) return;
    t.paused = false;
    this.updateOutbound(transferId, { status: 'in_progress' });
    this.send({ type: 'file:resume', transferId, fromIndex: t.ackedIndex + 1 });
    void this.pumpNextChunk(transferId);
  }

  cancel(transferId: string): void {
    if (this.outbound.delete(transferId)) {
      this.updateOutbound(transferId, { status: 'cancelled' }, /*kept*/ false);
    }
    if (this.inbound.delete(transferId)) {
      this.emitChange();
    }
    this.send({ type: 'file:cancel', transferId });
  }

  /** Feed every incoming `file:*` message — call from the channel handler. */
  async handleIncoming(msg: FileMsg): Promise<void> {
    switch (msg.type) {
      case 'file:meta':       return this.onMeta(msg);
      case 'file:ack':        return this.onAck(msg);
      case 'file:chunk':      return this.onChunk(msg);
      case 'file:pause':      return this.updateOutbound(msg.transferId, { status: 'paused' });
      case 'file:resume':     return this.onRemoteResume(msg);
      case 'file:cancel':     return this.cancel(msg.transferId);
      case 'file:done':       return this.onDone(msg);
    }
  }

  // ── Receiver ─────────────────────────────────────────────────────────────

  private onMeta(msg: Extract<FileMsg, { type: 'file:meta' }>): void {
    const item: TransferItem = {
      id: msg.transferId,
      sessionId: this.sessionId,
      name: msg.name,
      sizeBytes: msg.size,
      direction: 'down',
      status: 'in_progress',
      chunksTotal: msg.chunks,
      chunksDone: 0,
      sha256: msg.sha256,
      startedAt: Date.now(),
    };
    this.inbound.set(msg.transferId, { item, parts: [], expectedSha: msg.sha256 });
    this.emitChange();
    // Ack the meta with index -1 to tell the sender to start streaming.
    this.send({ type: 'file:ack', transferId: msg.transferId, index: -1 });
    auditBus.log(this.sessionId, 'FILE_TRANSFER', `Incoming transfer → ${msg.name}`);
  }

  private async onChunk(msg: Extract<FileMsg, { type: 'file:chunk' }>): Promise<void> {
    const t = this.inbound.get(msg.transferId);
    if (!t) return;
    const bytes = base64ToBytes(msg.data);
    const sha = await sha256Hex(bytes);
    if (sha !== msg.sha256) {
      this.updateInbound(msg.transferId, { status: 'failed', error: `chunk ${msg.index} sha mismatch` });
      auditBus.log(this.sessionId, 'FILE_TRANSFER', `Chunk ${msg.index} of ${t.item.name} failed checksum`);
      return;
    }
    t.parts[msg.index] = bytes;
    this.updateInbound(msg.transferId, { chunksDone: t.item.chunksDone + 1 });
    this.send({ type: 'file:ack', transferId: msg.transferId, index: msg.index });
  }

  private onDone(msg: Extract<FileMsg, { type: 'file:done' }>): void {
    const t = this.inbound.get(msg.transferId);
    if (!t) return;
    // Same TS-lib widening as sha256Hex — Blob's constructor wants
    // ArrayBuffer-backed views, so copy each chunk's underlying bytes.
    const parts: BlobPart[] = t.parts.map(
      (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
    );
    const blob = new Blob(parts);
    this.updateInbound(msg.transferId, { status: 'completed', endedAt: Date.now() });
    this.events.onComplete?.(t.item, blob);
    this.inbound.delete(msg.transferId);
    auditBus.log(this.sessionId, 'FILE_TRANSFER', `Transfer completed → ${t.item.name}`);
  }

  // ── Sender ───────────────────────────────────────────────────────────────

  private onAck(msg: Extract<FileMsg, { type: 'file:ack' }>): void {
    const t = this.outbound.get(msg.transferId);
    if (!t) return;
    t.ackedIndex = msg.index;
    if (msg.index >= 0) {
      this.updateOutbound(msg.transferId, { chunksDone: t.item.chunksDone + 1 });
    }
    void this.pumpNextChunk(msg.transferId);
  }

  private onRemoteResume(msg: Extract<FileMsg, { type: 'file:resume' }>): void {
    const t = this.outbound.get(msg.transferId);
    if (!t) return;
    t.ackedIndex = msg.fromIndex - 1;
    t.paused = false;
    this.updateOutbound(msg.transferId, { status: 'in_progress' });
    void this.pumpNextChunk(msg.transferId);
  }

  private async pumpNextChunk(transferId: string): Promise<void> {
    const t = this.outbound.get(transferId);
    if (!t || t.paused) return;
    const next = t.ackedIndex + 1;
    if (next >= t.item.chunksTotal) {
      this.send({ type: 'file:done', transferId });
      this.updateOutbound(transferId, { status: 'completed', endedAt: Date.now() });
      this.outbound.delete(transferId);
      return;
    }
    const start = next * FILE_CHUNK_BYTES;
    const end = Math.min(t.file.size, start + FILE_CHUNK_BYTES);
    const slice = new Uint8Array(await t.file.slice(start, end).arrayBuffer());
    const sha = await sha256Hex(slice);
    this.send({ type: 'file:chunk', transferId, index: next, data: bytesToBase64(slice), sha256: sha });
  }

  // ── State helpers ────────────────────────────────────────────────────────

  private updateOutbound(id: string, patch: Partial<TransferItem>, kept = true): void {
    const t = this.outbound.get(id);
    if (!t) return;
    t.item = { ...t.item, ...patch };
    if (!kept) this.outbound.delete(id);
    this.emitChange();
  }
  private updateInbound(id: string, patch: Partial<TransferItem>): void {
    const t = this.inbound.get(id);
    if (!t) return;
    t.item = { ...t.item, ...patch };
    this.emitChange();
  }

  private emitChange(): void {
    const all = [
      ...Array.from(this.outbound.values()).map((t) => t.item),
      ...Array.from(this.inbound.values()).map((t) => t.item),
    ];
    this.events.onChange(all);
  }
}

// Keep the unused encoder out of the dead-code purge — used in tests soon.
void ENC;
