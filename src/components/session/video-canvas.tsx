'use client';

import { useEffect, useRef } from 'react';
import { capsForScope, type ScopeId } from '@/domain/scopes';
import { useInputChannel } from '@/hooks/use-input-channel';
import type { KeyModifiers } from '@teamdesk/shared';

interface VideoCanvasProps {
  stream: MediaStream | null;
  scope: ScopeId;
  qualityLabel?: string;
  /** When true, overlay shows the operator is broadcasting (host UI). */
  isHost?: boolean;
}

const modsFromEvent = (e: React.KeyboardEvent): KeyModifiers => ({
  ctrl: e.ctrlKey,
  alt: e.altKey,
  shift: e.shiftKey,
  meta: e.metaKey,
});

/**
 * VideoCanvas — renders the remote stream and forwards mouse/wheel events
 * over the input channel when the active scope grants control.
 *
 * Coordinates are normalized 0..1 so the host can map them to whatever
 * resolution it captured at — the wire format never embeds a pixel size.
 */
export function VideoCanvas({ stream, scope, qualityLabel, isHost }: VideoCanvasProps): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const caps = capsForScope(scope);
  const { send } = useInputChannel();

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const onMove = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (!caps.canControl || isHost) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    send({ type: 'mousemove', x, y });
  };

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (!caps.canControl || isHost) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    send({ type: 'mousedown', x, y, button: e.button as 0 | 1 | 2 });
  };

  const onMouseUp = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (!caps.canControl || isHost) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    send({ type: 'mouseup', x, y, button: e.button as 0 | 1 | 2 });
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>): void => {
    if (!caps.canControl || isHost) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    send({ type: 'wheel', x, y, dx: e.deltaX, dy: e.deltaY });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (!caps.canControl || isHost) return;
    // Block the browser's default for the focused canvas so arrow keys,
    // tab, and shortcuts route to the remote instead of the page.
    e.preventDefault();
    send({ type: 'keydown', code: e.code, key: e.key, modifiers: modsFromEvent(e) });
  };

  const onKeyUp = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (!caps.canControl || isHost) return;
    e.preventDefault();
    send({ type: 'keyup', code: e.code, key: e.key, modifiers: modsFromEvent(e) });
  };

  return (
    <section className="rounded-md overflow-hidden relative" style={{ background: 'var(--session-panel)', border: '1px solid var(--border-soft)' }}>
      <div
        // tabIndex=0 makes the div focusable so it can receive keyboard
        // events. Clicking it grabs focus naturally; the outline is
        // suppressed in favor of the existing border styling.
        tabIndex={0}
        className="relative h-[460px] rounded-md m-2 overflow-hidden outline-none"
        style={{ border: '1px solid var(--border-mid)', background: '#000' }}
        onMouseMove={onMove}
        onMouseDown={(e) => { (e.currentTarget as HTMLDivElement).focus(); onMouseDown(e); }}
        onMouseUp={onMouseUp}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        {stream ? (
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain" />
        ) : (
          <div className="absolute inset-0 grid place-items-center font-mono text-[12px]" style={{ color: 'var(--fg-2)' }}>
            {isHost ? 'Broadcasting — waiting for operator' : 'Waiting for remote stream…'}
          </div>
        )}

        {!caps.canControl && !isHost && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <div
              className="px-4 py-2 rounded-md font-mono text-[11px] tracking-widest"
              style={{
                background: 'rgba(245,158,11,0.10)',
                border: '1px solid rgba(245,158,11,0.45)',
                color: 'var(--amber)',
                backdropFilter: 'blur(6px)',
              }}
            >
              READ-ONLY · INPUT INJECTION DISABLED BY SCOPE
            </div>
          </div>
        )}

        <div className="absolute top-3 left-3 flex items-center gap-2">
          <span
            className="px-2 py-1 rounded font-mono text-[10px]"
            style={{
              color: caps.canControl ? 'var(--cyan)' : 'var(--amber)',
              borderColor: caps.canControl ? 'rgba(0,229,255,0.35)' : 'rgba(245,158,11,0.45)',
              background: caps.canControl ? 'rgba(0,229,255,0.05)' : 'rgba(245,158,11,0.06)',
              border: '1px solid',
            }}
          >
            {caps.canControl && !isHost ? 'CTRL · ACTIVE' : isHost ? 'HOST' : 'VIEW ONLY'}
          </span>
          {qualityLabel && (
            <span className="px-2 py-1 rounded font-mono text-[10px]" style={{ color: 'var(--fg-1)', border: '1px solid var(--border-mid)' }}>
              {qualityLabel}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
