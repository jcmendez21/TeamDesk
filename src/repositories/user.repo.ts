import type { User } from '@/domain/types';

export interface UserRepository {
  findById(userId: string): Promise<User | null>;
  upsert(user: User): Promise<void>;
}
