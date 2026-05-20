/**
 * useInputChannel — subscribes to the input message stream that arrives
 * from the remote peer (already scope-guarded by the mediator) and
 * exposes a sender. The host UI uses this to read the operator's mouse/key
 * events; the operator UI uses `send` to push them.
 */

'use client';

import { useCallback, useEffect } from 'react';
import type { InputMsg } from '@teamdesk/shared';
import { useMediator } from '@/hooks/use-session';

export function useInputChannel(onMessage?: (msg: InputMsg) => void): {
  send: (msg: InputMsg) => void;
} {
  const mediator = useMediator();

  useEffect(() => {
    if (!onMessage) return;
    return mediator.onChannel<InputMsg>('input', onMessage);
  }, [mediator, onMessage]);

  const send = useCallback((msg: InputMsg) => mediator.sendInput(msg), [mediator]);
  return { send };
}
