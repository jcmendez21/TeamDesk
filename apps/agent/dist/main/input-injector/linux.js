"use strict";
/**
 * LinuxInjector — XTest under X11, uinput under Wayland.
 *
 * `@nut-tree-fork/nut-js` selects the backend automatically. Wayland imposes
 * extra hurdles (the portal must grant remote-desktop perms via
 * `xdg-desktop-portal`); document the failure mode rather than silently
 * dropping inputs.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LinuxInjector = void 0;
class LinuxInjector {
    async inject(msg) {
        // eslint-disable-next-line no-console
        console.log('[LinuxInjector] stub:', msg.type);
    }
}
exports.LinuxInjector = LinuxInjector;
