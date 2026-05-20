'use client';

import { useEffect, useState } from 'react';
import type { AuditEvent } from '@/domain/types';
import { auditBus } from '@/services/audit-bus';

const STYLE: Record<string, { color: string; glyph: string }> = {
  FILE_TRANSFER:    { color: 'var(--cyan)',   glyph: '⇅' },
  INPUT_INJECTED:   { color: 'var(--fg-1)',   glyph: '·' },
  UAC_INTERACTION:  { color: 'var(--amber)',  glyph: '⚠' },
  SCOPE_CHANGE:     { color: 'var(--violet)', glyph: '◇' },
  SCOPE_DENIED:     { color: 'var(--crimson)',glyph: '✕' },
  CONNECTION_EVENT: { color: 'var(--green)',  glyph: '◉' },
  CHAT_MESSAGE:     { color: 'var(--fg-1)',   glyph: '⌂' },
  TERMINAL_COMMAND: { color: 'var(--fg-1)',   glyph: '$' },
};

const fmtClock = (ts: number): string => new Date(ts).toTimeString().slice(0, 8);

/**
 * AuditFeed — subscribes to the in-process audit bus and renders the most
 * recent N events. Persistence to Firestore is independent (the bus has
 * other subscribers); a missing connection here doesn't lose audit data.
 */
export function AuditFeed({ limit = 30 }: { limit?: number }): React.ReactElement {
  const [events, setEvents] = useState<AuditEvent[]>([]);

  useEffect(() => {
    return auditBus.on((event) => {
      setEvents((prev) => [event, ...prev].slice(0, limit));
    });
  }, [limit]);

  return (
    <section className="rounded-md overflow-hidden" style={{ background: 'var(--session-panel)', border: '1px solid var(--border-soft)' }}>
      <div className="px-3 pt-3 pb-2 flex items-center justify-between">
        <div>
          <div className="font-mono text-[10px]" style={{ color: 'var(--fg-3)', letterSpacing: '0.10em' }}>AUDIT</div>
          <div className="text-[13px] font-semibold" style={{ color: 'var(--fg-0)' }}>Live event stream</div>
        </div>
        <span
          className="px-2 py-0.5 rounded font-mono text-[10px] flex items-center gap-1"
          style={{ color: 'var(--green)', border: '1px solid rgba(34,197,94,0.35)' }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--green)', boxShadow: '0 0 4px var(--green)' }} />
          STREAMING
        </span>
      </div>
      <div className="px-1 pb-1 max-h-[260px] overflow-y-auto">
        {events.length === 0 && (
          <div className="px-3 py-4 text-center font-mono text-[11px]" style={{ color: 'var(--fg-3)' }}>
            Waiting for events…
          </div>
        )}
        {events.map((ev, i) => {
          const meta = STYLE[ev.type] ?? STYLE.INPUT_INJECTED;
          return (
            <div
              key={ev.id}
              className="flex items-start gap-2 px-2.5 py-1.5 rounded font-mono text-[11px]"
              style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border-soft)' }}
            >
              <span style={{ color: 'var(--fg-3)' }}>{fmtClock(ev.ts)}</span>
              <span style={{ color: meta.color, width: 12, textAlign: 'center' }}>{meta.glyph}</span>
              <span style={{ color: meta.color, fontWeight: 600, minWidth: 110 }}>{ev.type}</span>
              <span style={{ color: 'var(--fg-1)' }} className="flex-1 leading-snug">{ev.text}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
