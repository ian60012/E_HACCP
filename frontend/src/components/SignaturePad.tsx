import { useEffect, useRef, useState } from 'react';

interface SignaturePadProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
}

function isBlankCanvas(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return true;
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] !== 0) return false;
  }
  return true;
}

export default function SignaturePad({
  value,
  onChange,
  label = '手寫簽名 Signature',
  required = false,
  disabled = false,
  error,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [hasInk, setHasInk] = useState(Boolean(value));

  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const snapshot = value;
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';

    if (snapshot) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, rect.width, rect.height);
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
      };
      img.src = snapshot;
    }
  };

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!value) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasInk(false);
      return;
    }
    resizeCanvas();
    setHasInk(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const begin = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    drawingRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    const p = point(event);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || !drawingRef.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const p = point(event);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setHasInk(true);
  };

  const finish = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (!canvas || isBlankCanvas(canvas)) {
      onChange('');
      setHasInk(false);
      return;
    }
    onChange(canvas.toDataURL('image/png'));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onChange('');
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label className="label mb-0">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        <button type="button" onClick={clear} disabled={disabled || !hasInk} className="btn btn-secondary px-3 py-1 text-xs disabled:opacity-50">
          清除 Clear
        </button>
      </div>
      <div className={`mt-2 rounded-lg border bg-white ${error ? 'border-red-300' : 'border-gray-300'} ${disabled ? 'opacity-70' : ''}`}>
        <canvas
          ref={canvasRef}
          className="block h-40 w-full touch-none rounded-lg"
          onPointerDown={begin}
          onPointerMove={draw}
          onPointerUp={finish}
          onPointerCancel={finish}
          onPointerLeave={finish}
        />
      </div>
      <p className={`mt-1 text-xs ${error ? 'text-red-500' : 'text-gray-400'}`}>
        {error || '請在框內用手指或觸控筆簽名。Sign inside the box.'}
      </p>
    </div>
  );
}

