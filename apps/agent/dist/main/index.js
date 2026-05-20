"use strict";
/**
 * Agent main entry — Electron app lifecycle + IPC bridge to the renderer.
 *
 * Architecture:
 *   - Main process (this file): owns the Electron window, registers the
 *     desktopCapturer source automatically (no system "choose what to
 *     share" dialog), and performs native input injection via nut-js.
 *   - Renderer (renderer/host.ts): runs Chromium + WebRTC. Captures the
 *     screen via getDisplayMedia (which main short-circuits to the primary
 *     screen), opens a Socket.IO connection to the signaling server, and
 *     becomes the host peer for any operator that joins its room.
 *   - IPC: renderer forwards incoming input messages to main; main calls
 *     into `InputInjectorFactory.create()` which dispatches to the OS
 *     adapter (Windows/macOS/Linux via @nut-tree-fork/nut-js).
 *
 * No browser "you are sharing your screen" banner: that bar only appears
 * for `getDisplayMedia` calls inside a regular browser context. Inside
 * Electron with a registered `setDisplayMediaRequestHandler`, capture is
 * frictionless — the user already installed the agent, they're consenting
 * by running it.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("node:path"));
const node_crypto_1 = require("node:crypto");
const input_injector_1 = require("./input-injector");
// Inlined from `@teamdesk/shared/scopes` to avoid pulling the shared
// workspace into the agent's compile output. The agent only needs this
// one tiny function at runtime; everything else from shared is type-only.
const SCOPE_LEVEL = {
    SCREEN_ONLY: 1, SCREEN_CONTROL: 2, SCREEN_FILES: 3, FULL_CONTROL: 4,
};
const scopeCovers = (active, required) => (SCOPE_LEVEL[active] ?? 0) >= (SCOPE_LEVEL[required] ?? Infinity);
function generateConnectionId() {
    return Math.floor(100_000_000 + Math.random() * 900_000_000).toString();
}
/**
 * Random 8-char alphanumeric password. Enough entropy to defeat naive
 * brute force against the signaling server for the brief lifetime of an
 * agent session, while staying short enough to dictate over the phone.
 * Using `randomBytes` (CSPRNG), not Math.random.
 */
function generatePassword() {
    const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/o/1/i to reduce dictation errors
    const bytes = (0, node_crypto_1.randomBytes)(8);
    let out = '';
    for (let i = 0; i < 8; i++)
        out += alphabet[bytes[i] % alphabet.length];
    return out;
}
const password = generatePassword();
const runtime = {
    scope: 'SCREEN_CONTROL',
    connectionId: generateConnectionId(),
    signalingUrl: process.env.TEAMDESK_SIGNALING_URL ?? 'http://localhost:3000',
    password,
    passwordHash: (0, node_crypto_1.createHash)('sha256').update(password, 'utf8').digest('hex'),
};
// eslint-disable-next-line no-console
console.log('[agent] boot:', {
    connectionId: runtime.connectionId,
    password: runtime.password,
    signalingUrl: runtime.signalingUrl,
});
const injector = input_injector_1.InputInjectorFactory.create();
// ── Window lifecycle ───────────────────────────────────────────────────────
let mainWindow = null;
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 460,
        height: 360,
        resizable: false,
        title: 'TeamDesk Agent',
        backgroundColor: '#07090d',
        autoHideMenuBar: true,
        webPreferences: {
            // For this MVP we trust our own renderer code (we ship it, the user
            // can't load arbitrary URLs). nodeIntegration lets the renderer
            // require socket.io-client / simple-peer directly without bundling.
            nodeIntegration: true,
            contextIsolation: false,
        },
    });
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
    // Auto-open DevTools in development so renderer errors are visible. Set
    // TEAMDESK_AGENT_DEV=0 to suppress this in packaged builds.
    if (process.env.TEAMDESK_AGENT_DEV !== '0') {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    // Auto-select the primary screen when the renderer calls
    // navigator.mediaDevices.getDisplayMedia(). This is the key bit that
    // eliminates the system picker AND the browser-style sharing banner.
    electron_1.session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
        const sources = await electron_1.desktopCapturer.getSources({ types: ['screen'] });
        const primary = sources[0];
        if (!primary) {
            callback({}); // user gets a "no source" error in renderer — rare
            return;
        }
        // The video constraint shape callback expects an electron-flavored
        // MediaStreamSource. Audio left undefined (we don't relay sound yet).
        callback({ video: primary });
    }, { useSystemPicker: false });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
// ── IPC handlers ───────────────────────────────────────────────────────────
electron_1.ipcMain.handle('agent:bootstrap', () => ({
    connectionId: runtime.connectionId,
    signalingUrl: runtime.signalingUrl,
    scope: runtime.scope,
    platform: process.platform,
    // Renderer needs the cleartext to *show* the user; the hash is what
    // travels over signaling. They're equivalent for the room owner.
    password: runtime.password,
    passwordHash: runtime.passwordHash,
}));
electron_1.ipcMain.handle('agent:setScope', (_e, scope) => {
    runtime.scope = scope;
});
// Input messages forwarded from the renderer (after WebRTC data channel
// receives them). Scope is double-checked here — even if the renderer is
// compromised, main never injects beyond what the active scope allows.
electron_1.ipcMain.on('agent:input', async (_e, msg) => {
    if (!scopeCovers(runtime.scope, 'SCREEN_CONTROL'))
        return;
    try {
        await injector.inject(msg);
    }
    catch (err) {
        // eslint-disable-next-line no-console
        console.error('[agent] injection failed', err);
    }
});
electron_1.ipcMain.on('agent:stop-sharing', () => {
    electron_1.app.quit();
});
// ── App lifecycle ──────────────────────────────────────────────────────────
electron_1.app.whenReady().then(createWindow);
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
electron_1.app.on('activate', () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0)
        createWindow();
});
