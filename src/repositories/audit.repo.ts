import type { AuditEvent } from '@/domain/types';

export interface AuditRepository {
  /**
   * Persisted writes happen async and never block the UI — the in-memory
   * AuditEventBus is the source of truth for live display, and the repo
   * only mirrors events to durable storage for compliance/forensics.
   */
  append(userId: string, machineId: string, sessionId: string, event: AuditEvent): Promise<void>;

  /**
   * Read APIs are paginated because audit logs grow without bound.
   * `before` is the timestamp cursor (epoch ms).
   */
  findBySession(userId: string, machineId: string, sessionId: string, opts?: { limit?: number; before?: number }): Promise<AuditEvent[]>;
}
