/**
 * MacInjector — CGEventPost-based injection.
 *
 * On macOS the agent must hold the Accessibility (TCC) entitlement before
 * `@nut-tree-fork/nut-js` can post events. The first run prompts the user
 * to grant it via System Settings — intentional friction, not a bug.
 */

import type { InputMsg } from '../../wire-types';
import type { InputInjector } from './index';

export class MacInjector implements InputInjector {
  async inject(msg: InputMsg): Promise<void> {
    // eslint-disable-next-line no-console
    console.log('[MacInjector] stub:', msg.type);
  }
}
