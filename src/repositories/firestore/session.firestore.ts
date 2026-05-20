import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  arrayUnion,
  query,
  orderBy,
  limit as fsLimit,
  type Firestore,
  type DocumentData,
} from 'firebase/firestore';
import type { Session, SessionStatus, ChatMessage } from '@/domain/types';
import type { ScopeId } from '@/domain/scopes';
import type { SessionRepository, OpenSessionInput } from '@/repositories/session.repo';

function toSession(id: string, data: DocumentData): Session {
  return {
    id,
    userId: data.userId,
    machineId: data.machineId,
    connectionId: data.connectionId,
    scope: data.scope as ScopeId,
    startedAt: data.startedAt,
    endedAt: data.endedAt ?? undefined,
    status: (data.status ?? 'active') as SessionStatus,
    recordingUrl: data.recordingUrl ?? undefined,
    closeReason: data.closeReason ?? undefined,
  };
}

export class FirestoreSessionRepository implements SessionRepository {
  constructor(private readonly db: Firestore) {}

  async open(input: OpenSessionInput): Promise<Session> {
    const now = Date.now();
    const ref = collection(this.db, `users/${input.userId}/machines/${input.machineId}/sessions`);
    const payload = {
      userId: input.userId,
      machineId: input.machineId,
      connectionId: input.connectionId,
      scope: input.scope,
      startedAt: now,
      status: 'active' as SessionStatus,
    };
    const docRef = await addDoc(ref, payload);
    return toSession(docRef.id, payload);
  }

  async close(userId: string, machineId: string, sessionId: string, status: SessionStatus, reason?: string): Promise<void> {
    await updateDoc(
      doc(this.db, `users/${userId}/machines/${machineId}/sessions/${sessionId}`),
      { status, endedAt: Date.now(), closeReason: reason ?? null },
    );
  }

  async findByMachine(userId: string, machineId: string, limit = 50): Promise<Session[]> {
    const ref = collection(this.db, `users/${userId}/machines/${machineId}/sessions`);
    const snap = await getDocs(query(ref, orderBy('startedAt', 'desc'), fsLimit(limit)));
    return snap.docs.map((d) => toSession(d.id, d.data()));
  }

  async findById(userId: string, machineId: string, sessionId: string): Promise<Session | null> {
    const snap = await getDoc(doc(this.db, `users/${userId}/machines/${machineId}/sessions/${sessionId}`));
    return snap.exists() ? toSession(snap.id, snap.data()) : null;
  }

  async appendChat(userId: string, machineId: string, sessionId: string, message: ChatMessage): Promise<void> {
    await updateDoc(
      doc(this.db, `users/${userId}/machines/${machineId}/sessions/${sessionId}`),
      { chat: arrayUnion(message) },
    );
  }
}
