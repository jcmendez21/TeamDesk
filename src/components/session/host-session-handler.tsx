'use client';

import { useEffect, useState } from 'react';
import { useWebRTC } from '@/hooks/use-webrtc';

interface HostSessionHandlerProps {
    roomId: string;
    stream: MediaStream;
}

export default function HostSessionHandler({ roomId, stream }: HostSessionHandlerProps) {
    const [cursor, setCursor] = useState<{ x: number, y: number } | null>(null);

    const { isConnected } = useWebRTC({
        isInitiator: false, // Host waits for connection
        roomId,
        stream,
        onData: (data) => {
            if (data.type === 'mousemove') {
                setCursor({ x: data.x, y: data.y });
            } else if (data.type === 'click') {
                console.log("Remote user clicked:", data.button);
                // Visual feedback for click could be added here
            }
        }
    });

    return (
        <div className="fixed top-4 right-4 z-50 p-4 bg-background/80 backdrop-blur rounded-lg border shadow-lg w-64">
            <h3 className="font-bold flex items-center gap-2">
                <span className={`h-3 w-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
                {isConnected ? 'Session Active' : 'Waiting for connection...'}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
                Room ID: <span className="font-mono">{roomId}</span>
            </p>
            <p className="text-xs text-muted-foreground">
                Sharing your screen...
            </p>

            {/* Virtual Cursor Overlay (Global) */}
            {cursor && (
                <div
                    className="fixed w-4 h-4 bg-red-500 rounded-full pointer-events-none z-[9999] transition-transform duration-75 border-2 border-white shadow-sm"
                    style={{
                        left: 0,
                        top: 0,
                        transform: `translate(${cursor.x * window.innerWidth}px, ${cursor.y * window.innerHeight}px)`
                    }}
                >
                    <div className="absolute -bottom-5 left-0 bg-red-500 text-white text-[10px] px-1 rounded">User</div>
                </div>
            )}
        </div>
    );
}
