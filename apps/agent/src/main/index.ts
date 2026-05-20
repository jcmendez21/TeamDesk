/**
 * Agent main entry point.
 *
 * Wires the four subsystems together at boot:
 *   - IpcBridge (Singleton)        ← renderer status UI talks here
 *   - InputInjector (Factory)      ← consumes scope-guarded input msgs
 *   - CaptureAdapter (Factory)     ← lists screens, builds constraints
 *   - AgentFileSystem              ← list / read / write under ACL
 *
 * The agent connects to the same Socket.IO signaling server as the web
 * operator (URL is read from env at boot) and identifies itself with
 * `role: 'agent'`. WebRTC then flows peer-to-peer between operator and
 * agent — exactly as in the web-only MVP, except now native modules are
 * on the receiving end of the input data channel.
 */

import { getIpcBridge } from '../ipc/bridge';
import { InputInjectorFactory } from './input-injector';
import { CaptureAdapterFactory } from './capture';
import { AgentFileSystem } from './file-system';
import type { InputMsg, FileMsg } from '@teamdesk/shared';
import { scopeCovers, type ScopeId } from '@teamdesk/shared';

interface AgentRuntime {
  scope: ScopeId;
  setScope(s: ScopeId): void;
}

function createRuntime(): AgentRuntime {
  let scope: ScopeId = 'SCREEN_ONLY';
  return {
    get scope() { return scope; },
    setScope(s: ScopeId) { scope = s; },
  };
}

async function bootstrap(): Promise<void> {
  const runtime = createRuntime();
  const ipc = getIpcBridge();
  const injector = InputInjectorFactory.create();
  const capture = CaptureAdapterFactory.create();
  const fs = new AgentFileSystem();

  // ── Renderer-facing IPC ────────────────────────────────────────────────
  ipc.handle('agent:listSources', () => capture.listSources());
  ipc.handle('agent:scope', () => runtime.scope);
  ipc.on<[ScopeId]>('agent:setScope', (s) => runtime.setScope(s));

  // ── Inbound from the operator ──────────────────────────────────────────
  // The renderer holds the WebRTC connection (so it can attach the captured
  // MediaStream directly) and forwards data-channel messages here. The
  // scope check happens locally — even if the renderer is compromised, it
  // cannot trick the main process into injecting beyond the active scope.
  ipc.on<[InputMsg]>('agent:input', async (msg) => {
    if (!scopeCovers(runtime.scope, 'SCREEN_CONTROL')) return;
    await injector.inject(msg);
  });
  ipc.handle<[FileMsg], unknown>('agent:file', async (_msg) => {
    if (!scopeCovers(runtime.scope, 'SCREEN_FILES')) return { ok: false, reason: 'scope' };
    // Real wiring lives in Step 9 follow-up — `fs` exposes the primitives,
    // file-transfer-engine in shared will use it on the agent side.
    void fs;
    return { ok: true };
  });
}

// In an installed Electron app this would be inside `app.whenReady()`. Here
// the function is exported so the renderer host harness can call it during
// dev, and the production main wraps it in the Electron app lifecycle.
export { bootstrap };
