import type { Session, SessionStatus, ChatMessage } from '@/domain/types';
import type { ScopeId } from '@/domain/scopes';

export interface OpenSessionInput {
  userId: string;
  machineId: string;
  connectionId: string;
  scope: ScopeId;
}

export interface SessionRepository {
  open(input: OpenSessionInput): Promise<Session>;
  close(userId: string, machineId: string, sessionId: string, status: SessionStatus, reason?: string): Promise<void>;
  findByMachine(userId: string, machineId: string, limit?: number): Promise<Session[]>;
  findById(userId: string, machineId: string, sessionId: string): Promise<Session | null>;
  appendChat(userId: string, machineId: string, sessionId: string, message: ChatMessage): Promise<void>;
}
