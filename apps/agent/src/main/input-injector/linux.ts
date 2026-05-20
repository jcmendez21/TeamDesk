/**
 * LinuxInjector — XTest under X11, uinput under Wayland.
 *
 * `@nut-tree-fork/nut-js` selects the backend automatically. Wayland imposes
 * extra hurdles (the portal must grant remote-desktop perms via
 * `xdg-desktop-portal`); document the failure mode rather than silently
 * dropping inputs.
 */

import type { InputMsg } from '@teamdesk/shared';
import type { InputInjector } from './index';

export class LinuxInjector implements InputInjector {
  async inject(msg: InputMsg): Promise<void> {
    // eslint-disable-next-line no-console
    console.log('[LinuxInjector] stub:', msg.type);
  }
}
