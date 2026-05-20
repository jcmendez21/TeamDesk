/**
 * Renderer-side bootstrap for the agent's status window. Holds the
 * WebRTC connection (so the captured MediaStream can attach without
 * crossing process boundaries) and forwards data-channel messages to
 * the main process via the IpcBridge.
 *
 * The minimum viable UI shows: connection status, active scope, the
 * operator's identity, and a "Stop sharing" button. Everything else
 * (preferences, history, autostart) is a follow-up.
 */

export {}; // make this file a module so `declare global` is legal

declare global {
  interface Window {
    teamdesk?: {
      stopSharing(): Promise<void>;
      getScope(): Promise<string>;
    };
  }
}

const $ = (id: string): HTMLElement | null => document.getElementById(id);

async function init(): Promise<void> {
  const stopBtn = $('stop');
  if (stopBtn) {
    stopBtn.addEventListener('click', () => {
      void window.teamdesk?.stopSharing();
    });
  }

  if (window.teamdesk) {
    const scope = await window.teamdesk.getScope();
    if ($('scope')) $('scope')!.textContent = scope;
    if ($('status')) $('status')!.textContent = 'ready';
  } else {
    if ($('status')) $('status')!.textContent = 'standalone (no Electron host)';
  }
}

void init();
