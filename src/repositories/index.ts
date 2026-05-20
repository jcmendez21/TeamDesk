/**
 * Repository factory — build all four repos from a single Firestore handle.
 * Pages and services use `getRepositories(firestore)` instead of importing
 * the concrete implementations directly. Swapping backends later means
 * editing only this file.
 */

import type { Firestore } from 'firebase/firestore';

import type { MachineRepository } from './machine.repo';
import type { SessionRepository } from './session.repo';
import type { AuditRepository } from './audit.repo';
import type { UserRepository } from './user.repo';

import { FirestoreMachineRepository } from './firestore/machine.firestore';
import { FirestoreSessionRepository } from './firestore/session.firestore';
import { FirestoreAuditRepository } from './firestore/audit.firestore';
import { FirestoreUserRepository } from './firestore/user.firestore';

export interface Repositories {
  machines: MachineRepository;
  sessions: SessionRepository;
  audit: AuditRepository;
  users: UserRepository;
}

export function getRepositories(db: Firestore): Repositories {
  return {
    machines: new FirestoreMachineRepository(db),
    sessions: new FirestoreSessionRepository(db),
    audit: new FirestoreAuditRepository(db),
    users: new FirestoreUserRepository(db),
  };
}

export type {
  MachineRepository,
  SessionRepository,
  AuditRepository,
  UserRepository,
};
