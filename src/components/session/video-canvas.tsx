'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Maximize2, Minimize2 } from 'lucide-react';
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

const modsFromEvent = (e: { ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }): KeyModifiers => ({
  ctrl: e.ctrlKey,
  alt: e.altKey,
  shift: e.shiftKey,
  meta: e.metaKey,
});

/**
 * VideoCanvas — renders the remote stream and forwards mouse/touch/keyboard
 * events over the input channel when the active scope grants control.
 *
 * Mobile considerations:
 *   - Touch events are translated to mouse-equivalents so a tap fires a
 *     mousedown+mouseup at the touch coordinate.
 *   - `touch-action: none` on the canvas suppresses browser-native gestures
 *     (page scroll, pinch-zoom) so they don't fight our handlers.
 *   - A keyboard button focuses a hidden `<textarea>` to summon the soft
 *     keyboard on mobile. The textarea captures `keydown`/`keyup` directly,
 *     which is the only reliable cross-platform way to read soft-keyboard
 *     input on Android/iOS.
 *   - A fullscreen toggle calls the native Fullscreen API on the video
 *     container, so the video fills the screen — critical on phones where
 *     the rest of the operator dashboard is wasted chrome.
 *
 * Coordinates are normalized 0..1 so the host can map them to whatever
 * resolution it captured at — the wire format never embeds a pixel size.
 */
export function VideoCanvas({ stream, scope, qualityLabel, isHost }: VideoCanvasProps): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const keyboardRef = useRef<HTMLTextAreaElement>(null);
  const caps = capsForScope(scope);
  const { send } = useInputChannel();
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Sync local state with the browser's actual fullscreen state — covers
  // the user pressing ESC, the OS swiping out of fullscreen, etc.
  useEffect(() => {
    const handler = (): void => setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // ── Coordinate helpers ─────────────────────────────────────────────────

  const coordsFromMouse = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  }, []);

  const coordsFromTouch = useCallback((e: React.TouchEvent<HTMLDivElement>, touch: React.Touch) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: (touch.clientX - rect.left) / rect.width, y: (touch.clientY - rect.top) / rect.height };
  }, []);

  // ── Mouse (desktop) ────────────────────────────────────────────────────

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (!caps.canControl || isHost) return;
    const { x, y } = coordsFromMouse(e);
    send({ type: 'mousemove', x, y });
  };

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (!caps.canControl || isHost) return;
    (e.currentTarget as HTMLDivElement).focus();
    const { x, y } = coordsFromMouse(e);
    send({ type: 'mousedown', x, y, button: e.button as 0 | 1 | 2 });
  };

  const onMouseUp = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (!caps.canControl || isHost) return;
    const { x, y } = coordsFromMouse(e);
    send({ type: 'mouseup', x, y, button: e.button as 0 | 1 | 2 });
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>): void => {
    if (!caps.canControl || isHost) return;
    const { x, y } = coordsFromMouse(e);
    send({ type: 'wheel', x, y, dx: e.deltaX, dy: e.deltaY });
  };

  // ── Touch (mobile) ─────────────────────────────────────────────────────

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>): void => {
    if (!caps.canControl || isHost) return;
    e.preventDefault(); // suppress synthesized mouse events + page scroll
    const touch = e.touches[0];
    if (!touch) return;
    const { x, y } = coordsFromTouch(e, touch);
    send({ type: 'mousemove', x, y });
    send({ type: 'mousedown', x, y, button: 0 });
  };

  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>): void => {
    if (!caps.canControl || isHost) return;
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    const { x, y } = coordsFromTouch(e, touch);
    send({ type: 'mousemove', x, y });
  };

  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>): void => {
    if (!caps.canControl || isHost) return;
    e.preventDefault();
    // At touchend `touches` is empty — read the lifted finger from changedTouches.
    const touch = e.changedTouches[0];
    if (!touch) return;
    const { x, y } = coordsFromTouch(e, touch);
    send({ type: 'mouseup', x, y, button: 0 });
  };

  // ── Keyboard ───────────────────────────────────────────────────────────

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (!caps.canControl || isHost) return;
    e.preventDefault();
    send({ type: 'keydown', code: e.code, key: e.key, modifiers: modsFromEvent(e) });
  };

  const onKeyUp = (e: React.KeyboardEvent): void => {
    if (!caps.canControl || isHost) return;
    e.preventDefault();
    send({ type: 'keyup', code: e.code, key: e.key, modifiers: modsFromEvent(e) });
  };

  // Clear the textarea every input event so it doesn't accumulate a buffer
  // that an autocorrect engine might later "replace" with weird artifacts.
  const onTextareaInput = (e: React.FormEvent<HTMLTextAreaElement>): void => {
    (e.currentTarget as HTMLTextAreaElement).value = '';
  };

  // ── Action button handlers ─────────────────────────────────────────────

  const openKeyboard = (): void => {
    keyboardRef.current?.focus();
  };

  const toggleFullscreen = async (): Promise<void> => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) {
      await document.exitFullscreen();
    } else {
      await el.requestFullscreen({ navigationUI: 'hide' });
    }
  };

  return (
    <section
      className="rounded-md overflow-hidden relative"
      style={{ background: 'var(--session-panel)', border: '1px solid var(--border-soft)' }}
    >
      <div
        ref={containerRef}
        // tabIndex=0 makes the div focusable so it receives keyboard events
        // on desktop. Mobile soft keyboards target the hidden textarea below.
        tabIndex={0}
        className="relative h-[460px] rounded-md m-2 overflow-hidden outline-none select-none"
        style={{
          border: '1px solid var(--border-mid)',
          background: '#000',
          // Stop the mobile browser from intercepting drags/pinches.
          touchAction: 'none',
          WebkitUserSelect: 'none',
        }}
        onMouseMove={onMouseMove}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
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

        <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
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

        {/* Floating mobile toolbar — also useful on desktop. The buttons
            sit on the video so they survive fullscreen mode, where the
            outer ActionBar isn't visible. */}
        {!isHost && (
          <div className="absolute top-3 right-3 flex items-center gap-2">
            <IconButton onClick={openKeyboard} title="Show keyboard" disabled={!caps.canControl}>
              <Keyboard size={14} />
            </IconButton>
            <IconButton onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </IconButton>
          </div>
        )}
      </div>

      {/* Off-screen textarea — clicking the keyboard button focuses this,
          which triggers the soft keyboard on mobile. Key events are caught
          and forwarded as InputMsgs identical to physical keyboard input. */}
      <textarea
        ref={keyboardRef}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onInput={onTextareaInput}
        aria-hidden="true"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        style={{
          position: 'fixed',
          left: -9999,
          top: -9999,
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: 'none',
        }}
      />
    </section>
  );
}

function IconButton({
  children,
  onClick,
  title,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="w-8 h-8 rounded grid place-items-center transition-colors"
      style={{
        color: disabled ? 'var(--fg-3)' : 'var(--fg-1)',
        background: 'rgba(7,9,13,0.7)',
        border: '1px solid var(--border-mid)',
        backdropFilter: 'blur(6px)',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}
