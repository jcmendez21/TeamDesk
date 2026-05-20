/**
 * Firestore-backed MachineRepository. Path layout
 * (`/users/{userId}/machines/{machineId}`) and the `userId` mirror on the
 * document body match what `firestore.rules` enforces — keep those in
 * sync if the schema changes.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as fsLimit,
  type Firestore,
  type DocumentData,
} from 'firebase/firestore';
import type { Machine, MachineStatus, NewMachineInput } from '@/domain/types';
import type { MachineRepository } from '@/repositories/machine.repo';

function toMachine(id: string, data: DocumentData): Machine {
  return {
    id,
    userId: data.userId,
    name: data.name,
    description: data.description ?? undefined,
    connectionId: data.connectionId,
    status: (data.status ?? 'unknown') as MachineStatus,
    os: data.os ?? undefined,
    arch: data.arch ?? undefined,
    hostname: data.hostname ?? undefined,
    lastSeenAt: data.lastSeenAt ?? undefined,
    createdAt: data.createdAt ?? Date.now(),
    updatedAt: data.updatedAt ?? data.createdAt ?? Date.now(),
  };
}

export class FirestoreMachineRepository implements MachineRepository {
  constructor(private readonly db: Firestore) {}

  async findByUserId(userId: string): Promise<Machine[]> {
    const ref = collection(this.db, `users/${userId}/machines`);
    const snap = await getDocs(query(ref, orderBy('name')));
    return snap.docs.map((d) => toMachine(d.id, d.data()));
  }

  async findById(userId: string, machineId: string): Promise<Machine | null> {
    const snap = await getDoc(doc(this.db, `users/${userId}/machines/${machineId}`));
    return snap.exists() ? toMachine(snap.id, snap.data()) : null;
  }

  async findByConnectionId(userId: string, connectionId: string): Promise<Machine | null> {
    const ref = collection(this.db, `users/${userId}/machines`);
    const snap = await getDocs(query(ref, where('connectionId', '==', connectionId), fsLimit(1)));
    const first = snap.docs[0];
    return first ? toMachine(first.id, first.data()) : null;
  }

  async create(userId: string, input: NewMachineInput): Promise<Machine> {
    const now = Date.now();
    const ref = collection(this.db, `users/${userId}/machines`);
    const payload = {
      ...input,
      userId,
      status: 'offline' as MachineStatus,
      createdAt: now,
      updatedAt: now,
    };
    const docRef = await addDoc(ref, payload);
    return toMachine(docRef.id, payload);
  }

  async update(userId: string, machineId: string, patch: Partial<Machine>): Promise<void> {
    const { id: _id, userId: _u, createdAt: _c, ...rest } = patch;
    await updateDoc(
      doc(this.db, `users/${userId}/machines/${machineId}`),
      { ...rest, updatedAt: Date.now() },
    );
  }

  async delete(userId: string, machineId: string): Promise<void> {
    await deleteDoc(doc(this.db, `users/${userId}/machines/${machineId}`));
  }
}
