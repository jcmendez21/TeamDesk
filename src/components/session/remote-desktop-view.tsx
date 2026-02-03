'use client';

import { useEffect, useRef } from 'react';
import { PlaceHolderImages } from '@/lib/placeholder-images';

export default function RemoteDesktopView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const isConnected = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imageUrl = PlaceHolderImages.find((i) => i.id === 'machine-1')?.imageUrl;
    if (imageUrl && !imageRef.current) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = imageUrl;
      imageRef.current = img;
    }

    const draw = () => {
      if (!canvas || !container || !ctx) return;
      canvas.width = container.offsetWidth;
      canvas.height = container.offsetHeight;

      if (isConnected.current && imageRef.current && imageRef.current.complete) {
        ctx.drawImage(imageRef.current, 0, 0, canvas.width, canvas.height);
      } else {
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white';
        ctx.font = '24px "Open Sans"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Simulating Connection...', canvas.width / 2, canvas.height / 2);
      }
    };
    
    draw(); // Initial draw

    const image = imageRef.current;
    if (image && !image.complete) {
        image.onload = draw;
    }

    const connectionTimeout = setTimeout(() => {
      isConnected.current = true;
      draw();
    }, 1500);


    const resizeObserver = new ResizeObserver(draw);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      clearTimeout(connectionTimeout);
      if (image) {
        image.onload = null;
      }
    };
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full bg-black rounded-lg overflow-hidden">
      <canvas ref={canvasRef} />
    </div>
  );
}
