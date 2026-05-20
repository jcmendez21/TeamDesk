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

import { app, BrowserWindow, ipcMain, session, desktopCapturer } from 'electron';
import * as path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import type { InputMsg, ScopeId } from '../wire-types';
import { InputInjectorFactory } from './input-injector';

// Inlined from `@teamdesk/shared/scopes` to avoid pulling the shared
// workspace into the agent's compile output. The agent only needs this
// one tiny function at runtime; everything else from shared is type-only.
const SCOPE_LEVEL: Record<ScopeId, number> = {
  SCREEN_ONLY: 1, SCREEN_CONTROL: 2, SCREEN_FILES: 3, FULL_CONTROL: 4,
};
const scopeCovers = (active: ScopeId, required: ScopeId): boolean =>
  (SCOPE_LEVEL[active] ?? 0) >= (SCOPE_LEVEL[required] ?? Infinity);

// ── Mutable runtime ────────────────────────────────────────────────────────

interface AgentRuntime {
  scope: ScopeId;
  connectionId: string;
  signalingUrl: string;
  password: string;
  passwordHash: string;
}

function generateConnectionId(): string {
  return Math.floor(100_000_000 + Math.random() * 900_000_000).toString();
}

/**
 * Random 8-char alphanumeric password. Enough entropy to defeat naive
 * brute force against the signaling server for the brief lifetime of an
 * agent session, while staying short enough to dictate over the phone.
 * Using `randomBytes` (CSPRNG), not Math.random.
 */
function generatePassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/o/1/i to reduce dictation errors
  const bytes = randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

const password = generatePassword();
const runtime: AgentRuntime = {
  scope: 'SCREEN_CONTROL',
  connectionId: generateConnectionId(),
  signalingUrl: process.env.TEAMDESK_SIGNALING_URL ?? 'http://localhost:3000',
  password,
  passwordHash: createHash('sha256').update(password, 'utf8').digest('hex'),
};

// eslint-disable-next-line no-console
console.log('[agent] boot:', {
  connectionId: runtime.connectionId,
  password: runtime.password,
  signalingUrl: runtime.signalingUrl,
});

const injector = InputInjectorFactory.create();

// ── Window lifecycle ───────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
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
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      const sources = await desktopCapturer.getSources({ types: ['screen'] });
      const primary = sources[0];
      if (!primary) {
        callback({}); // user gets a "no source" error in renderer — rare
        return;
      }
      // The video constraint shape callback expects an electron-flavored
      // MediaStreamSource. Audio left undefined (we don't relay sound yet).
      callback({ video: primary });
    },
    { useSystemPicker: false },
  );

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── IPC handlers ───────────────────────────────────────────────────────────

ipcMain.handle('agent:bootstrap', () => ({
  connectionId: runtime.connectionId,
  signalingUrl: runtime.signalingUrl,
  scope: runtime.scope,
  platform: process.platform,
  // Renderer needs the cleartext to *show* the user; the hash is what
  // travels over signaling. They're equivalent for the room owner.
  password: runtime.password,
  passwordHash: runtime.passwordHash,
}));

ipcMain.handle('agent:setScope', (_e, scope: ScopeId) => {
  runtime.scope = scope;
});

// Input messages forwarded from the renderer (after WebRTC data channel
// receives them). Scope is double-checked here — even if the renderer is
// compromised, main never injects beyond what the active scope allows.
ipcMain.on('agent:input', async (_e, msg: InputMsg) => {
  if (!scopeCovers(runtime.scope, 'SCREEN_CONTROL')) return;
  try {
    await injector.inject(msg);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[agent] injection failed', err);
  }
});

ipcMain.on('agent:stop-sharing', () => {
  app.quit();
});

// ── App lifecycle ──────────────────────────────────────────────────────────

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
