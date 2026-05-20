"use strict";
/**
 * MacInjector — CGEventPost-based injection.
 *
 * On macOS the agent must hold the Accessibility (TCC) entitlement before
 * `@nut-tree-fork/nut-js` can post events. The first run prompts the user
 * to grant it via System Settings — intentional friction, not a bug.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MacInjector = void 0;
class MacInjector {
    async inject(msg) {
        // eslint-disable-next-line no-console
        console.log('[MacInjector] stub:', msg.type);
    }
}
exports.MacInjector = MacInjector;
