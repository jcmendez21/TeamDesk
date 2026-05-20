"use strict";
/**
 * Local copy of the wire-protocol types so the agent's compile graph
 * stays self-contained (rootDir = src). The single source of truth lives
 * in `shared/src/protocol.ts` + `shared/src/scopes.ts` — when those grow,
 * mirror the relevant additions here. Keeping these as types (no runtime
 * values) means nothing actually drifts at the binary level.
 */
Object.defineProperty(exports, "__esModule", { value: true });
