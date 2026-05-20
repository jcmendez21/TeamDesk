import {
  doc,
  getDoc,
  setDoc,
  type Firestore,
  type DocumentData,
} from 'firebase/firestore';
import type { User } from '@/domain/types';
import type { UserRepository } from '@/repositories/user.repo';

function toUser(id: string, data: DocumentData): User {
  return {
    id,
    email: data.email,
    displayName: data.displayName ?? undefined,
    createdAt: data.createdAt ?? Date.now(),
  };
}

export class FirestoreUserRepository implements UserRepository {
  constructor(private readonly db: Firestore) {}

  async findById(userId: string): Promise<User | null> {
    const snap = await getDoc(doc(this.db, `users/${userId}`));
    return snap.exists() ? toUser(snap.id, snap.data()) : null;
  }

  async upsert(user: User): Promise<void> {
    await setDoc(doc(this.db, `users/${user.id}`), user, { merge: true });
  }
}
