"use strict";
/**
 * NutInjector — shared implementation for Windows / macOS / Linux.
 *
 * @nut-tree-fork/nut-js wraps the per-OS APIs uniformly (SendInput on
 * Windows, CGEventPost on macOS, uinput/XTest on Linux). The per-OS
 * subclasses exist for documentation and any future OS-specific tweaks;
 * the actual injection code is the same on all three platforms.
 *
 * Coordinates come from the wire normalized 0..1 — multiply by the screen
 * dimensions queried lazily on first use, then cached. If the user
 * unplugs/swaps monitors mid-session we re-query (cheap).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NutInjector = void 0;
// Lazy require so the file can typecheck in workspaces that haven't
// installed @nut-tree-fork/nut-js (e.g. root tsc --noEmit).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let nut = null;
function loadNut() {
    if (!nut) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        nut = require('@nut-tree-fork/nut-js');
        // Speed knob — default 500ms between keystrokes makes typing painful.
        nut.keyboard.config.autoDelayMs = 0;
        nut.mouse.config.autoDelayMs = 0;
    }
    return nut;
}
let cachedSize = null;
async function screenSize() {
    if (cachedSize)
        return cachedSize;
    const n = loadNut();
    cachedSize = { w: await n.screen.width(), h: await n.screen.height() };
    return cachedSize;
}
const MOUSE_BUTTON = (button) => {
    const n = loadNut();
    return [n.Button.LEFT, n.Button.MIDDLE, n.Button.RIGHT][button];
};
/**
 * Map a browser KeyboardEvent.code (e.g. "KeyA", "Digit3", "ArrowLeft") to
 * the nut-js Key enum. Only the common cases are listed; anything not in
 * the table falls back to `Key.NumPad0` (a no-op for our purposes) so an
 * unmapped key is silently dropped instead of crashing the agent.
 */
function mapKey(code) {
    const n = loadNut();
    // Letters: KeyA..KeyZ
    if (/^Key[A-Z]$/.test(code))
        return n.Key[code.slice(3)];
    // Digits: Digit0..Digit9
    if (/^Digit[0-9]$/.test(code))
        return n.Key[`Num${code.slice(5)}`] ?? n.Key.Num0;
    // Function keys: F1..F12
    if (/^F([1-9]|1[0-2])$/.test(code))
        return n.Key[code];
    const table = {
        Space: 'Space',
        Enter: 'Enter',
        Backspace: 'Backspace',
        Tab: 'Tab',
        Escape: 'Escape',
        CapsLock: 'CapsLock',
        ShiftLeft: 'LeftShift', ShiftRight: 'RightShift',
        ControlLeft: 'LeftControl', ControlRight: 'RightControl',
        AltLeft: 'LeftAlt', AltRight: 'RightAlt',
        MetaLeft: 'LeftSuper', MetaRight: 'RightSuper',
        ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
        Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
        Delete: 'Delete', Insert: 'Insert',
        Minus: 'Minus', Equal: 'Equal',
        BracketLeft: 'LeftBracket', BracketRight: 'RightBracket',
        Backslash: 'Backslash', Semicolon: 'Semicolon', Quote: 'Quote',
        Comma: 'Comma', Period: 'Period', Slash: 'Slash',
        Backquote: 'Grave',
    };
    const name = table[code];
    return name ? n.Key[name] : n.Key.Num0;
}
class NutInjector {
    async inject(msg) {
        const n = loadNut();
        switch (msg.type) {
            case 'mousemove': {
                const { w, h } = await screenSize();
                await n.mouse.setPosition({ x: Math.round(msg.x * w), y: Math.round(msg.y * h) });
                return;
            }
            case 'mousedown': {
                const { w, h } = await screenSize();
                await n.mouse.setPosition({ x: Math.round(msg.x * w), y: Math.round(msg.y * h) });
                await n.mouse.pressButton(MOUSE_BUTTON(msg.button));
                return;
            }
            case 'mouseup': {
                await n.mouse.releaseButton(MOUSE_BUTTON(msg.button));
                return;
            }
            case 'wheel': {
                // nut-js scrolls in "ticks"; browser sends pixels. ~100px per tick
                // matches Windows default. dy positive = scroll down.
                const ticks = Math.round(msg.dy / 100);
                if (ticks > 0)
                    await n.mouse.scrollDown(ticks);
                else if (ticks < 0)
                    await n.mouse.scrollUp(-ticks);
                return;
            }
            case 'keydown': {
                const key = mapKey(msg.code);
                await n.keyboard.pressKey(key);
                return;
            }
            case 'keyup': {
                const key = mapKey(msg.code);
                await n.keyboard.releaseKey(key);
                return;
            }
            case 'cad': {
                // SAS (Secure Attention Sequence) — only the OS itself can post
                // Ctrl+Alt+Del to the Secure Desktop. nut-js can't reach that
                // surface; document it and emit the best-effort regular combo so
                // at least non-secure UAC contexts get something.
                await n.keyboard.pressKey(n.Key.LeftControl, n.Key.LeftAlt, n.Key.Delete);
                await n.keyboard.releaseKey(n.Key.LeftControl, n.Key.LeftAlt, n.Key.Delete);
                return;
            }
            case 'clipboard': {
                await n.clipboard.setContent(msg.text);
                return;
            }
        }
    }
}
exports.NutInjector = NutInjector;
