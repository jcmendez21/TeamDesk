/**
 * WindowsInjector — Win32 input injection via SendInput / SAS bridge.
 *
 * Production: `@nut-tree/nut-js` calls SendInput. The agent must run as a
 * service under NT AUTHORITY\\SYSTEM to inject into the Secure Desktop
 * (UAC prompts) — that requirement comes from Windows, not from us.
 */

import type { InputMsg } from '@teamdesk/shared';
import type { InputInjector } from './index';

export class WindowsInjector implements InputInjector {
  async inject(msg: InputMsg): Promise<void> {
    // Real wiring via `@nut-tree-fork/nut-js` (community-maintained fork
    // after `@nut-tree/nut-js` was removed from the registry). Kept inside
    // a dynamic import so this file still compiles in workspaces where
    // the dep isn't installed.
    //
    //   const { mouse, keyboard, Button, screen } = await import('@nut-tree-fork/nut-js');
    //   if (msg.type === 'mousemove') {
    //     const w = await screen.width(); const h = await screen.height();
    //     await mouse.setPosition({ x: msg.x * w, y: msg.y * h });
    //   }
    //
    // eslint-disable-next-line no-console
    console.log('[WindowsInjector] stub:', msg.type);
  }
}
