/**
 * Local copy of the wire-protocol types so the agent's compile graph
 * stays self-contained (rootDir = src). The single source of truth lives
 * in `shared/src/protocol.ts` + `shared/src/scopes.ts` — when those grow,
 * mirror the relevant additions here. Keeping these as types (no runtime
 * values) means nothing actually drifts at the binary level.
 */

export type ScopeId =
  | 'SCREEN_ONLY'
  | 'SCREEN_CONTROL'
  | 'SCREEN_FILES'
  | 'FULL_CONTROL';

export interface KeyModifiers {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

export type InputMsg =
  | { type: 'mousemove'; x: number; y: number }
  | { type: 'mousedown'; x: number; y: number; button: 0 | 1 | 2 }
  | { type: 'mouseup';   x: number; y: number; button: 0 | 1 | 2 }
  | { type: 'wheel';     x: number; y: number; dx: number; dy: number }
  | { type: 'keydown';   code: string; key: string; modifiers: KeyModifiers }
  | { type: 'keyup';     code: string; key: string; modifiers: KeyModifiers }
  /** Text-as-input. Mobile soft keyboards don't fire reliable keydown/keyup
   *  events; the renderer captures the `input` event and forwards the
   *  inserted text here. The agent calls keyboard.type(text). */
  | { type: 'type-text'; text: string }
  | { type: 'cad' }
  | { type: 'clipboard'; text: string };
