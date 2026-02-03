'use client';

import { useEffect, useRef } from 'react';

export default function RemoteDesktopView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const resizeCanvas = () => {
        canvas.width = container.offsetWidth;
        canvas.height = container.offsetHeight;
        
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = 'white';
        ctx.font = '24px "Open Sans"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Remote Desktop Stream', canvas.width / 2, canvas.height / 2 - 20);
        
        ctx.font = '16px "Open Sans"';
        ctx.fillStyle = '#888';
        ctx.fillText('Waiting for connection...', canvas.width / 2, canvas.height / 2 + 20);
    }
    
    resizeCanvas();
    
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(container);
    
    return () => {
        resizeObserver.disconnect();
    }

  }, []);

  return (
    <div ref={containerRef} className="w-full h-full bg-black rounded-lg overflow-hidden">
      <canvas ref={canvasRef} />
    </div>
  );
}
