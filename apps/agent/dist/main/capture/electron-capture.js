"use strict";
/**
 * ElectronCaptureAdapter — uses Electron's `desktopCapturer` API.
 *
 * Lives in the main process. Renderer asks for sources via IPC, picks one,
 * and calls `getUserMedia` with the chromeMediaSourceId constraint. The
 * adapter is the boundary so we can swap to DXGI / ScreenCaptureKit /
 * PipeWire later without touching the renderer.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ElectronCaptureAdapter = void 0;
class ElectronCaptureAdapter {
    async listSources() {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { desktopCapturer } = require('electron');
        const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
        return sources.map((s) => ({ id: s.id, name: s.name, thumbnailUrl: s.thumbnail.toDataURL() }));
    }
    buildConstraints(sourceId) {
        // The Chromium-specific constraint shape — TS DOM lib doesn't model it.
        return {
            audio: false,
            video: {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: sourceId,
                },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            },
        };
    }
}
exports.ElectronCaptureAdapter = ElectronCaptureAdapter;
