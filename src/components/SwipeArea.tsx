import { useCallback, useEffect, useRef } from 'react';
import { cn, haptic } from '@/lib/utils';

/**
 * Glissement classique entre les jours / périodes (comme un carrousel de pages) :
 * - pendant le geste, la page suit le doigt (résistance s'il n'y a pas de page suivante) ;
 * - au relâcher, elle sort entièrement de l'écran et la nouvelle arrive entièrement de l'autre côté ;
 * - un geste rapide (« flick ») suffit ; uniquement des translations GPU.
 */
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function useSwipe({ onPrev, onNext, canNext = true, canPrev = true, animKey }: { onPrev: () => void; onNext: () => void; canNext?: boolean; canPrev?: boolean; animKey: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number; t: number; lock: 'h' | 'v' | null; dx: number } | null>(null);
  const pending = useRef<'next' | 'prev' | null>(null);

  const move = (x: number, transition = 'none') => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = transition;
    el.style.transform = x ? `translate3d(${x}px,0,0)` : '';
  };

  // Arrivée de la nouvelle page depuis le bord opposé.
  useEffect(() => {
    const el = ref.current;
    const dir = pending.current;
    pending.current = null;
    if (!el || !dir) return;
    if (reducedMotion()) return move(0);
    el.style.willChange = 'transform';
    move((dir === 'next' ? 1 : -1) * window.innerWidth);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        move(0, 'transform 240ms cubic-bezier(.22,.8,.3,1)');
        setTimeout(() => {
          el.style.willChange = '';
          el.style.transition = '';
        }, 260);
      }),
    );
  }, [animKey]);

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
        if (s.lock === 'h' && ref.current) ref.current.style.willChange = 'transform';
      }
      if (s.lock !== 'h') return;
      s.dx = dx;
      const blocked = (dx < 0 && !canNext) || (dx > 0 && !canPrev);
      move(blocked ? dx * 0.15 : dx);
    },
    [canNext, canPrev],
  );

  const end = useCallback(() => {
    const s = touch.current;
    touch.current = null;
    const el = ref.current;
    if (!s || s.lock !== 'h' || !el) return;
    const speed = Math.abs(s.dx) / Math.max(1, performance.now() - s.t); // px / ms
    const far = Math.abs(s.dx) > window.innerWidth * 0.25;
    const flick = speed > 0.35 && Math.abs(s.dx) > 30;
    const dir: 'next' | 'prev' = s.dx < 0 ? 'next' : 'prev';
    const allowed = dir === 'next' ? canNext : canPrev;
    if (!(far || flick) || !allowed) {
      move(0, 'transform 220ms cubic-bezier(.22,.8,.3,1)');
      setTimeout(() => (el.style.willChange = ''), 240);
      return;
    }
    haptic(8);
    if (reducedMotion()) {
      move(0);
      pending.current = dir;
      return dir === 'next' ? onNext() : onPrev();
    }
    // La page sort entièrement de l'écran, puis la suivante arrive de l'autre côté.
    const w = window.innerWidth;
    const remaining = Math.max(0, w - Math.abs(s.dx));
    const duration = Math.round(Math.min(200, Math.max(110, (remaining / w) * 220)));
    move((dir === 'next' ? -1 : 1) * w, `transform ${duration}ms cubic-bezier(.4,0,.8,.6)`);
    setTimeout(() => {
      pending.current = dir;
      if (dir === 'next') onNext();
      else onPrev();
      // Sécurité : si rien n'a changé, la page revient en place.
      setTimeout(() => {
        if (pending.current === dir) {
          pending.current = null;
          move(0, 'transform 200ms ease-out');
        }
      }, 450);
    }, duration);
  }, [canNext, canPrev, onNext, onPrev]);

  /** Pour un changement déclenché autrement (bouton, calendrier) : la nouvelle page glisse aussi. */
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
