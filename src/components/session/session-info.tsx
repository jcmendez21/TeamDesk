'use client';

import { capsForScope, type ScopeId } from '@/domain/scopes';

interface SessionInfoProps {
  device: string;
  scope: ScopeId;
  startedAt: Date;
  uptimeSeconds: number;
}

const fmtDuration = (sec: number): string => {
  const h = String(Math.floor(sec / 3600)).padStart(2, '0');
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
};

export function SessionInfo({ device, scope, startedAt, uptimeSeconds }: SessionInfoProps): React.ReactElement {
  const caps = capsForScope(scope);
  const rows: [string, string][] = [
    ['Hostname', device],
    ['Scope', scope],
    ['Capture', 'getDisplayMedia · WebRTC'],
    ['Input bridge', caps.canControl ? 'enabled · DataChannel' : 'disabled · scope L1'],
    ['Encryption', 'DTLS-SRTP'],
    ['Started', startedAt.toTimeString().slice(0, 8)],
    ['Duration', fmtDuration(uptimeSeconds)],
  ];

  return (
    <section className="rounded-md overflow-hidden" style={{ background: 'var(--session-panel)', border: '1px solid var(--border-soft)' }}>
      <div className="px-3 pt-3 pb-2">
        <div className="font-mono text-[10px]" style={{ color: 'var(--fg-3)', letterSpacing: '0.10em' }}>SESSION</div>
        <div className="text-[13px] font-semibold" style={{ color: 'var(--fg-0)' }}>Connection info</div>
      </div>
      <div className="px-3 pb-3">
        <div className="grid grid-cols-[110px_1fr] gap-y-1.5 gap-x-3 font-mono text-[11px]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <div style={{ color: 'var(--fg-3)' }}>{k}</div>
              <div className="truncate" style={{ color: 'var(--fg-0)' }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
