"use strict";
/**
 * Permission scopes — single source of truth shared between web (operator)
 * and the Electron agent. Both sides import from here so a stale fork
 * cannot accidentally grant capabilities the other side denies.
 *
 * The scope system is the security pillar of TeamDesk: each scope's level
 * is encoded in the JWT issued at session start, the agent validates the
 * signature locally before initializing the matching native modules, and
 * higher-level capabilities physically do not load when the scope forbids
 * them — the input injector is never instantiated under SCREEN_ONLY, so
 * a compromised UI cannot inject events even if it tried to call it.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCOPE_LEVEL = exports.SCOPES = void 0;
exports.capsForScope = capsForScope;
exports.scopeCovers = scopeCovers;
exports.SCOPES = [
    { id: 'SCREEN_ONLY', level: 1, label: 'Screen only', sub: 'Read-only video stream' },
    { id: 'SCREEN_CONTROL', level: 2, label: 'Screen + Control', sub: 'Mouse, keyboard, touch input' },
    { id: 'SCREEN_FILES', level: 3, label: 'Screen + Files', sub: 'Adds dual-pane file system' },
    { id: 'FULL_CONTROL', level: 4, label: 'Full control', sub: 'Clipboard, terminal, commands' },
];
exports.SCOPE_LEVEL = {
    SCREEN_ONLY: 1,
    SCREEN_CONTROL: 2,
    SCREEN_FILES: 3,
    FULL_CONTROL: 4,
};
function capsForScope(scope) {
    const lvl = exports.SCOPE_LEVEL[scope] ?? 1;
    return {
        canControl: lvl >= 2,
        canClipboard: lvl >= 2,
        canRegion: lvl >= 2,
        canMultimon: lvl >= 2,
        canFiles: lvl >= 3,
        canTerminal: lvl >= 4,
        canCAD: lvl >= 4,
        canElevate: lvl >= 4,
    };
}
function scopeCovers(active, required) {
    return (exports.SCOPE_LEVEL[active] ?? 0) >= (exports.SCOPE_LEVEL[required] ?? Infinity);
}
