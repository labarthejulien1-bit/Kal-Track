import { useEffect, useRef } from 'react';
import { cn, haptic, slideIn } from '@/lib/utils';

/**
 * Zone « balayable » : glisser vers la gauche = suivant, vers la droite = précédent.
 * Le contenu suit le doigt puis glisse à l'arrivée de la nouvelle période.
 */
export function SwipeArea({
  onPrev,
  onNext,
  canNext = true,
  animKey,
  children,
  className,
}: {
  onPrev: () => void;
  onNext: () => void;
  canNext?: boolean;
  animKey: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number; lock: 'h' | 'v' | null; dx: number } | null>(null);
  const dirRef = useRef<'next' | 'prev' | null>(null);
  useEffect(() => {
    if (dirRef.current) slideIn(ref.current, dirRef.current);
    dirRef.current = null;
  }, [animKey]);

  const reset = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = 'transform .2s ease-out, opacity .2s ease-out';
    el.style.transform = '';
    el.style.opacity = '';
  };

  return (
    <div
      className={cn('[touch-action:pan-y]', className)}
      onTouchStart={(e) => {
        const t = e.touches[0];
        const edge = 24;
        if (e.touches.length > 1 || t.clientX < edge || t.clientX > window.innerWidth - edge || (e.target as HTMLElement).closest('input, textarea, select, [data-no-swipe]')) {
          touch.current = null;
          return;
        }
        touch.current = { x: t.clientX, y: t.clientY, lock: null, dx: 0 };
      }}
      onTouchMove={(e) => {
        const s = touch.current;
        if (!s) return;
        const t = e.touches[0];
        const dx = t.clientX - s.x;
        const dy = t.clientY - s.y;
        if (!s.lock && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) s.lock = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'h' : 'v';
        if (s.lock !== 'h') return;
        s.dx = dx;
        const shown = dx * (dx < 0 && !canNext ? 0.12 : 0.4);
        const el = ref.current;
        if (el) {
          el.style.transition = 'none';
          el.style.transform = `translateX(${shown}px)`;
          el.style.opacity = String(1 - Math.min(Math.abs(shown) / 400, 0.3));
        }
      }}
      onTouchEnd={() => {
        const s = touch.current;
        touch.current = null;
        reset();
        if (!s || s.lock !== 'h') return;
        if (s.dx < -60 && canNext) {
          haptic(8);
          dirRef.current = 'next';
          onNext();
        } else if (s.dx > 60) {
          haptic(8);
          dirRef.current = 'prev';
          onPrev();
        }
      }}
      onTouchCancel={() => {
        touch.current = null;
        reset();
      }}
    >
      <div ref={ref}>
        {children}
      </div>
    </div>
  );
}
