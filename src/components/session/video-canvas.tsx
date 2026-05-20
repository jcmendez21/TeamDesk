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
 * Compute the rectangle the video actually occupies inside the canvas,
 * accounting for `object-contain` letterboxing. Without this, taps in
 * the black bars get sent to the remote as if they were inside the video
 * — making the remote cursor jump to wildly wrong positions on phones
 * where the aspect ratio of the canvas and the captured screen differ.
 */
function computeVideoRect(canvas: DOMRect, intrinsicW: number, intrinsicH: number): {
  offsetX: number; offsetY: number; width: number; height: number;
} {
  if (!intrinsicW || !intrinsicH) {
    return { offsetX: 0, offsetY: 0, width: canvas.width, height: canvas.height };
  }
  const videoAspect = intrinsicW / intrinsicH;
  const canvasAspect = canvas.width / canvas.height;
  if (videoAspect > canvasAspect) {
    // Video is wider than canvas → fills width, bars top+bottom.
    const height = canvas.width / videoAspect;
    return { offsetX: 0, offsetY: (canvas.height - height) / 2, width: canvas.width, height };
  }
  // Video is taller than canvas → fills height, bars left+right.
  const width = canvas.height * videoAspect;
  return { offsetX: (canvas.width - width) / 2, offsetY: 0, width, height: canvas.height };
}

/**
 * VideoCanvas — renders the remote stream and forwards mouse/touch/keyboard
 * events over the input channel when the active scope grants control.
 *
 * Mobile considerations:
 *   - Touch events translate to mouse-equivalents; tap = click, drag = drag.
 *   - Coordinates are normalized inside the *displayed video rectangle*,
 *     not the canvas div, so letterboxing on mismatched aspect ratios
 *     doesn't make the remote cursor jump.
 *   - The mobile toolbar buttons stop propagation so the canvas's
 *     `preventDefault` on touchstart doesn't kill their synthesized click.
 *   - "Keyboard mode" pins focus on a hidden textarea — once enabled, the
 *     soft keyboard stays open while the user taps the video so they can
 *     mix mouse-clicks and typing without re-summoning the keyboard.
 */
export function VideoCanvas({ stream, scope, qualityLabel, isHost }: VideoCanvasProps): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const keyboardRef = useRef<HTMLTextAreaElement>(null);
  const caps = capsForScope(scope);
  const { send } = useInputChannel();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [keyboardMode, setKeyboardMode] = useState(false);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    const handler = (): void => setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // While keyboard mode is on, re-focus the textarea after any tap so the
  // soft keyboard stays up. Without this, tapping the video shifts focus
  // and Android closes the keyboard.
  const refocusKeyboard = useCallback(() => {
    if (keyboardMode && keyboardRef.current) keyboardRef.current.focus();
  }, [keyboardMode]);

  // ── Coordinate normalization ────────────────────────────────────────────

  const normalize = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container) return null;
    const canvas = container.getBoundingClientRect();
    const rect = computeVideoRect(canvas, video?.videoWidth ?? 0, video?.videoHeight ?? 0);
    const localX = clientX - canvas.left - rect.offsetX;
    const localY = clientY - canvas.top - rect.offsetY;
    // Reject taps in the letterbox bars — they're meaningless on the remote.
    if (localX < 0 || localY < 0 || localX > rect.width || localY > rect.height) return null;
    return { x: localX / rect.width, y: localY / rect.height };
  }, []);

  // ── Mouse (desktop) ─────────────────────────────────────────────────────

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (!caps.canControl || isHost) return;
    const p = normalize(e.clientX, e.clientY);
    if (p) send({ type: 'mousemove', x: p.x, y: p.y });
  };

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (!caps.canControl || isHost) return;
    const p = normalize(e.clientX, e.clientY);
    if (!p) return;
    if (!keyboardMode) (e.currentTarget as HTMLDivElement).focus();
    send({ type: 'mousedown', x: p.x, y: p.y, button: e.button as 0 | 1 | 2 });
  };

  const onMouseUp = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (!caps.canControl || isHost) return;
    const p = normalize(e.clientX, e.clientY);
    if (!p) return;
    send({ type: 'mouseup', x: p.x, y: p.y, button: e.button as 0 | 1 | 2 });
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>): void => {
    if (!caps.canControl || isHost) return;
    const p = normalize(e.clientX, e.clientY);
    if (!p) return;
    send({ type: 'wheel', x: p.x, y: p.y, dx: e.deltaX, dy: e.deltaY });
  };

  // ── Touch (mobile) ──────────────────────────────────────────────────────

  // Skip the canvas's touch handling when the tap actually landed on a
  // button overlay — otherwise our `preventDefault` swallows the synthesized
  // click. Without this, the keyboard / fullscreen / mode buttons never fire.
  const targetIsButton = (e: React.TouchEvent | React.MouseEvent): boolean => {
    const t = e.target as HTMLElement | null;
    return !!t?.closest('[data-canvas-button="true"]');
  };

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>): void => {
    if (targetIsButton(e)) return;
    if (!caps.canControl || isHost) return;
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    const p = normalize(touch.clientX, touch.clientY);
    if (!p) return;
    send({ type: 'mousemove', x: p.x, y: p.y });
    send({ type: 'mousedown', x: p.x, y: p.y, button: 0 });
    refocusKeyboard();
  };

  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>): void => {
    if (targetIsButton(e)) return;
    if (!caps.canControl || isHost) return;
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    const p = normalize(touch.clientX, touch.clientY);
    if (!p) return;
    send({ type: 'mousemove', x: p.x, y: p.y });
  };

  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>): void => {
    if (targetIsButton(e)) return;
    if (!caps.canControl || isHost) return;
    e.preventDefault();
    const touch = e.changedTouches[0];
    if (!touch) return;
    const p = normalize(touch.clientX, touch.clientY);
    if (!p) return;
    send({ type: 'mouseup', x: p.x, y: p.y, button: 0 });
    refocusKeyboard();
  };

  // ── Keyboard ────────────────────────────────────────────────────────────

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

  const onTextareaInput = (e: React.FormEvent<HTMLTextAreaElement>): void => {
    (e.currentTarget as HTMLTextAreaElement).value = '';
  };

  // ── Buttons ─────────────────────────────────────────────────────────────

  const toggleKeyboard = (): void => {
    const next = !keyboardMode;
    setKeyboardMode(next);
    if (next) keyboardRef.current?.focus();
    else keyboardRef.current?.blur();
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
        tabIndex={0}
        className="relative h-[460px] rounded-md m-2 overflow-hidden outline-none select-none"
        style={{
          border: '1px solid var(--border-mid)',
          background: '#000',
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
          {keyboardMode && (
            <span
              className="px-2 py-1 rounded font-mono text-[10px] animate-pulse"
              style={{
                color: 'var(--cyan)',
                background: 'rgba(0,229,255,0.10)',
                border: '1px solid rgba(0,229,255,0.45)',
              }}
            >
              KBD · ON
            </span>
          )}
        </div>

        {!isHost && (
          <div className="absolute top-3 right-3 flex items-center gap-2">
            <IconButton
              onClick={toggleKeyboard}
              title={keyboardMode ? 'Hide keyboard' : 'Show keyboard'}
              disabled={!caps.canControl}
              active={keyboardMode}
            >
              <Keyboard size={18} />
            </IconButton>
            <IconButton onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </IconButton>
          </div>
        )}
      </div>

      <textarea
        ref={keyboardRef}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onInput={onTextareaInput}
        onBlur={() => setKeyboardMode(false)}
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
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  active?: boolean;
}): React.ReactElement {
  // The data-attribute lets the canvas detect taps on this button via
  // `closest('[data-canvas-button]')` and skip its preventDefault so the
  // synthesized mobile `click` actually fires.
  return (
    <button
      data-canvas-button="true"
      onClick={onClick}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      title={title}
      disabled={disabled}
      className="grid place-items-center transition-colors"
      style={{
        width: 44,
        height: 44,
        borderRadius: 8,
        color: disabled ? 'var(--fg-3)' : active ? 'var(--cyan)' : 'var(--fg-0)',
        background: active ? 'rgba(0,229,255,0.15)' : 'rgba(7,9,13,0.75)',
        border: `1px solid ${active ? 'rgba(0,229,255,0.55)' : 'var(--border-mid)'}`,
        backdropFilter: 'blur(6px)',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        // Larger tap target than visible — Apple HIG / Material both
        // suggest 44px minimum.
        touchAction: 'manipulation',
      }}
    >
      {children}
    </button>
  );
}
