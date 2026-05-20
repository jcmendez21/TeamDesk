'use client';

import { Keyboard, ClipboardCopy, Crop, Mic, Camera, Monitor, Terminal as TerminalIcon, Lock } from 'lucide-react';
import { capsForScope, type ScopeId } from '@/domain/scopes';
import { useMediator } from '@/hooks/use-session';
import { auditBus } from '@/services/audit-bus';

interface ActionBarProps {
  scope: ScopeId;
  sessionId: string;
  onQuality?: (q: 'auto' | 'high' | 'medium' | 'low') => void;
}

/**
 * ActionBar — the row of toggles below the video. Each button is gated by
 * `capsForScope(scope)` and visually disabled when the active scope does
 * not cover its required permission. Clicking a disabled button does
 * nothing locally but never fires off-network — the gating happens here
 * AND in `withScope` on the receiving side, so even a tampered UI fails.
 */
export function ActionBar({ scope, sessionId, onQuality }: ActionBarProps): React.ReactElement {
  const caps = capsForScope(scope);
  const mediator = useMediator();

  const sendCAD = (): void => {
    if (!caps.canCAD) return;
    mediator.sendInput({ type: 'cad' });
    auditBus.log(sessionId, 'INPUT_INJECTED', 'Ctrl+Alt+Del injected via SAS bridge');
  };

  return (
    <div
      className="rounded-md mt-3 px-3 py-2 flex items-center gap-2 flex-wrap"
      style={{ background: 'var(--session-panel)', border: '1px solid var(--border-soft)' }}
    >
      <Btn onClick={sendCAD} disabled={!caps.canCAD} danger title={caps.canCAD ? 'Send Ctrl+Alt+Del' : 'Requires FULL_CONTROL'}>
        <Keyboard size={13} /> CTRL+ALT+DEL
      </Btn>
      <Btn disabled={!caps.canClipboard} title={caps.canClipboard ? 'Bidirectional clipboard' : 'Requires SCREEN_CONTROL'}>
        <ClipboardCopy size={13} /> CLIPBOARD
      </Btn>
      <Btn disabled={!caps.canRegion} title={caps.canRegion ? 'Capture only a region' : 'Requires SCREEN_CONTROL'}>
        <Crop size={13} /> REGION
      </Btn>
      <div className="h-6 w-px mx-1" style={{ background: 'var(--border-mid)' }} />
      <Btn disabled={!caps.canControl}>
        <Mic size={13} /> MIC
      </Btn>
      <Btn disabled={!caps.canControl}>
        <Camera size={13} /> CAM
      </Btn>
      <Btn>
        <Monitor size={13} /> MULTI-MONITOR
      </Btn>
      <Btn disabled={!caps.canTerminal} title={caps.canTerminal ? 'Open terminal' : 'Requires FULL_CONTROL'}>
        <TerminalIcon size={13} /> TERMINAL
      </Btn>

      <div className="ml-auto flex items-center gap-2">
        <span className="font-mono text-[10px]" style={{ color: 'var(--fg-3)' }}>QUALITY</span>
        {(['auto', 'high', 'medium', 'low'] as const).map((q) => (
          <button
            key={q}
            onClick={() => onQuality?.(q)}
            className="px-2 py-1 rounded font-mono text-[10px] uppercase"
            style={{ color: 'var(--fg-1)', border: '1px solid var(--border-mid)' }}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function Btn({
  children,
  onClick,
  disabled,
  danger,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  title?: string;
}): React.ReactElement {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      title={title}
      disabled={disabled}
      className="h-9 px-3 rounded-md flex items-center gap-2 font-mono text-[11px] tracking-wide"
      style={{
        color: disabled ? 'var(--fg-3)' : danger ? 'var(--amber)' : 'var(--fg-1)',
        background: disabled ? 'rgba(255,255,255,0.01)' : danger ? 'rgba(245,158,11,0.06)' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${disabled ? 'var(--border-soft)' : danger ? 'rgba(245,158,11,0.35)' : 'var(--border-mid)'}`,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
      {disabled && <Lock size={11} />}
    </button>
  );
}
