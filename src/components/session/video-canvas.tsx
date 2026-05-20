'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Maximize2, Minimize2, ZoomIn } from 'lucide-react';
import { capsForScope, type ScopeId } from '@/domain/scopes';
import { useInputChannel } from '@/hooks/use-input-channel';
import type { KeyModifiers } from '@teamdesk/shared';

interface VideoCanvasProps {
  stream: MediaStream | null;
  scope: ScopeId;
  qualityLabel?: string;
  isHost?: boolean;
}

const modsFromEvent = (e: { ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }): KeyModifiers => ({
  ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey,
});

// Gesture thresholds tuned by hand:
//   TAP_MOVE_PX = max finger movement that still counts as a tap (not a drag)
//   TAP_MAX_MS = max duration a stationary touch can hold and still tap
const TAP_MOVE_PX = 8;
const TAP_MAX_MS = 350;
const ZOOM_MIN = 1;
const ZOOM_MAX = 5;

/**
 * Compute the rectangle the video actually occupies inside the canvas,
 * accounting for `object-contain` letterboxing.
 */
function computeVideoRect(canvas: { width: number; height: number }, intrinsicW: number, intrinsicH: number) {
  if (!intrinsicW || !intrinsicH) return { offsetX: 0, offsetY: 0, width: canvas.width, height: canvas.height };
  const videoAspect = intrinsicW / intrinsicH;
  const canvasAspect = canvas.width / canvas.height;
  if (videoAspect > canvasAspect) {
    const height = canvas.width / videoAspect;
    return { offsetX: 0, offsetY: (canvas.height - height) / 2, width: canvas.width, height };
  }
  const width = canvas.height * videoAspect;
  return { offsetX: (canvas.width - width) / 2, offsetY: 0, width, height: canvas.height };
}

type Gesture =
  | { kind: 'idle' }
  | { kind: 'maybe-tap'; startX: number; startY: number; startTime: number }
  | { kind: 'drag' }
  | { kind: 'pinch'; d0: number; z0: number; px0: number; py0: number; cx0: number; cy0: number }
  | { kind: 'post-pinch' };

/**
 * VideoCanvas — renders the remote stream and forwards mouse/touch/keyboard
 * events. Implements the standard mobile-remote-desktop gesture model:
 *
 *   - 1 finger tap (no drag, <350ms)   → click at that point
 *   - 1 finger drag                     → move cursor only (no click held)
 *   - 2 finger pinch                    → local zoom + pan (not relayed)
 *
 * Keyboard typing on mobile is routed through an `input` event on a hidden
 * textarea (mobile soft keyboards don't fire reliable keydown/keyup, so the
 * inserted text is forwarded as `type-text` and the agent calls
 * `keyboard.type()`). The textarea lives inside the same container that
 * goes fullscreen so the soft keyboard remains attachable in fullscreen.
 */
export function VideoCanvas({ stream, scope, qualityLabel, isHost }: VideoCanvasProps): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const keyboardRef = useRef<HTMLTextAreaElement>(null);
  const gestureRef = useRef<Gesture>({ kind: 'idle' });

  const caps = capsForScope(scope);
  const { send } = useInputChannel();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [keyboardMode, setKeyboardMode] = useState(false);

  // Local zoom/pan state. NOT sent to the remote — it's a viewing aid for
  // the operator's screen, not a remote desktop operation.
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    const h = (): void => setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  // ── Coordinate normalization (handles letterbox + zoom/pan) ─────────────

  const normalize = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container) return null;
    const r = container.getBoundingClientRect();

    // Reverse the CSS transform applied to the inner div so we work in the
    // un-zoomed canvas space. transform: translate(pan) scale(zoom) with
    // transform-origin at center means a touch at container (X,Y) maps to
    // un-zoomed (Xu, Yu) via:
    //   Xu = (X - centerX - pan.x) / zoom + centerX
    const cx = r.width / 2, cy = r.height / 2;
    const localX = clientX - r.left;
    const localY = clientY - r.top;
    const Xu = (localX - cx - pan.x) / zoom + cx;
    const Yu = (localY - cy - pan.y) / zoom + cy;

    const rect = computeVideoRect({ width: r.width, height: r.height }, video?.videoWidth ?? 0, video?.videoHeight ?? 0);
    const inVideoX = Xu - rect.offsetX;
    const inVideoY = Yu - rect.offsetY;
    if (inVideoX < 0 || inVideoY < 0 || inVideoX > rect.width || inVideoY > rect.height) return null;
    return { x: inVideoX / rect.width, y: inVideoY / rect.height };
  }, [zoom, pan.x, pan.y]);

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

  // ── Touch (mobile) — gesture state machine ──────────────────────────────

  const targetIsButton = (e: React.TouchEvent | React.MouseEvent): boolean => {
    const t = e.target as HTMLElement | null;
    return !!t?.closest('[data-canvas-button="true"]');
  };

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>): void => {
    if (targetIsButton(e)) return;
    if (!caps.canControl || isHost) return;
    e.preventDefault();

    // Two fingers → pinch. Capture initial state.
    if (e.touches.length >= 2) {
      const t0 = e.touches[0], t1 = e.touches[1];
      const dx = t1.clientX - t0.clientX, dy = t1.clientY - t0.clientY;
      const d0 = Math.hypot(dx, dy);
      const cx0 = (t0.clientX + t1.clientX) / 2;
      const cy0 = (t0.clientY + t1.clientY) / 2;
      gestureRef.current = { kind: 'pinch', d0, z0: zoom, px0: pan.x, py0: pan.y, cx0, cy0 };
      return;
    }

    // Single touch — assume tap until proven otherwise.
    const t = e.touches[0];
    gestureRef.current = {
      kind: 'maybe-tap',
      startX: t.clientX,
      startY: t.clientY,
      startTime: Date.now(),
    };
  };

  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>): void => {
    if (targetIsButton(e)) return;
    if (!caps.canControl || isHost) return;
    e.preventDefault();
    const g = gestureRef.current;

    // Promote to pinch if a second finger arrived mid-gesture.
    if (g.kind !== 'pinch' && g.kind !== 'post-pinch' && e.touches.length >= 2) {
      const t0 = e.touches[0], t1 = e.touches[1];
      const d0 = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      const cx0 = (t0.clientX + t1.clientX) / 2;
      const cy0 = (t0.clientY + t1.clientY) / 2;
      gestureRef.current = { kind: 'pinch', d0, z0: zoom, px0: pan.x, py0: pan.y, cx0, cy0 };
      return;
    }

    if (g.kind === 'pinch' && e.touches.length >= 2) {
      const t0 = e.touches[0], t1 = e.touches[1];
      const d1 = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      const cx1 = (t0.clientX + t1.clientX) / 2;
      const cy1 = (t0.clientY + t1.clientY) / 2;
      const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, g.z0 * (d1 / g.d0)));
      // Keep the original midpoint anchored to the same content point as
      // the zoom changes. Reverse the transform to find what point was
      // under c0 originally, then re-solve pan so the same point sits at c1.
      const container = containerRef.current;
      if (container) {
        const r = container.getBoundingClientRect();
        const centerX = r.width / 2, centerY = r.height / 2;
        const localC0X = g.cx0 - r.left, localC0Y = g.cy0 - r.top;
        const localC1X = cx1 - r.left,   localC1Y = cy1 - r.top;
        const innerX = (localC0X - centerX - g.px0) / g.z0 + centerX;
        const innerY = (localC0Y - centerY - g.py0) / g.z0 + centerY;
        const newPanX = localC1X - centerX - newZoom * (innerX - centerX);
        const newPanY = localC1Y - centerY - newZoom * (innerY - centerY);
        setZoom(newZoom);
        setPan({ x: newPanX, y: newPanY });
      }
      return;
    }

    if (g.kind === 'maybe-tap') {
      const t = e.touches[0];
      const dx = t.clientX - g.startX, dy = t.clientY - g.startY;
      if (Math.hypot(dx, dy) > TAP_MOVE_PX) {
        // Promote to drag — the user is moving the cursor without clicking.
        gestureRef.current = { kind: 'drag' };
        const p = normalize(t.clientX, t.clientY);
        if (p) send({ type: 'mousemove', x: p.x, y: p.y });
      }
      return;
    }

    if (g.kind === 'drag') {
      const t = e.touches[0];
      const p = normalize(t.clientX, t.clientY);
      if (p) send({ type: 'mousemove', x: p.x, y: p.y });
    }
  };

  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>): void => {
    if (targetIsButton(e)) return;
    if (!caps.canControl || isHost) return;
    e.preventDefault();
    const g = gestureRef.current;

    // If we were pinching and one finger lifted, stay in post-pinch (do not
    // generate a phantom tap from the remaining finger) until all release.
    if (g.kind === 'pinch') {
      if (e.touches.length === 0) gestureRef.current = { kind: 'idle' };
      else gestureRef.current = { kind: 'post-pinch' };
      return;
    }
    if (g.kind === 'post-pinch') {
      if (e.touches.length === 0) gestureRef.current = { kind: 'idle' };
      return;
    }

    if (g.kind === 'maybe-tap') {
      const dt = Date.now() - g.startTime;
      const t = e.changedTouches[0];
      if (dt < TAP_MAX_MS && t) {
        // It was a real tap → emit a click at that point.
        const p = normalize(t.clientX, t.clientY);
        if (p) {
          send({ type: 'mousemove', x: p.x, y: p.y });
          send({ type: 'mousedown', x: p.x, y: p.y, button: 0 });
          send({ type: 'mouseup',   x: p.x, y: p.y, button: 0 });
        }
        if (keyboardMode) keyboardRef.current?.focus();
      }
      gestureRef.current = { kind: 'idle' };
      return;
    }

    // Drag end — cursor already where last move put it; just clean state.
    gestureRef.current = { kind: 'idle' };
    if (keyboardMode) keyboardRef.current?.focus();
  };

  // ── Keyboard ────────────────────────────────────────────────────────────

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (!caps.canControl || isHost) return;
    // Soft keyboards send `Unidentified` for character keys but real codes
    // for special keys (Backspace, Enter, arrows). Forward only those.
    const isSpecial = e.code && e.code !== 'Unidentified' && !/^Key[A-Z]$|^Digit[0-9]$/.test(e.code) === false
      ? false
      : !!e.code && e.code !== 'Unidentified';
    // Simpler decision: pass through if code is recognized AND key is a
    // non-character (length > 1, e.g. "Backspace", "Enter", "ArrowLeft").
    if (e.code && e.code !== 'Unidentified' && (e.key.length > 1 || e.ctrlKey || e.metaKey || e.altKey)) {
      e.preventDefault();
      send({ type: 'keydown', code: e.code, key: e.key, modifiers: modsFromEvent(e) });
    }
    void isSpecial;
  };

  const onKeyUp = (e: React.KeyboardEvent): void => {
    if (!caps.canControl || isHost) return;
    if (e.code && e.code !== 'Unidentified' && (e.key.length > 1 || e.ctrlKey || e.metaKey || e.altKey)) {
      e.preventDefault();
      send({ type: 'keyup', code: e.code, key: e.key, modifiers: modsFromEvent(e) });
    }
  };

  // Soft keyboards reliably fire `input` events with `data` set to the
  // inserted character(s). That's the mobile typing path.
  const onTextareaInput = (e: React.FormEvent<HTMLTextAreaElement>): void => {
    const target = e.currentTarget;
    const data = (e.nativeEvent as InputEvent).data;
    target.value = '';
    if (!caps.canControl || isHost) return;
    if (data) send({ type: 'type-text', text: data });
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
    if (document.fullscreenElement === el) await document.exitFullscreen();
    else await el.requestFullscreen({ navigationUI: 'hide' });
  };

  const resetZoom = (): void => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
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
        onTouchCancel={onTouchEnd}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Inner div carries the transform so the container's bounding box
            stays fixed — that keeps coordinate math stable while the user
            pinches. */}
        <div
          ref={innerRef}
          className="absolute inset-0"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center',
            transition: gestureRef.current.kind === 'pinch' ? 'none' : 'transform 0.12s ease-out',
          }}
        >
          {stream ? (
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain pointer-events-none" />
          ) : (
            <div className="absolute inset-0 grid place-items-center font-mono text-[12px]" style={{ color: 'var(--fg-2)' }}>
              {isHost ? 'Broadcasting — waiting for operator' : 'Waiting for remote stream…'}
            </div>
          )}
        </div>

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
          <span className="px-2 py-1 rounded font-mono text-[10px]"
            style={{
              color: caps.canControl ? 'var(--cyan)' : 'var(--amber)',
              borderColor: caps.canControl ? 'rgba(0,229,255,0.35)' : 'rgba(245,158,11,0.45)',
              background: caps.canControl ? 'rgba(0,229,255,0.05)' : 'rgba(245,158,11,0.06)',
              border: '1px solid',
            }}>
            {caps.canControl && !isHost ? 'CTRL · ACTIVE' : isHost ? 'HOST' : 'VIEW ONLY'}
          </span>
          {qualityLabel && (
            <span className="px-2 py-1 rounded font-mono text-[10px]" style={{ color: 'var(--fg-1)', border: '1px solid var(--border-mid)' }}>
              {qualityLabel}
            </span>
          )}
          {keyboardMode && (
            <span className="px-2 py-1 rounded font-mono text-[10px] animate-pulse"
              style={{
                color: 'var(--cyan)',
                background: 'rgba(0,229,255,0.10)',
                border: '1px solid rgba(0,229,255,0.45)',
              }}>
              KBD · ON
            </span>
          )}
          {zoom > 1.01 && (
            <span className="px-2 py-1 rounded font-mono text-[10px]"
              style={{ color: 'var(--violet)', background: 'rgba(167,139,250,0.10)', border: '1px solid rgba(167,139,250,0.45)' }}>
              ZOOM {zoom.toFixed(1)}×
            </span>
          )}
        </div>

        {!isHost && (
          <div className="absolute top-3 right-3 flex items-center gap-2">
            {zoom > 1.01 && (
              <IconButton onClick={resetZoom} title="Reset zoom">
                <ZoomIn size={18} />
              </IconButton>
            )}
            <IconButton onClick={toggleKeyboard} title={keyboardMode ? 'Hide keyboard' : 'Show keyboard'} disabled={!caps.canControl} active={keyboardMode}>
              <Keyboard size={18} />
            </IconButton>
            <IconButton onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </IconButton>
          </div>
        )}

        {/* Textarea lives inside the container so when we go fullscreen,
            the soft-keyboard target stays inside the fullscreen element —
            otherwise mobile browsers refuse to attach the keyboard. */}
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
          inputMode="text"
          style={{
            position: 'absolute',
            // Park it just below the visible canvas; opacity 0 + caret-color
            // transparent hide it visually but keyboards still attach.
            left: 0, bottom: 0, width: 1, height: 1,
            opacity: 0, color: 'transparent', caretColor: 'transparent',
            border: 'none', background: 'transparent',
            pointerEvents: 'none', resize: 'none',
          }}
        />
      </div>
    </section>
  );
}

function IconButton({
  children, onClick, title, disabled, active,
}: {
  children: React.ReactNode; onClick: () => void; title: string; disabled?: boolean; active?: boolean;
}): React.ReactElement {
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
        width: 44, height: 44, borderRadius: 8,
        color: disabled ? 'var(--fg-3)' : active ? 'var(--cyan)' : 'var(--fg-0)',
        background: active ? 'rgba(0,229,255,0.15)' : 'rgba(7,9,13,0.75)',
        border: `1px solid ${active ? 'rgba(0,229,255,0.55)' : 'var(--border-mid)'}`,
        backdropFilter: 'blur(6px)',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        touchAction: 'manipulation',
      }}
    >
      {children}
    </button>
  );
}
