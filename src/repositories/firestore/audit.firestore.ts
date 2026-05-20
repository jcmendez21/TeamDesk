import {
  collection,
  getDocs,
  addDoc,
  query,
  orderBy,
  where,
  limit as fsLimit,
  type Firestore,
  type DocumentData,
  type QueryConstraint,
} from 'firebase/firestore';
import type { AuditEvent, AuditEventType } from '@/domain/types';
import type { AuditRepository } from '@/repositories/audit.repo';

function toEvent(id: string, data: DocumentData): AuditEvent {
  return {
    id,
    sessionId: data.sessionId,
    type: data.type as AuditEventType,
    text: data.text,
    ts: data.ts,
    meta: data.meta ?? undefined,
  };
}

export class FirestoreAuditRepository implements AuditRepository {
  constructor(private readonly db: Firestore) {}

  async append(userId: string, machineId: string, sessionId: string, event: AuditEvent): Promise<void> {
    const ref = collection(
      this.db,
      `users/${userId}/machines/${machineId}/sessions/${sessionId}/audit`,
    );
    const { id: _id, ...rest } = event;
    await addDoc(ref, rest);
  }

  async findBySession(
    userId: string,
    machineId: string,
    sessionId: string,
    opts: { limit?: number; before?: number } = {},
  ): Promise<AuditEvent[]> {
    const ref = collection(
      this.db,
      `users/${userId}/machines/${machineId}/sessions/${sessionId}/audit`,
    );
    const constraints: QueryConstraint[] = [];
    if (opts.before !== undefined) constraints.push(where('ts', '<', opts.before));
    constraints.push(orderBy('ts', 'desc'), fsLimit(opts.limit ?? 50));
    const snap = await getDocs(query(ref, ...constraints));
    return snap.docs.map((d) => toEvent(d.id, d.data()));
  }
}
