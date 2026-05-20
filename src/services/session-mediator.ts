/**
 * SessionMediator — Mediator pattern. Owns the lifecycle of a single
 * remote-control session and the relationships between its parts:
 * signaling, peer, scope, audit, telemetry. Components and hooks talk to
 * the mediator only; they never wire `simple-peer` to the audit bus
 * themselves.
 *
 * This is also where the scope-guard is bolted onto incoming input
 * messages so a `SCREEN_ONLY` token cannot be ignored by a misbehaving
 * client — even if the operator UI tries to send mousemoves, the host
 * mediator drops them and emits `SCOPE_DENIED`.
 */

'use client';

import type { ChatMessage } from '@/domain/types';
import type { ScopeId } from '@/domain/scopes';
import type {
  ChatMsg,
  ControlMsg,
  FileMsg,
  InputMsg,
} from '@teamdesk/shared';
import { auditBus } from '@/services/audit-bus';
import { withScope, type ScopeContext } from '@/services/scope-guard';
import { PeerConnectionFactory, RemotePeer, type PeerRole } from '@/services/peer-factory';
import {
  AutoStrategy,
  FixedStrategy,
  type ConnectionStats,
  type QualityProfile,
  type QualityStrategy,
} from '@/services/quality-strategy';

export interface SessionMediatorOptions {
  sessionId: string;
  connectionId: string;
  role: PeerRole;
  initialScope: ScopeId;
  stream?: MediaStream;
  /** Operator-side: cleartext password forwarded to signaling. */
  password?: string;
}

export type MediatorEvent =
  | { type: 'connected' }
  | { type: 'closed' }
  | { type: 'stream'; stream: MediaStream }
  | { type: 'profile'; profile: QualityProfile }
  | { type: 'telemetry'; stats: ConnectionStats }
  | { type: 'auth-error'; reason: string };

type MediatorListener = (event: MediatorEvent) => void;

export class SessionMediator {
  private peer: RemotePeer | null = null;
  private scope: ScopeId;
  private listeners = new Set<MediatorListener>();
  private strategy: QualityStrategy = new AutoStrategy();
  private currentProfile: QualityProfile | null = null;
  private telemetryTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly opts: SessionMediatorOptions) {
    this.scope = opts.initialScope;
  }

  // ── Public API ───────────────────────────────────────────────────────────

  start(): void {
    this.peer = this.opts.role === 'operator'
      ? PeerConnectionFactory.createOperator(this.opts.connectionId, {
          password: this.opts.password,
          onAuthError: (reason) => {
            auditBus.log(this.opts.sessionId, 'SCOPE_DENIED', `Signaling auth failed: ${reason}`);
            this.emit({ type: 'auth-error', reason });
          },
        })
      : PeerConnectionFactory.createHost(this.opts.connectionId, this.opts.stream!);

    this.peer.onConnect(() => {
      auditBus.log(this.opts.sessionId, 'CONNECTION_EVENT', 'WebRTC peer connection established · DTLS-SRTP');
      this.emit({ type: 'connected' });
      this.startTelemetryLoop();
    });

    this.peer.onClose(() => {
      auditBus.log(this.opts.sessionId, 'CONNECTION_EVENT', 'WebRTC peer connection closed');
      this.stopTelemetryLoop();
      this.emit({ type: 'closed' });
    });

    this.peer.onStream((stream) => {
      this.emit({ type: 'stream', stream });
    });

    // Wire incoming channels through scope-guard before the consumer sees them.
    const ctx: ScopeContext = {
      current: () => this.scope,
      sessionId: () => this.opts.sessionId,
    };

    this.peer.on('input', withScope((msg: InputMsg) => this.dispatch('input', msg), 'SCREEN_CONTROL', ctx));
    this.peer.on('file',  withScope((msg: FileMsg)  => this.dispatch('file',  msg), 'SCREEN_FILES',   ctx));
    this.peer.on('chat',  (msg: ChatMsg) => this.dispatch('chat', msg));     // chat is allowed at every scope
    this.peer.on('control', (msg: ControlMsg) => this.handleControl(msg));

    auditBus.log(this.opts.sessionId, 'SCOPE_CHANGE', `Scope ${this.scope} active`, { scope: this.scope });
  }

  stop(): void {
    this.peer?.destroy();
    this.peer = null;
    this.stopTelemetryLoop();
  }

  /** Operator-side: send an input/file/chat message, gated by local scope. */
  sendInput(msg: InputMsg): void {
    if (this.scope === 'SCREEN_ONLY') return;
    this.peer?.send('input', msg);
  }
  sendFile(msg: FileMsg): void {
    if (this.scope === 'SCREEN_ONLY' || this.scope === 'SCREEN_CONTROL') return;
    this.peer?.send('file', msg);
  }
  sendChat(message: ChatMessage): void {
    const wire: ChatMsg = {
      type: 'chat',
      id: message.id,
      from: message.from,
      text: message.text,
      ts: message.ts,
    };
    this.peer?.send('chat', wire);
  }
  requestScope(requested: ScopeId): void {
    this.peer?.send('control', { type: 'scope:request', requested });
  }

  setActiveScope(scope: ScopeId): void {
    if (scope === this.scope) return;
    const prev = this.scope;
    this.scope = scope;
    auditBus.log(this.opts.sessionId, 'SCOPE_CHANGE', `Scope changed ${prev} → ${scope}`, { from: prev, to: scope });
  }

  setQualityStrategy(strategy: QualityStrategy | 'auto' | 'high' | 'medium' | 'low'): void {
    this.strategy = typeof strategy === 'string'
      ? (strategy === 'auto' ? new AutoStrategy() : new FixedStrategy(strategy))
      : strategy;
  }

  // ── Subscriptions ────────────────────────────────────────────────────────

  on(listener: MediatorListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private channelListeners = new Map<string, Set<(msg: unknown) => void>>();

  /** Dispatch validated messages to subscribers — hooks subscribe per channel. */
  onChannel<T>(channel: 'input' | 'file' | 'chat', handler: (msg: T) => void): () => void {
    let set = this.channelListeners.get(channel);
    if (!set) {
      set = new Set();
      this.channelListeners.set(channel, set);
    }
    set.add(handler as (msg: unknown) => void);
    return () => set!.delete(handler as (msg: unknown) => void);
  }

  private dispatch(channel: 'input' | 'file' | 'chat', msg: unknown): void {
    const set = this.channelListeners.get(channel);
    if (!set) return;
    for (const h of set) h(msg);
  }

  private handleControl(msg: ControlMsg): void {
    switch (msg.type) {
      case 'scope:request':
        // Host side: a real implementation prompts the user. For now we
        // log the request and let the UI decide.
        auditBus.log(this.opts.sessionId, 'SCOPE_CHANGE', `Operator requested ${msg.requested}`, { requested: msg.requested });
        break;
      case 'scope:granted':
        this.setActiveScope(msg.active);
        break;
      case 'scope:denied':
        auditBus.log(this.opts.sessionId, 'SCOPE_DENIED', `Scope ${msg.requested} denied: ${msg.reason}`);
        break;
      case 'telemetry':
        this.applyTelemetry(msg);
        break;
    }
  }

  private applyTelemetry(stats: { rttMs: number; lossPct: number; bandwidthMbps: number }): void {
    this.emit({ type: 'telemetry', stats });
    const profile = this.strategy.next(stats);
    if (!this.currentProfile || profile.id !== this.currentProfile.id) {
      this.currentProfile = profile;
      this.emit({ type: 'profile', profile });
    }
  }

  private startTelemetryLoop(): void {
    this.stopTelemetryLoop();
    // Real WebRTC stats wiring lands when the agent is on the other side.
    // For now, the loop is a no-op shell — the strategy still gets exercised
    // by mediator.applyTelemetry when a control message arrives.
    this.telemetryTimer = setInterval(() => {
      // intentional placeholder — see Step 9.
    }, 2000);
  }

  private stopTelemetryLoop(): void {
    if (this.telemetryTimer) {
      clearInterval(this.telemetryTimer);
      this.telemetryTimer = null;
    }
  }

  private emit(event: MediatorEvent): void {
    for (const l of this.listeners) {
      try { l(event); } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[mediator] listener threw', err);
      }
    }
  }
}
