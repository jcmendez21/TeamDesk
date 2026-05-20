/**
 * scope-guard — Decorator that wraps any handler so it only runs when the
 * caller's active scope covers the required scope. Denials emit a
 * `SCOPE_DENIED` audit event so misbehavior is visible in the live feed.
 *
 * The whole point of running this in front of every input/file/terminal
 * handler is that scope checks become impossible to forget — `peer-factory`
 * cables the input channel through `withScope(handleInput, 'SCREEN_CONTROL')`
 * once, and the rest of the system inherits the guarantee.
 */

import { scopeCovers, type ScopeId } from '@/domain/scopes';
import { auditBus } from '@/services/audit-bus';

export interface ScopeContext {
  /** The currently active scope for the running session. */
  current: () => ScopeId;
  /** Session ID used when emitting denial audit events. */
  sessionId: () => string;
}

export function withScope<Args extends unknown[]>(
  handler: (...args: Args) => void,
  required: ScopeId,
  ctx: ScopeContext,
): (...args: Args) => void {
  return (...args: Args) => {
    const active = ctx.current();
    if (!scopeCovers(active, required)) {
      auditBus.emit({
        sessionId: ctx.sessionId(),
        type: 'SCOPE_DENIED',
        text: `Action requiring ${required} dropped — active scope is ${active}`,
        meta: { active, required },
      });
      return;
    }
    handler(...args);
  };
}
