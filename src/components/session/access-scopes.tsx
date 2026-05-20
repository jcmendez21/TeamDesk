'use client';

import { Eye, MousePointer, Folder, Shield, Lock } from 'lucide-react';
import { SCOPES, SCOPE_LEVEL, capsForScope, type ScopeId } from '@/domain/scopes';

const SCOPE_ICON: Record<ScopeId, React.ReactNode> = {
  SCREEN_ONLY:    <Eye size={14} />,
  SCREEN_CONTROL: <MousePointer size={14} />,
  SCREEN_FILES:   <Folder size={14} />,
  FULL_CONTROL:   <Shield size={14} />,
};

interface AccessScopesProps {
  active: ScopeId;
  onChange: (scope: ScopeId) => void;
}

/**
 * AccessScopes — left panel that shows the four permission levels and
 * the cumulative capabilities each one unlocks. Clicking a scope shifts
 * the active scope through the mediator (passed via `onChange`).
 *
 * Lower-level scopes display as already granted (inherited) when a higher
 * level is active, mirroring the cumulative model in `capsForScope`.
 */
export function AccessScopes({ active, onChange }: AccessScopesProps): React.ReactElement {
  const activeLevel = SCOPE_LEVEL[active];

  return (
    <section className="rounded-md overflow-hidden" style={{ background: 'var(--session-panel)', border: '1px solid var(--border-soft)' }}>
      <div className="px-3 pt-3 pb-2">
        <div className="font-mono text-[10px]" style={{ color: 'var(--fg-3)', letterSpacing: '0.10em' }}>ACCESS</div>
        <div className="text-[13px] font-semibold" style={{ color: 'var(--fg-0)' }}>Permission scopes</div>
      </div>
      <div className="px-2 pb-2">
        {SCOPES.map((s) => {
          const isActive = s.id === active;
          const granted = s.level <= activeLevel;
          return (
            <button
              key={s.id}
              onClick={() => onChange(s.id)}
              className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-md mb-1 transition-colors"
              style={{
                background: isActive ? 'rgba(0,229,255,0.06)' : 'transparent',
                opacity: granted ? 1 : 0.55,
              }}
            >
              <div
                className="w-8 h-8 rounded-md grid place-items-center"
                style={{
                  background: isActive ? 'rgba(0,229,255,0.10)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isActive ? 'rgba(0,229,255,0.45)' : 'var(--border-mid)'}`,
                  color: isActive ? 'var(--cyan)' : 'var(--fg-1)',
                }}
              >
                {SCOPE_ICON[s.id]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-semibold" style={{ color: 'var(--fg-0)' }}>{s.label}</span>
                  <span className="font-mono text-[10px]" style={{ color: 'var(--fg-3)' }}>L{s.level}</span>
                </div>
                <div className="text-[11px]" style={{ color: 'var(--fg-2)' }}>{s.sub}</div>
              </div>
              {granted ? (
                <div className="w-2 h-2 rounded-full" style={{ background: isActive ? 'var(--cyan)' : 'var(--fg-3)' }} />
              ) : (
                <Lock size={12} style={{ color: 'var(--fg-3)' }} />
              )}
            </button>
          );
        })}
      </div>

      <div className="px-3 py-2 font-mono text-[10px]" style={{ borderTop: '1px solid var(--border-soft)', color: 'var(--fg-3)' }}>
        <CapMatrix scope={active} />
      </div>
    </section>
  );
}

function CapMatrix({ scope }: { scope: ScopeId }): React.ReactElement {
  const caps = capsForScope(scope);
  const items: { k: string; on: boolean }[] = [
    { k: 'View',     on: true },
    { k: 'Input',    on: caps.canControl },
    { k: 'Clipboard',on: caps.canClipboard },
    { k: 'Files',    on: caps.canFiles },
    { k: 'Terminal', on: caps.canTerminal },
    { k: 'Elevate',  on: caps.canElevate },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it) => (
        <span
          key={it.k}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded"
          style={{
            background: it.on ? 'rgba(0,229,255,0.08)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${it.on ? 'rgba(0,229,255,0.30)' : 'var(--border-soft)'}`,
            color: it.on ? 'var(--cyan)' : 'var(--fg-3)',
          }}
        >
          <span className="w-1 h-1 rounded-full" style={{ background: it.on ? 'var(--cyan)' : 'var(--fg-3)' }} />
          {it.k}
        </span>
      ))}
    </div>
  );
}
