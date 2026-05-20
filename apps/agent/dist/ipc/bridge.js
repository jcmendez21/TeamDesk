"use strict";
/**
 * IpcBridge — Singleton over Electron's IPC. Limits the surface area
 * exposed to the renderer to a tight, named set of channels.
 *
 * Why Singleton: there is exactly one Electron main process and one
 * `BrowserWindow` per agent install. Multiple bridges would double-deliver
 * events. The constructor is private; `getInstance()` is the only path.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIpcBridge = exports.IpcBridge = void 0;
class IpcBridge {
    static _instance = null;
    electron = null;
    constructor() {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            this.electron = require('electron');
        }
        catch {
            // Running outside Electron — keep the bridge a no-op for tests.
            this.electron = null;
        }
    }
    static getInstance() {
        if (!IpcBridge._instance)
            IpcBridge._instance = new IpcBridge();
        return IpcBridge._instance;
    }
    /** Register a request/response handler. */
    handle(channel, handler) {
        this.electron?.ipcMain.handle(channel, async (_e, ...args) => handler(...args));
    }
    /** Listen to a fire-and-forget message from the renderer. */
    on(channel, listener) {
        this.electron?.ipcMain.on(channel, (_e, ...args) => listener(...args));
    }
    /** Push an event to every renderer window. */
    broadcast(channel, payload) {
        if (!this.electron)
            return;
        for (const w of this.electron.BrowserWindow.getAllWindows()) {
            w.webContents.send(channel, payload);
        }
    }
}
exports.IpcBridge = IpcBridge;
const getIpcBridge = () => IpcBridge.getInstance();
exports.getIpcBridge = getIpcBridge;
