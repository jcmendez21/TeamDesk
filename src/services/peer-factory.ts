/**
 * PeerConnectionFactory + RemotePeer.
 *
 * Wraps `simple-peer` and exposes typed logical "channels" (input, file,
 * chat, control) multiplexed over the single RTCDataChannel that simple-peer
 * provides. The video MediaStream is independent (a separate WebRTC media
 * track) so a degraded video channel never blocks input — that property
 * is intrinsic to WebRTC, not something we have to enforce here.
 *
 * The factory holds the only knowledge of how the wire is set up. The rest
 * of the app depends on `RemotePeer` and never imports `simple-peer`.
 */

'use client';

import type { Instance as PeerInstance, SignalData } from 'simple-peer';
import type {
  AnyMsg,
  ChannelName,
  ChatMsg,
  ControlMsg,
  FileMsg,
  InputMsg,
} from '@teamdesk/shared';
import { getSignalingClient } from '@/services/signaling-client';

// ── Channel routing ────────────────────────────────────────────────────────

const CHANNEL_PREFIX: Record<string, ChannelName> = {
  // Input
  mousemove: 'input', mousedown: 'input', mouseup: 'input', wheel: 'input',
  keydown: 'input', keyup: 'input', cad: 'input', clipboard: 'input',
  // File
  'file:meta': 'file', 'file:chunk': 'file', 'file:ack': 'file',
  'file:pause': 'file', 'file:resume': 'file', 'file:cancel': 'file',
  'file:done': 'file',
  // Chat
  chat: 'chat',
  // Control
  'scope:request': 'control', 'scope:granted': 'control', 'scope:denied': 'control',
  telemetry: 'control',
};

type ChannelHandler<T> = (msg: T) => void;

interface ChannelDef {
  input: InputMsg;
  file: FileMsg;
  chat: ChatMsg;
  control: ControlMsg;
}

// ── RemotePeer ─────────────────────────────────────────────────────────────

export type PeerRole = 'operator' | 'host';

export interface RemotePeerOptions {
  role: PeerRole;
  roomId: string;
  /** Local stream — only the host (broadcaster) provides this. */
  stream?: MediaStream | null;
  iceServers?: RTCIceServer[];
  /** Cleartext password for authenticated join (operator side). Sent to
   *  signaling, which compares against the host's pre-registered hash. */
  password?: string;
  /** Fires if signaling rejects the join (bad password, no such room). */
  onAuthError?: (reason: string) => void;
}

export class RemotePeer {
  private peer: PeerInstance | null = null;
  private connected = false;
  private readonly handlers = new Map<ChannelName, Set<ChannelHandler<AnyMsg>>>();
  private streamHandler: ((s: MediaStream) => void) | null = null;
  private connectHandler: (() => void) | null = null;
  private closeHandler: (() => void) | null = null;
  private signalUnsubs: Array<() => void> = [];

  constructor(private readonly opts: RemotePeerOptions) {}

  // ── Public lifecycle ─────────────────────────────────────────────────────

  start(initiator: boolean): void {
    this.tearDownPeer();
    this.peer = this.buildPeer(initiator);
    this.wireSignaling();
  }

  destroy(): void {
    this.tearDownPeer();
    this.signalUnsubs.forEach((u) => u());
    this.signalUnsubs = [];
    this.handlers.clear();
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ── Channel API ──────────────────────────────────────────────────────────

  on<C extends ChannelName>(channel: C, handler: ChannelHandler<ChannelDef[C]>): () => void {
    let set = this.handlers.get(channel);
    if (!set) {
      set = new Set();
      this.handlers.set(channel, set);
    }
    set.add(handler as ChannelHandler<AnyMsg>);
    return () => set!.delete(handler as ChannelHandler<AnyMsg>);
  }

  send<C extends ChannelName>(_channel: C, msg: ChannelDef[C]): void {
    if (!this.peer || !this.connected) return;
    try {
      this.peer.send(JSON.stringify(msg));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[RemotePeer] send failed', err);
    }
  }

  onStream(handler: (stream: MediaStream) => void): void {
    this.streamHandler = handler;
  }
  onConnect(handler: () => void): void {
    this.connectHandler = handler;
  }
  onClose(handler: () => void): void {
    this.closeHandler = handler;
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private buildPeer(initiator: boolean): PeerInstance {
    // simple-peer ships ESM/CJS interop quirks under Next/Turbopack — keep
    // the `require` form here. Static `import` regresses on the build.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Peer = require('simple-peer');
    const p: PeerInstance = new Peer({
      initiator,
      trickle: true,
      stream: this.opts.stream || undefined,
      config: {
        iceServers: this.opts.iceServers ?? [{ urls: 'stun:stun.l.google.com:19302' }],
      },
      offerOptions: {
        offerToReceiveVideo: true,
        offerToReceiveAudio: true,
      },
    });

    p.on('signal', (data: SignalData) => {
      const sig = getSignalingClient();
      const payload = { target: this.opts.roomId, signal: data, caller: sig.id ?? '' };
      if (data.type === 'offer') sig.sendOffer(payload);
      else if (data.type === 'answer') sig.sendAnswer(payload);
      else sig.sendIceCandidate(payload);
    });

    p.on('connect', () => {
      this.connected = true;
      this.connectHandler?.();
    });

    p.on('data', (raw: Uint8Array) => {
      const text = new TextDecoder().decode(raw);
      let msg: AnyMsg;
      try {
        msg = JSON.parse(text) as AnyMsg;
      } catch {
        return;
      }
      const channel = CHANNEL_PREFIX[msg.type];
      if (!channel) return;
      const set = this.handlers.get(channel);
      if (!set) return;
      for (const h of set) h(msg);
    });

    p.on('stream', (stream: MediaStream) => {
      this.streamHandler?.(stream);
    });

    p.on('close', () => {
      this.connected = false;
      this.closeHandler?.();
    });

    p.on('error', (err: Error) => {
      // eslint-disable-next-line no-console
      console.error('[RemotePeer] error', err);
    });

    return p;
  }

  private wireSignaling(): void {
    const sig = getSignalingClient();
    this.signalUnsubs.forEach((u) => u());
    this.signalUnsubs = [];

    const feed = (data: { signal: SignalData }) => {
      if (this.peer && !this.peer.destroyed) {
        try {
          this.peer.signal(data.signal);
        } catch (err) {
          const msg = (err as Error).message ?? '';
          if (msg.includes('renegotiate')) return;
          // eslint-disable-next-line no-console
          console.error('[RemotePeer] signal error', err);
        }
      }
    };

    // Re-create peer when an OFFER arrives on the receiver — matches the
    // legacy hook's renegotiation handling. Removing this branch breaks
    // reconnection from the operator side.
    const handleOffer = (data: { signal: SignalData }) => {
      if (this.opts.role === 'host' && data.signal.type === 'offer') {
        this.tearDownPeer();
        this.peer = this.buildPeer(false);
      }
      feed(data);
    };

    this.signalUnsubs.push(
      sig.onOffer(handleOffer),
      sig.onAnswer(feed),
      sig.onIceCandidate(feed),
      sig.onAuthError(({ reason }) => this.opts.onAuthError?.(reason)),
    );

    // Empty password means the operator didn't provide one; use the
    // unauthenticated path. Signaling will reject with `password-required`
    // if the target room was actually registered with a password.
    if (this.opts.role === 'operator' && this.opts.password) {
      sig.joinRoomSecure(this.opts.roomId, this.opts.password);
    } else {
      sig.joinRoom(this.opts.roomId);
    }
  }

  private tearDownPeer(): void {
    if (this.peer && !this.peer.destroyed) {
      this.peer.destroy();
    }
    this.peer = null;
    this.connected = false;
  }
}

// ── Factory ────────────────────────────────────────────────────────────────

export class PeerConnectionFactory {
  /** The operator initiates the offer when no stream is being broadcast yet. */
  static createOperator(roomId: string, opts: { password?: string; onAuthError?: (r: string) => void } = {}): RemotePeer {
    const peer = new RemotePeer({ role: 'operator', roomId, password: opts.password, onAuthError: opts.onAuthError });
    peer.start(true);
    return peer;
  }

  /** The host (broadcaster) waits for an offer and answers with its stream. */
  static createHost(roomId: string, stream: MediaStream): RemotePeer {
    const peer = new RemotePeer({ role: 'host', roomId, stream });
    peer.start(false);
    return peer;
  }
}
