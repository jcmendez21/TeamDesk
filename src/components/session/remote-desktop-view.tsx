'use client';

import { useEffect, useRef, useState } from 'react';
import { useWebRTC } from '@/hooks/use-webrtc';

interface RemoteDesktopViewProps {
  sessionId: string;
}

export default function RemoteDesktopView({ sessionId }: RemoteDesktopViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const { sendData, isConnected } = useWebRTC({
    isInitiator: true, // Viewer initiates connection
    roomId: sessionId,
    onStream: (stream) => {
      console.log("Receiving remote stream", stream);
      setRemoteStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(e => console.error("Video play failed", e));
      }
    }
  });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    // Send normalized coordinates
    sendData({ type: 'mousemove', x, y });
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    sendData({ type: 'click', button: e.button });
  };

  useEffect(() => {
    if (videoRef.current && remoteStream) {
      videoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-black rounded-lg overflow-hidden relative flex justify-center items-center group cursor-crosshair"
      onMouseMove={handleMouseMove}
      onClick={handleClick}
    >
      {!isConnected && (
        <div className="absolute text-white/70 animate-pulse flex flex-col items-center gap-2">
          <span className="text-xl font-bold">Connecting to {sessionId}...</span>
          <span className="text-sm">Waiting for remote host...</span>
        </div>
      )}

      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        autoPlay
        playsInline
        muted // Ensure autoplay works better
      />
    </div>
  );
}
