"use strict";
/**
 * InputInjector — Factory + Adapter for OS-level input injection.
 *
 * The agent's whole reason to exist: a browser tab cannot inject real
 * mouse/keyboard events into the OS, the agent can. The injector is the
 * piece that does it.
 *
 * Today all three OSes share the same `NutInjector` because
 * `@nut-tree-fork/nut-js` wraps the per-OS APIs uniformly (SendInput on
 * Windows, CGEventPost on macOS, uinput/XTest on Linux). The Factory
 * remains in place so per-OS subclasses can override behavior later
 * (e.g. a DXGI-aware Windows injector that can post to the Secure
 * Desktop, which nut-js cannot reach).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.InputInjectorFactory = void 0;
class InputInjectorFactory {
    static create() {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { NutInjector } = require('./nut-injector');
        return new NutInjector();
    }
}
exports.InputInjectorFactory = InputInjectorFactory;
