import { useEffect, useRef, useState } from "react";

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function computePosition(container: HTMLElement, clientX: number, clientY: number): string {
  const rect = container.getBoundingClientRect();
  const x = clampPercent(((clientX - rect.left) / rect.width) * 100);
  const y = clampPercent(((clientY - rect.top) / rect.height) * 100);
  return `${x}% ${y}%`;
}

export function ImagePositioner({
  src,
  mediaType,
  position,
  onCommit,
  heightClass = "h-40",
}: {
  src: string;
  mediaType: "image" | "video";
  position: string;
  onCommit: (position: string) => void;
  heightClass?: string;
}) {
  const [displayPosition, setDisplayPosition] = useState(position);
  const containerRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(position);
  const draggingRef = useRef(false);

  useEffect(() => {
    setDisplayPosition(position);
    posRef.current = position;
  }, [position]);

  function updateFromEvent(e: { clientX: number; clientY: number }) {
    if (!containerRef.current) return;
    const next = computePosition(containerRef.current, e.clientX, e.clientY);
    posRef.current = next;
    setDisplayPosition(next);
  }

  function handlePointerDown(e: React.PointerEvent) {
    draggingRef.current = true;
    (e.target as Element).setPointerCapture(e.pointerId);
    updateFromEvent(e);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!draggingRef.current) return;
    updateFromEvent(e);
  }

  function handlePointerUp() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    onCommit(posRef.current);
  }

  const [posX, posY] = displayPosition.split(" ");

  return (
    <div className="space-y-1">
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={`relative w-full cursor-crosshair overflow-hidden rounded-lg border border-white/10 ${heightClass}`}
      >
        {mediaType === "video" ? (
          <video
            src={src}
            style={{ objectPosition: displayPosition }}
            className="h-full w-full object-cover"
            autoPlay
            loop
            muted
            playsInline
          />
        ) : (
          <img
            src={src}
            alt=""
            style={{ objectPosition: displayPosition }}
            className="h-full w-full object-cover"
            draggable={false}
          />
        )}
        <div
          className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          style={{ left: posX, top: posY }}
        />
      </div>
      <p className="text-[11px] text-white/40">Click or drag to set the focal point.</p>
    </div>
  );
}
