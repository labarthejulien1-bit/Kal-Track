import { useCallback, useEffect, useRef } from 'react';
import { cn, haptic } from '@/lib/utils';

/**
 * Geste de balayage horizontal fluide (jour / période suivante ou précédente).
 * - le contenu suit le doigt 1:1 (résistance s'il n'y a pas de suite) ;
 * - au relâcher : sortie rapide dans le sens du geste, changement de date, puis entrée depuis l'autre côté ;
 * - un geste rapide (« flick ») suffit, même court ;
 * - uniquement des transformations GPU (translate3d / opacity) : aucun recalcul de mise en page.
 */
export function useSwipe({ onPrev, onNext, canNext = true, canPrev = true, animKey }: { onPrev: () => void; onNext: () => void; canNext?: boolean; canPrev?: boolean; animKey: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number; t: number; lock: 'h' | 'v' | null; dx: number } | null>(null);
  const pending = useRef<'next' | 'prev' | null>(null);

  // Arrivée du nouveau contenu (après le changement de date).
  useEffect(() => {
    const el = ref.current;
    const dir = pending.current;
    pending.current = null;
    if (!el || !dir) return;
    const from = (dir === 'next' ? 1 : -1) * Math.min(window.innerWidth * 0.22, 90);
    el.style.transition = 'none';
    el.style.transform = `translate3d(${from}px,0,0)`;
    el.style.opacity = '0.35';
    requestAnimationFrame(() => {
      el.style.transition = 'transform 220ms cubic-bezier(.2,.8,.2,1), opacity 220ms ease-out';
      el.style.transform = 'translate3d(0,0,0)';
      el.style.opacity = '1';
      setTimeout(() => (el.style.willChange = ''), 260);
    });
  }, [animKey]);

  const set = (x: number, opacity: number, transition = 'none') => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = transition;
    el.style.transform = `translate3d(${x}px,0,0)`;
    el.style.opacity = String(opacity);
  };

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    const edge = 20; // laisse libres les gestes « retour » d'Android sur les bords
    if (e.touches.length > 1 || t.clientX < edge || t.clientX > window.innerWidth - edge || (e.target as HTMLElement).closest('input, textarea, select, [data-no-swipe]')) {
      touch.current = null;
      return;
    }
    touch.current = { x: t.clientX, y: t.clientY, t: performance.now(), lock: null, dx: 0 };
  }, []);

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const s = touch.current;
      if (!s) return;
      const t = e.touches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (!s.lock && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        s.lock = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'h' : 'v';
        if (s.lock === 'h' && ref.current) ref.current.style.willChange = 'transform, opacity';
      }
      if (s.lock !== 'h') return;
      s.dx = dx;
      const blocked = (dx < 0 && !canNext) || (dx > 0 && !canPrev);
      const shown = blocked ? dx * 0.18 : dx; // suit le doigt, résistance s'il n'y a pas de suite
      set(shown, 1 - Math.min(Math.abs(shown) / window.innerWidth, 0.5) * 0.6);
    },
    [canNext, canPrev],
  );

  const end = useCallback(() => {
    const s = touch.current;
    touch.current = null;
    const el = ref.current;
    if (!s || s.lock !== 'h' || !el) {
      if (el && s?.lock === 'h') set(0, 1, 'transform 180ms ease-out, opacity 180ms ease-out');
      return;
    }
    const speed = Math.abs(s.dx) / Math.max(1, performance.now() - s.t); // px / ms
    const far = Math.abs(s.dx) > window.innerWidth * 0.22;
    const flick = speed > 0.35 && Math.abs(s.dx) > 30;
    const dir: 'next' | 'prev' | null = s.dx < 0 ? 'next' : 'prev';
    const allowed = dir === 'next' ? canNext : canPrev;
    if (!(far || flick) || !allowed) {
      set(0, 1, 'transform 200ms cubic-bezier(.2,.8,.2,1), opacity 200ms ease-out');
      setTimeout(() => (el.style.willChange = ''), 220);
      return;
    }
    haptic(8);
    // Sortie rapide dans le sens du geste, puis changement de période.
    const out = (dir === 'next' ? -1 : 1) * Math.min(window.innerWidth * 0.3, 120);
    set(out, 0, 'transform 110ms ease-in, opacity 110ms ease-in');
    setTimeout(() => {
      pending.current = dir;
      if (dir === 'next') onNext();
      else onPrev();
      // Sécurité : si rien n'a changé, le contenu revient en place.
      setTimeout(() => {
        if (pending.current === dir) {
          pending.current = null;
          set(0, 1, 'transform 180ms ease-out, opacity 180ms ease-out');
        }
      }, 450);
    }, 100);
  }, [canNext, canPrev, onNext, onPrev]);

  /** Pour un changement déclenché autrement (bouton, calendrier) : animation d'arrivée dans ce sens. */
  const prepare = useCallback((dir: 'next' | 'prev') => {
    pending.current = dir;
  }, []);

  return { ref, handlers: { onTouchStart, onTouchMove, onTouchEnd: end, onTouchCancel: end }, prepare };
}

/** Zone « balayable » : glisser vers la gauche = suivant, vers la droite = précédent. */
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
  const { ref, handlers } = useSwipe({ onPrev, onNext, canNext, animKey });
  return (
    <div className={cn('[touch-action:pan-y]', className)} {...handlers}>
      <div ref={ref}>{children}</div>
    </div>
  );
}
