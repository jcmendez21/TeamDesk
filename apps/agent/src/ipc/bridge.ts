/**
 * IpcBridge — Singleton over Electron's IPC. Limits the surface area
 * exposed to the renderer to a tight, named set of channels.
 *
 * Why Singleton: there is exactly one Electron main process and one
 * `BrowserWindow` per agent install. Multiple bridges would double-deliver
 * events. The constructor is private; `getInstance()` is the only path.
 */

type ElectronModule = {
  ipcMain: {
    handle: (channel: string, listener: (event: unknown, ...args: unknown[]) => unknown) => void;
    on: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => void;
  };
  BrowserWindow: {
    getAllWindows(): Array<{ webContents: { send: (channel: string, ...args: unknown[]) => void } }>;
  };
};

export class IpcBridge {
  private static _instance: IpcBridge | null = null;
  private electron: ElectronModule | null = null;

  private constructor() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this.electron = require('electron') as ElectronModule;
    } catch {
      // Running outside Electron — keep the bridge a no-op for tests.
      this.electron = null;
    }
  }

  static getInstance(): IpcBridge {
    if (!IpcBridge._instance) IpcBridge._instance = new IpcBridge();
    return IpcBridge._instance;
  }

  /** Register a request/response handler. */
  handle<TArgs extends unknown[], TResult>(
    channel: string,
    handler: (...args: TArgs) => Promise<TResult> | TResult,
  ): void {
    this.electron?.ipcMain.handle(channel, async (_e, ...args) => handler(...(args as TArgs)));
  }

  /** Listen to a fire-and-forget message from the renderer. */
  on<TArgs extends unknown[]>(channel: string, listener: (...args: TArgs) => void): void {
    this.electron?.ipcMain.on(channel, (_e, ...args) => listener(...(args as TArgs)));
  }

  /** Push an event to every renderer window. */
  broadcast(channel: string, payload: unknown): void {
    if (!this.electron) return;
    for (const w of this.electron.BrowserWindow.getAllWindows()) {
      w.webContents.send(channel, payload);
    }
  }
}

export const getIpcBridge = (): IpcBridge => IpcBridge.getInstance();
