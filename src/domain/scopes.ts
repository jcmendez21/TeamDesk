/**
 * The web app re-exports scopes from the shared package so it can keep
 * importing from `@/domain/scopes` consistently — agent and web both end
 * up referencing the same source-of-truth in `shared/src/scopes.ts`.
 */

export {
  SCOPES,
  SCOPE_LEVEL,
  capsForScope,
  scopeCovers,
} from '@teamdesk/shared';

export type {
  ScopeId,
  ScopeDescriptor,
  ScopeCapabilities,
} from '@teamdesk/shared';
