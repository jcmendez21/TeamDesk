/**
 * MachineRepository — what every consumer (UI page, mediator, audit hook)
 * sees. Concrete implementations live alongside this file in `firestore/`.
 *
 * Returning domain `Machine` objects (not raw Firestore snapshots) is the
 * whole point: when we eventually swap Firestore for Postgres, only the
 * implementation behind this interface changes.
 */

import type { Machine, NewMachineInput } from '@/domain/types';

export interface MachineRepository {
  findByUserId(userId: string): Promise<Machine[]>;
  findById(userId: string, machineId: string): Promise<Machine | null>;
  findByConnectionId(userId: string, connectionId: string): Promise<Machine | null>;
  create(userId: string, input: NewMachineInput): Promise<Machine>;
  update(userId: string, machineId: string, patch: Partial<Machine>): Promise<void>;
  delete(userId: string, machineId: string): Promise<void>;
}
