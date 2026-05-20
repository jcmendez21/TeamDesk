/**
 * AuditEventBus — Observer pattern for the live audit feed.
 *
 * Producers (peer-factory, scope-guard, file-channel, etc.) emit events via
 * `auditBus.emit(...)`. Consumers — the on-screen feed component, the
 * AuditRepository persister, the connection-event indicator on the top bar
 * — subscribe with `auditBus.on(...)`. Producers and consumers never know
 * about each other, which keeps the dependency graph acyclic when scope
 * gating, telemetry and UI all need the same stream.
 *
 * Singleton per process: there is exactly one bus per browser tab. Tests
 * may instantiate a fresh `AuditEventBus` directly; production code uses
 * the exported `auditBus`.
 */

import type { AuditEvent, AuditEventType } from '@/domain/types';

type Listener = (event: AuditEvent) => void;

let _id = 0;

export class AuditEventBus {
  private listeners = new Set<Listener>();

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: Omit<AuditEvent, 'id' | 'ts'> & { ts?: number; id?: string }): AuditEvent {
    const full: AuditEvent = {
      id: event.id ?? `ev_${Date.now()}_${++_id}`,
      ts: event.ts ?? Date.now(),
      sessionId: event.sessionId,
      type: event.type,
      text: event.text,
      meta: event.meta,
    };
    for (const l of this.listeners) {
      try {
        l(full);
      } catch (err) {
        // A misbehaving listener must not stop the rest of the chain.
        // eslint-disable-next-line no-console
        console.error('[audit-bus] listener threw', err);
      }
    }
    return full;
  }

  /** Convenience helper for the most common shape. */
  log(sessionId: string, type: AuditEventType, text: string, meta?: Record<string, unknown>): AuditEvent {
    return this.emit({ sessionId, type, text, meta });
  }
}

export const auditBus = new AuditEventBus();
