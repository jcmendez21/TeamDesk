'use client';

import { useEffect, useRef, useState } from 'react';
import { Plug, Monitor } from 'lucide-react';
import { useTelemetry } from '@/hooks/use-telemetry';

interface TopBarProps {
  sessionId: string;
  device: string;
  uptimeSeconds: number;
  operatorName: string;
  onDisconnect: () => void;
}

const fmtDuration = (sec: number): string => {
  const h = String(Math.floor(sec / 3600)).padStart(2, '0');
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
};

/**
 * TopBar — sticky session header with telemetry and a two-step disconnect.
 * The disconnect rebinds itself to "CONFIRM" for 3.5s on first click — the
 * cost of an accidental kill of a live remote session is high enough to
 * justify the friction.
 */
export function TopBar({ sessionId, device, uptimeSeconds, operatorName, onDisconnect }: TopBarProps): React.ReactElement {
  const { stats, quality } = useTelemetry();
  const [confirming, setConfirming] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (confirmTimer.current) clearTimeout(confirmTimer.current); }, []);

  const handleDisconnect = (): void => {
    if (!confirming) {
      setConfirming(true);
      confirmTimer.current = setTimeout(() => setConfirming(false), 3500);
      return;
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirming(false);
    onDisconnect();
  };

  const qualityColor =
    quality === 'good' ? 'var(--green)' :
    quality === 'degraded' ? 'var(--amber)' :
    'var(--crimson)';

  return (
    <header
      className="flex items-center h-[60px] px-4 border-b"
      style={{ borderColor: 'var(--border-soft)', background: 'var(--session-panel-2)' }}
    >
      <div className="flex items-center gap-3 min-w-[300px]">
        <div className="leading-tight">
          <div className="font-mono text-[10px]" style={{ color: 'var(--fg-3)', letterSpacing: '0.10em' }}>SESSION · LIVE</div>
          <div className="font-mono text-[12px]" style={{ color: 'var(--fg-1)' }}>SID {sessionId}</div>
        </div>
        <div className="h-8 w-px" style={{ background: 'var(--border-mid)' }} />
        <div className="flex items-center gap-2">
          <Monitor size={14} style={{ color: 'var(--fg-2)' }} />
          <span className="font-semibold text-[14px]" style={{ color: 'var(--fg-0)' }}>{device}</span>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center gap-5">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md"
             style={{ border: '1px solid var(--border-mid)' }}>
          <span className="w-2 h-2 rounded-full" style={{ background: qualityColor, boxShadow: `0 0 8px ${qualityColor}` }} />
          <span className="font-mono text-[11px] uppercase" style={{ color: qualityColor, letterSpacing: '0.06em' }}>{quality}</span>
        </div>
        <Stat label="LATENCY" value={stats?.rttMs ?? '—'} unit="ms" warn={(stats?.rttMs ?? 0) > 90} />
        <Stat label="LOSS" value={stats ? stats.lossPct.toFixed(1) : '—'} unit="%" warn={(stats?.lossPct ?? 0) > 1.0} />
        <Stat label="BANDWIDTH" value={stats ? stats.bandwidthMbps.toFixed(1) : '—'} unit="Mbps" />
      </div>

      <div className="flex items-center gap-3 justify-end min-w-[320px]">
        <div className="flex items-center gap-2 px-3 h-9 rounded-md"
             style={{ border: '1px solid var(--border-mid)' }}>
          <span className="font-mono text-[10px]" style={{ color: 'var(--fg-3)' }}>UPTIME</span>
          <span className="font-mono text-[14px] tabular-nums" style={{ color: 'var(--fg-0)' }}>{fmtDuration(uptimeSeconds)}</span>
        </div>

        <button
          onClick={handleDisconnect}
          className="h-9 px-3.5 rounded-md flex items-center gap-2 font-mono text-[12px] uppercase tracking-wider transition-colors"
          style={{
            color: confirming ? '#fff' : 'var(--crimson)',
            background: confirming ? 'var(--crimson)' : 'rgba(239,68,68,0.06)',
            border: `1px solid ${confirming ? 'var(--crimson)' : 'rgba(239,68,68,0.35)'}`,
            letterSpacing: '0.10em',
          }}
        >
          <Plug size={14} />
          {confirming ? 'CONFIRM · DISCONNECT' : 'DISCONNECT'}
        </button>

        <div className="flex items-center gap-2 pl-2">
          <div className="text-right leading-tight">
            <div className="text-[12px] font-semibold" style={{ color: 'var(--fg-0)' }}>{operatorName}</div>
            <div className="text-[10px] font-mono" style={{ color: 'var(--fg-2)' }}>OPERATOR</div>
          </div>
        </div>
      </div>
    </header>
  );
}

function Stat({ label, value, unit, warn }: { label: string; value: string | number; unit: string; warn?: boolean }): React.ReactElement {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="font-mono text-[10px]" style={{ color: 'var(--fg-3)', letterSpacing: '0.08em' }}>{label}</span>
      <span className="font-mono text-[14px] tabular-nums" style={{ color: warn ? 'var(--amber)' : 'var(--fg-0)' }}>{value}</span>
      <span className="font-mono text-[10px]" style={{ color: 'var(--fg-3)' }}>{unit}</span>
    </div>
  );
}
