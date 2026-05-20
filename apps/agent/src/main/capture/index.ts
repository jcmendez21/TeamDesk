/**
 * CaptureAdapter — abstracts screen capture across OSes.
 *
 * MVP uses Electron's `desktopCapturer` (Chromium-backed) which works
 * uniformly across platforms. Each OS adapter can be upgraded later to
 * use the native API for lower latency / better quality:
 *   - Windows: DXGI Desktop Duplication
 *   - macOS:   ScreenCaptureKit (10.15+)
 *   - Linux:   PipeWire portal (Wayland) / X11 XCOPY (X)
 *
 * The interface returns a `MediaStream` because that's what WebRTC
 * `addStream`/`addTrack` expects — the renderer process consumes it.
 */

export interface CaptureSource {
  id: string;
  name: string;
  thumbnailUrl?: string;
}

export interface CaptureAdapter {
  listSources(): Promise<CaptureSource[]>;
  /** Returns a Chromium constraint set the renderer can hand to getUserMedia. */
  buildConstraints(sourceId: string): MediaStreamConstraints;
}

export class CaptureAdapterFactory {
  static create(): CaptureAdapter {
    // The Electron `desktopCapturer` API is uniform across OSes, so the
    // base implementation works everywhere. Each platform can subclass to
    // swap in a faster native path without changing call sites.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ElectronCaptureAdapter } = require('./electron-capture');
    return new ElectronCaptureAdapter();
  }
}
