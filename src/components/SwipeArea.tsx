import { useCallback, useEffect, useRef } from 'react';
import { cn, haptic } from '@/lib/utils';

/**
 * Geste « page de livre » pour passer au jour / à la période suivante ou précédente.
 * - pendant le geste, la page pivote sur son bord (comme une feuille qu'on tourne) et s'assombrit ;
 * - au relâcher, elle finit de tourner, puis la nouvelle page se découvre en dessous ;
 * - un geste rapide (« flick ») suffit ; résistance s'il n'y a pas de page suivante ;
 * - uniquement des transformations GPU (rotateY / opacity) : fluide, aucun recalcul de mise en page.
 */
const MAX_ANGLE = 100; // degrés atteints quand le doigt parcourt toute la largeur
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function useSwipe({ onPrev, onNext, canNext = true, canPrev = true, animKey }: { onPrev: () => void; onNext: () => void; canNext?: boolean; canPrev?: boolean; animKey: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number; t: number; lock: 'h' | 'v' | null; dx: number } | null>(null);
  const pending = useRef<'next' | 'prev' | null>(null);

  /** Prépare la perspective (centrée sur la partie visible de la page) et la charnière. */
  const setup = (dir: 'next' | 'prev') => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const midY = window.innerHeight / 2 - el.getBoundingClientRect().top;
    parent.style.perspective = '1400px';
    parent.style.perspectiveOrigin = `50% ${midY}px`;
    // « suivant » : la page tourne autour de son bord gauche (comme une page de livre) ; « précédent » : bord droit.
    el.style.transformOrigin = `${dir === 'next' ? 'left' : 'right'} ${midY}px`;
    el.style.willChange = 'transform';
    el.dataset.turn = dir;
    el.classList.add('page-turn');
  };

  const apply = (angle: number, shade: number, transition = 'none') => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = transition;
    el.style.transform = angle ? `rotateY(${angle}deg)` : '';
    el.style.setProperty('--shade', String(shade));
  };

  const cleanup = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = '';
    el.style.transform = '';
    el.style.willChange = '';
    el.style.removeProperty('--shade');
    el.classList.remove('page-turn');
    if (el.parentElement) el.parentElement.style.perspective = '';
  };

  // Nouvelle page : elle se découvre « sous » la page tournée (ombre qui s'efface + léger rapprochement).
  useEffect(() => {
    const el = ref.current;
    const dir = pending.current;
    pending.current = null;
    if (!el || !dir) return;
    if (reducedMotion()) return cleanup();
    el.classList.add('page-turn');
    el.dataset.turn = dir;
    el.style.transition = 'none';
    el.style.transform = 'scale(0.985)';
    el.style.setProperty('--shade', '0.45');
    requestAnimationFrame(() => {
      el.style.transition = 'transform 260ms cubic-bezier(.2,.8,.2,1)';
      el.style.transform = 'scale(1)';
      el.style.setProperty('--shade', '0');
      setTimeout(cleanup, 300);
    });
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
      if (!s.lock && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) s.lock = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'h' : 'v';
      if (s.lock !== 'h') return;
      const dir = dx < 0 ? 'next' : 'prev';
      if (ref.current?.dataset.turn !== dir || !ref.current.classList.contains('page-turn')) setup(dir);
      s.dx = dx;
      const blocked = (dx < 0 && !canNext) || (dx > 0 && !canPrev);
      let p = Math.max(-1, Math.min(1, dx / window.innerWidth));
      if (blocked) p *= 0.12;
      apply(p * MAX_ANGLE, Math.abs(p) * 0.55);
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
      // La page retombe à plat.
      apply(0.0001, 0, 'transform 240ms cubic-bezier(.2,.8,.2,1)');
      el.style.setProperty('--shade', '0');
      setTimeout(cleanup, 260);
      return;
    }
    haptic(10);
    if (reducedMotion()) {
      pending.current = dir;
      return dir === 'next' ? onNext() : onPrev();
    }
    // La page finit de tourner, puis on passe à la suivante.
    apply((dir === 'next' ? -1 : 1) * 92, 0.6, 'transform 170ms cubic-bezier(.4,0,1,1)');
    setTimeout(() => {
      pending.current = dir;
      if (dir === 'next') onNext();
      else onPrev();
      // Sécurité : si rien n'a changé, la page revient en place.
      setTimeout(() => {
        if (pending.current === dir) {
          pending.current = null;
          cleanup();
        }
      }, 450);
    }, 160);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canNext, canPrev, onNext, onPrev]);

  /** Pour un changement déclenché autrement (bouton, calendrier) : la nouvelle page se découvre aussi. */
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
