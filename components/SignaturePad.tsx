'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

export type SignaturePadHandle = {
  isEmpty: () => boolean;
  toDataURL: () => string;
  clear: () => void;
};

export const SignaturePad = forwardRef<SignaturePadHandle>(function SignaturePad(_props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const hasDrawnRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);

  function getContext(): CanvasRenderingContext2D | null {
    return canvasRef.current?.getContext('2d') ?? null;
  }

  function fillWhite() {
    const ctx = getContext();
    const canvas = canvasRef.current;
    if (ctx && canvas) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  useEffect(() => {
    fillWhite();
  }, []);

  // 캔버스는 CSS로 늘어나지만(w-full) 내부 해상도는 고정(400x160)이므로, 화면 좌표를 캔버스
  // 내부 좌표로 정확히 변환해야 선이 커서/손가락 위치와 어긋나지 않는다.
  function getPosition(event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (activePointerIdRef.current !== null) return;
    const ctx = getContext();
    if (!ctx) return;
    drawingRef.current = true;
    activePointerIdRef.current = event.pointerId;
    const { x, y } = getPosition(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
    canvasRef.current?.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.pointerId !== activePointerIdRef.current) return;
    if (!drawingRef.current) return;
    const ctx = getContext();
    if (!ctx) return;
    const { x, y } = getPosition(event);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000000';
    ctx.lineTo(x, y);
    ctx.stroke();
    hasDrawnRef.current = true;
  }

  function handlePointerUp() {
    drawingRef.current = false;
    activePointerIdRef.current = null;
  }

  useImperativeHandle(ref, () => ({
    isEmpty: () => !hasDrawnRef.current,
    toDataURL: () => canvasRef.current?.toDataURL('image/png') ?? '',
    clear: () => {
      fillWhite();
      hasDrawnRef.current = false;
    },
  }));

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={160}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="w-full touch-none rounded-8 border border-line-normal bg-static-white"
    />
  );
});
