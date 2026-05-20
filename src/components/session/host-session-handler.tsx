'use client';

import { useState } from 'react';
import { useWebRTC } from '@/hooks/use-webrtc';

interface HostSessionHandlerProps {
    roomId: string;
    stream: MediaStream;
}

type InboundInput =
    | { type: 'mousemove'; x: number; y: number }
    | { type: 'mousedown'; x: number; y: number; button: 0 | 1 | 2 }
    | { type: 'mouseup';   x: number; y: number; button: 0 | 1 | 2 }
    | { type: 'wheel';     x: number; y: number; dx: number; dy: number }
    | { type: 'keydown';   code: string; key: string }
    | { type: 'keyup';     code: string; key: string }
    | { type: 'click';     button: number }   // legacy
    | { type: 'cad' }
    | { type: 'clipboard'; text: string };

const BUTTON_NAME = ['LEFT', 'MIDDLE', 'RIGHT'] as const;

/**
 * HostSessionHandler — receives the operator's input messages over the
 * WebRTC data channel and surfaces them visually. The host is running in
 * a browser tab so it can't inject real OS events — when the Electron
 * agent lands, those messages get forwarded through IPC instead.
 *
 * Understands both the legacy payload shapes (`mousemove`, `click`) and the
 * new `InputMsg` discriminated union from `@teamdesk/shared/protocol`.
 */
export default function HostSessionHandler({ roomId, stream }: HostSessionHandlerProps) {
    const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
    const [pressed, setPressed] = useState(false);
    const [lastKey, setLastKey] = useState<string | null>(null);
    const [lastEvent, setLastEvent] = useState<string>('—');

    const { isConnected } = useWebRTC({
        isInitiator: false,
        roomId,
        stream,
        onData: (raw: InboundInput) => {
            switch (raw.type) {
                case 'mousemove':
                    setCursor({ x: raw.x, y: raw.y });
                    setLastEvent('mousemove');
                    break;
                case 'mousedown':
                    setCursor({ x: raw.x, y: raw.y });
                    setPressed(true);
                    setLastEvent(`mousedown ${BUTTON_NAME[raw.button] ?? raw.button}`);
                    break;
                case 'mouseup':
                    setPressed(false);
                    setLastEvent(`mouseup ${BUTTON_NAME[raw.button] ?? raw.button}`);
                    break;
                case 'click': // legacy compat
                    setPressed(true);
                    setLastEvent(`click ${BUTTON_NAME[raw.button] ?? raw.button}`);
                    setTimeout(() => setPressed(false), 120);
                    break;
                case 'wheel':
                    setLastEvent(`wheel dx=${raw.dx.toFixed(0)} dy=${raw.dy.toFixed(0)}`);
                    break;
                case 'keydown':
                    setLastKey(raw.key);
                    setLastEvent(`keydown ${raw.key}`);
                    break;
                case 'keyup':
                    setLastEvent(`keyup ${raw.key}`);
                    break;
                case 'cad':
                    setLastEvent('CTRL+ALT+DEL');
                    break;
                case 'clipboard':
                    setLastEvent(`clipboard (${raw.text.length} chars)`);
                    break;
            }
        },
    });

    return (
        <div className="fixed top-4 right-4 z-50 p-4 bg-background/80 backdrop-blur rounded-lg border shadow-lg w-72">
            <h3 className="font-bold flex items-center gap-2">
                <span className={`h-3 w-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
                {isConnected ? 'Session Active' : 'Waiting for connection...'}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
                Room ID: <span className="font-mono">{roomId}</span>
            </p>
            <p className="text-xs text-muted-foreground">Sharing your screen…</p>
            <div className="mt-2 pt-2 border-t text-[10px] font-mono space-y-0.5 text-muted-foreground">
                <div>last: <span className="text-foreground">{lastEvent}</span></div>
                {lastKey && <div>key: <span className="text-foreground">{lastKey}</span></div>}
            </div>

            {cursor && (
                <div
                    className={`fixed w-4 h-4 rounded-full pointer-events-none z-[9999] border-2 border-white shadow-sm transition-colors ${pressed ? 'bg-amber-400' : 'bg-red-500'}`}
                    style={{
                        left: 0,
                        top: 0,
                        transform: `translate(${cursor.x * window.innerWidth}px, ${cursor.y * window.innerHeight}px)`,
                    }}
                >
                    <div className="absolute -bottom-5 left-0 bg-red-500 text-white text-[10px] px-1 rounded">User</div>
                </div>
            )}
        </div>
    );
}
