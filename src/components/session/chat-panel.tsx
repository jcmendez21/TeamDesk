'use client';

import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { useChatChannel } from '@/hooks/use-chat-channel';

interface ChatPanelProps {
  sessionId: string;
  role: 'operator' | 'host';
}

const fmtClock = (ts: number): string => new Date(ts).toTimeString().slice(0, 8);

export function ChatPanel({ sessionId, role }: ChatPanelProps): React.ReactElement {
  const { messages, send } = useChatChannel(sessionId, role);
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  const submit = (): void => {
    if (!draft.trim()) return;
    send(draft);
    setDraft('');
  };

  return (
    <section className="flex flex-col rounded-md overflow-hidden h-[280px]" style={{ background: 'var(--session-panel)', border: '1px solid var(--border-soft)' }}>
      <div className="px-3 pt-3 pb-2 flex items-center justify-between">
        <div>
          <div className="font-mono text-[10px]" style={{ color: 'var(--fg-3)', letterSpacing: '0.10em' }}>LIVE CHAT</div>
          <div className="text-[13px] font-semibold" style={{ color: 'var(--fg-0)' }}>In-session messages</div>
        </div>
        <span className="font-mono text-[10px]" style={{ color: 'var(--fg-3)' }}>E2EE · DTLS</span>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {messages.length === 0 && (
          <div className="font-mono text-[11px] text-center pt-8" style={{ color: 'var(--fg-3)' }}>
            No messages yet
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.from === role ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[78%]">
              <div
                className="px-3 py-2 rounded-md text-[12px] leading-snug"
                style={{
                  background: m.from === role ? 'rgba(0,229,255,0.10)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${m.from === role ? 'rgba(0,229,255,0.30)' : 'var(--border-mid)'}`,
                  color: 'var(--fg-0)',
                }}
              >
                {m.text}
              </div>
              <div
                className="font-mono text-[9px] mt-1 px-1"
                style={{ color: 'var(--fg-3)', textAlign: m.from === role ? 'right' : 'left' }}
              >
                {m.from.toUpperCase()} · {fmtClock(m.ts)}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="px-2 py-2 border-t flex items-center gap-2" style={{ borderColor: 'var(--border-soft)' }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Type a message…"
          className="flex-1 h-8 px-2 rounded-md text-[12px] outline-none"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border-mid)',
            color: 'var(--fg-0)',
          }}
        />
        <button
          onClick={submit}
          className="h-8 px-2.5 rounded-md flex items-center gap-1.5 font-mono text-[11px]"
          style={{ color: 'var(--cyan)', background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.45)' }}
        >
          <Send size={12} /> SEND
        </button>
      </div>
    </section>
  );
}
