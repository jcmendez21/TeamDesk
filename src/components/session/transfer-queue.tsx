'use client';

import { useRef } from 'react';
import { ArrowUp, ArrowDown, Upload, Pause, Play, X } from 'lucide-react';
import { capsForScope, type ScopeId } from '@/domain/scopes';
import { useFileChannel } from '@/hooks/use-file-channel';
import type { TransferItem } from '@/domain/types';

const fmtBytes = (b: number): string => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(1)} GB`;
};

interface TransferQueueProps {
  scope: ScopeId;
  sessionId: string;
}

export function TransferQueue({ scope, sessionId }: TransferQueueProps): React.ReactElement {
  const caps = capsForScope(scope);
  const { transfers, enqueueUpload, pause, resume, cancel } = useFileChannel(sessionId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!caps.canFiles) {
    return (
      <section className="rounded-md overflow-hidden" style={{ background: 'var(--session-panel)', border: '1px solid var(--border-soft)' }}>
        <div className="px-3 pt-3 pb-2 flex items-center justify-between">
          <div>
            <div className="font-mono text-[10px]" style={{ color: 'var(--fg-3)', letterSpacing: '0.10em' }}>FILE TRANSFER</div>
            <div className="text-[13px] font-semibold" style={{ color: 'var(--fg-0)' }}>Active queue</div>
          </div>
          <span
            className="px-2 py-0.5 rounded font-mono text-[10px]"
            style={{ color: 'var(--amber)', borderColor: 'rgba(245,158,11,0.45)', background: 'rgba(245,158,11,0.06)', border: '1px solid' }}
          >
            LOCKED
          </span>
        </div>
        <div className="px-3 pb-3 font-mono text-[11px]" style={{ color: 'var(--fg-2)' }}>
          File system bridge offline. Agent does not initialize the file module unless scope is{' '}
          <span style={{ color: 'var(--cyan)' }}>SCREEN_FILES</span> or higher.
        </div>
      </section>
    );
  }

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(e.target.files ?? []);
    files.forEach((f) => void enqueueUpload(f));
    e.target.value = '';
  };

  return (
    <section className="rounded-md overflow-hidden" style={{ background: 'var(--session-panel)', border: '1px solid var(--border-soft)' }}>
      <div className="px-3 pt-3 pb-2 flex items-center justify-between">
        <div>
          <div className="font-mono text-[10px]" style={{ color: 'var(--fg-3)', letterSpacing: '0.10em' }}>FILE TRANSFER</div>
          <div className="text-[13px] font-semibold" style={{ color: 'var(--fg-0)' }}>Active queue</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px]" style={{ color: 'var(--fg-3)' }}>{transfers.length} ITEMS</span>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFiles} />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="h-7 px-2 rounded flex items-center gap-1 font-mono text-[10px]"
            style={{ color: 'var(--cyan)', background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.45)' }}
          >
            <Upload size={11} /> UPLOAD
          </button>
        </div>
      </div>
      <div className="px-2 pb-2 space-y-1.5">
        {transfers.length === 0 && (
          <div className="px-3 py-4 text-center font-mono text-[11px]" style={{ color: 'var(--fg-3)' }}>
            No transfers
          </div>
        )}
        {transfers.map((t) => (
          <Row
            key={t.id}
            item={t}
            onPause={() => pause(t.id)}
            onResume={() => resume(t.id)}
            onCancel={() => cancel(t.id)}
          />
        ))}
      </div>
    </section>
  );
}

interface RowProps {
  item: TransferItem;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}

function Row({ item, onPause, onResume, onCancel }: RowProps): React.ReactElement {
  const isUp = item.direction === 'up';
  const pct = item.chunksTotal > 0 ? Math.min(100, Math.round((item.chunksDone / item.chunksTotal) * 100)) : 0;
  const isDone = item.status === 'completed';
  const isPaused = item.status === 'paused';

  return (
    <div
      className="px-2.5 py-2 rounded-md"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-soft)' }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <div
          className="w-7 h-7 rounded grid place-items-center"
          style={{
            background: isUp ? 'rgba(0,229,255,0.10)' : 'rgba(167,139,250,0.10)',
            border: `1px solid ${isUp ? 'rgba(0,229,255,0.35)' : 'rgba(167,139,250,0.35)'}`,
            color: isUp ? 'var(--cyan)' : 'var(--violet)',
          }}
        >
          {isUp ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[12px] truncate" style={{ color: 'var(--fg-0)' }}>{item.name}</div>
          <div className="font-mono text-[10px] flex items-center gap-2" style={{ color: 'var(--fg-3)' }}>
            <span>{fmtBytes(item.sizeBytes)}</span>
            <span>·</span>
            <span>{isUp ? '↑ to remote' : '↓ from remote'}</span>
            <span>·</span>
            <span style={{ color: isDone ? 'var(--green)' : isPaused ? 'var(--amber)' : 'var(--cyan)' }}>{item.status}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!isDone && (isPaused
            ? <IconBtn onClick={onResume} title="Resume"><Play size={11} /></IconBtn>
            : <IconBtn onClick={onPause} title="Pause"><Pause size={11} /></IconBtn>
          )}
          {!isDone && <IconBtn onClick={onCancel} title="Cancel"><X size={11} /></IconBtn>}
          <span className="font-mono text-[10px] ml-1 w-9 text-right" style={{ color: 'var(--fg-1)' }}>{pct}%</span>
        </div>
      </div>
      <div className="h-[4px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
        <div
          className="h-full"
          style={{
            width: `${pct}%`,
            background: isDone ? 'var(--green)' : isPaused ? 'var(--amber)' : 'var(--cyan)',
            transition: 'width 0.6s ease',
          }}
        />
      </div>
    </div>
  );
}

function IconBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-6 h-6 rounded grid place-items-center"
      style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--fg-1)', border: '1px solid var(--border-soft)' }}
    >
      {children}
    </button>
  );
}
