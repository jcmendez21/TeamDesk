'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ChatMsg } from '@teamdesk/shared';
import type { ChatMessage } from '@/domain/types';
import { useMediator } from '@/hooks/use-session';

let _localId = 0;

export function useChatChannel(sessionId: string, role: 'operator' | 'host'): {
  messages: ChatMessage[];
  send: (text: string) => void;
} {
  const mediator = useMediator();
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    return mediator.onChannel<ChatMsg>('chat', (msg) => {
      setMessages((prev) => [
        ...prev,
        { id: msg.id, sessionId, from: msg.from, text: msg.text, ts: msg.ts },
      ]);
    });
  }, [mediator, sessionId]);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const message: ChatMessage = {
        id: `chat_${Date.now()}_${++_localId}`,
        sessionId,
        from: role,
        text: trimmed,
        ts: Date.now(),
      };
      setMessages((prev) => [...prev, message]);
      mediator.sendChat(message);
    },
    [mediator, sessionId, role],
  );

  return { messages, send };
}
