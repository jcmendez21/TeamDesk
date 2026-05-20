/**
 * ElectronCaptureAdapter — uses Electron's `desktopCapturer` API.
 *
 * Lives in the main process. Renderer asks for sources via IPC, picks one,
 * and calls `getUserMedia` with the chromeMediaSourceId constraint. The
 * adapter is the boundary so we can swap to DXGI / ScreenCaptureKit /
 * PipeWire later without touching the renderer.
 */

import type { CaptureAdapter, CaptureSource } from './index';

// `electron` is resolved at runtime inside the agent workspace. Until the
// dep is installed here, the lazy require keeps the rest of the codebase
// type-checking cleanly.
type DesktopCapturer = {
  getSources(opts: { types: ('screen' | 'window')[]; thumbnailSize?: { width: number; height: number } }): Promise<Array<{
    id: string;
    name: string;
    thumbnail: { toDataURL(): string };
  }>>;
};

export class ElectronCaptureAdapter implements CaptureAdapter {
  async listSources(): Promise<CaptureSource[]> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { desktopCapturer } = require('electron') as { desktopCapturer: DesktopCapturer };
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
    return sources.map((s) => ({ id: s.id, name: s.name, thumbnailUrl: s.thumbnail.toDataURL() }));
  }

  buildConstraints(sourceId: string): MediaStreamConstraints {
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
      } as any,
    };
  }
}
