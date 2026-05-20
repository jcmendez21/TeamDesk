/**
 * Renderer-side host — runs inside the Electron BrowserWindow.
 *
 * Owns three things:
 *   1. Capture: `navigator.mediaDevices.getDisplayMedia()`. Electron's main
 *      process registered a `setDisplayMediaRequestHandler` that returns
 *      the primary screen automatically — no picker dialog, no browser
 *      "you are sharing" bar.
 *   2. Signaling: a Socket.IO connection to the same signaling URL the web
 *      operator uses. Joins the room identified by our 9-digit ID and
 *      waits for an offer.
 *   3. Peer: `simple-peer` as non-initiator. Sends the captured stream
 *      over the media track; receives operator inputs over the data
 *      channel and forwards them to main via IPC for native injection.
 *
 * Main does the actual OS-level injection (nut-js lives in main). The
 * renderer never touches native APIs — it's pure WebRTC + IPC.
 */

import { ipcRenderer } from 'electron';
import { io, type Socket } from 'socket.io-client';
import type { InputMsg } from '../wire-types';

// Allow `require` to load CJS simple-peer cleanly (same hack the web side
// uses — simple-peer's ESM interop is fragile under bundlers).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Peer = require('simple-peer');

interface BootstrapInfo {
  connectionId: string;
  signalingUrl: string;
  scope: string;
  platform: string;
  password: string;
  passwordHash: string;
}

// ── DOM helpers ────────────────────────────────────────────────────────────

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

function setStatus(text: string, color: 'amber' | 'green' | 'red'): void {
  $('status').textContent = text;
  const dot = $('statusDot');
  dot.classList.remove('amber', 'green', 'red');
  dot.classList.add(color);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // 1. Pull bootstrap info from main.
  const info: BootstrapInfo = await ipcRenderer.invoke('agent:bootstrap');
  $('connId').textContent = formatConnId(info.connectionId);
  $('connPwd').textContent = info.password;
  $('scope').textContent = info.scope;
  $('signalingUrl').textContent = trimUrl(info.signalingUrl);
  $('platform').textContent = info.platform;

  $('connId').addEventListener('click', () => {
    navigator.clipboard.writeText(info.connectionId).catch(() => {});
  });
  $('connPwd').addEventListener('click', () => {
    navigator.clipboard.writeText(info.password).catch(() => {});
  });
  $('stop').addEventListener('click', () => {
    ipcRenderer.send('agent:stop-sharing');
  });

  // 2. Capture the primary screen. Main's display-media handler returns
  // it without prompting the user.
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch (err) {
    setStatus('capture failed', 'red');
    // eslint-disable-next-line no-console
    console.error('[agent] capture failed', err);
    return;
  }

  // Keep the stream attached to an off-screen <video> so the browser
  // doesn't garbage-collect any tracks while idle.
  const video = $<HTMLVideoElement>('captureVideo');
  video.srcObject = stream;

  setStatus('waiting for operator…', 'amber');

  // 3. Connect signaling.
  const socket: Socket = io(info.signalingUrl, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    // Register as the room's host with the password hash. The cleartext
    // password never leaves this process — only the hash crosses the
    // wire, and the server can only ever do constant-time-compare against
    // it (not invert it).
    socket.emit('register-room', {
      roomId: info.connectionId,
      passwordHash: info.passwordHash,
    });
  });

  socket.on('registered', () => {
    setStatus('waiting for operator…', 'amber');
  });
  socket.on('register-error', (data: { reason: string }) => {
    setStatus(`register failed: ${data.reason}`, 'red');
  });

  // 4. simple-peer as non-initiator; create a fresh peer per incoming
  // offer (same renegotiation pattern as the web host).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let peer: any = null;

  function createPeer(): void {
    if (peer) {
      try { peer.destroy(); } catch { /* ignore */ }
    }
    peer = new Peer({
      initiator: false,
      trickle: true,
      stream,
      config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
    });

    peer.on('signal', (signal: unknown) => {
      const payload = { target: info.connectionId, signal, caller: socket.id };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t = (signal as any)?.type;
      if (t === 'offer') socket.emit('offer', payload);
      else if (t === 'answer') socket.emit('answer', payload);
      else socket.emit('ice-candidate', payload);
    });

    peer.on('connect', () => {
      setStatus('operator connected', 'green');
    });

    peer.on('data', (raw: Uint8Array) => {
      let msg: InputMsg;
      try {
        msg = JSON.parse(new TextDecoder().decode(raw)) as InputMsg;
      } catch {
        return;
      }
      // Hand off to main; main applies scope-guard + nut-js.
      ipcRenderer.send('agent:input', msg);
    });

    peer.on('close', () => {
      setStatus('operator disconnected', 'amber');
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    peer.on('error', (err: any) => {
      // eslint-disable-next-line no-console
      console.error('[agent] peer error', err);
    });
  }

  socket.on('offer', (data: { signal: unknown }) => {
    createPeer();
    peer.signal(data.signal);
  });
  socket.on('answer',        (data: { signal: unknown }) => { peer?.signal(data.signal); });
  socket.on('ice-candidate', (data: { signal: unknown }) => { peer?.signal(data.signal); });
}

function formatConnId(id: string): string {
  return id.replace(/(\d{3})(?=\d)/g, '$1 ');
}
function trimUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

void main();
