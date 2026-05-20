/**
 * InputInjector — Factory + Adapter for OS-level input injection.
 *
 * The agent's whole reason to exist: a browser tab cannot inject real
 * mouse/keyboard events into the OS, the agent can. The injector is the
 * piece that does it. We expose the same interface across Windows, macOS
 * and Linux; the Factory picks the implementation at startup.
 *
 * Production implementation uses `@nut-tree-fork/nut-js` (the maintained
 * community fork after `@nut-tree/nut-js` was unpublished from npm). It
 * wraps the native APIs uniformly: SendInput on Windows, CGEventPost on
 * macOS, uinput/XTest on Linux. The stubs below log the action so the
 * wire layer can be developed independently of the native dep.
 */

import type { InputMsg } from '@teamdesk/shared';

export interface InputInjector {
  inject(msg: InputMsg): Promise<void>;
}

export class InputInjectorFactory {
  static create(): InputInjector {
    switch (process.platform) {
      case 'win32': return new (require('./windows').WindowsInjector)();
      case 'darwin': return new (require('./macos').MacInjector)();
      default: return new (require('./linux').LinuxInjector)();
    }
  }
}
