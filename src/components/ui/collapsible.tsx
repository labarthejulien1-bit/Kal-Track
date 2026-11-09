import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useSectionOpen } from '@/lib/uiState';
import { haptic, cn } from '@/lib/utils';

/** Contenu qui se replie / se déplie en douceur (hauteur animée). */
export function CollapseBody({ open, children }: { open: boolean; children: React.ReactNode }) {
  const [animating, setAnimating] = useState(false);
  const first = useRef(true);
  const inner = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setAnimating(true);
  }, [open]);

  // Contenu replié : ni visible ni atteignable au clavier / lecteur d'écran.
  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    if (open) el.removeAttribute('inert');
    else el.setAttribute('inert', '');
  }, [open]);

  return (
    <div
      className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
      style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      onTransitionEnd={(e) => e.target === e.currentTarget && setAnimating(false)}
    >
      <div ref={inner} aria-hidden={!open} className={cn('min-h-0', (!open || animating) && 'overflow-hidden')}>
        {children}
      </div>
    </div>
  );
}

function Chevron({ open, className }: { open: boolean; className?: string }) {
  return <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-500 transition-transform duration-300', !open && '-rotate-90', className)} />;
}

/**
 * Section du journal : petit titre cliquable (avec résumé à droite) au-dessus d'une carte.
 * L'état ouvert / replié est mémorisé.
 */
export function Section({
  id,
  title,
  icon,
  summary,
  right,
  defaultOpen = true,
  children,
}: {
  id: string;
  title: React.ReactNode;
  icon?: React.ReactNode;
  summary?: React.ReactNode;
  right?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, toggle] = useSectionOpen(id, defaultOpen);
  return (
    <section>
      <div className="flex items-center gap-2 px-1">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            haptic(6);
            toggle();
          }}
          className="flex min-h-9 min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <Chevron open={open} />
          {icon}
          <h2 className="shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h2>
          {summary != null && <span className="ml-auto truncate pl-2 text-xs tabular-nums text-slate-400">{summary}</span>}
        </button>
        {right}
      </div>
      <CollapseBody open={open}>
        <div className="pb-1 pt-1">{children}</div>
      </CollapseBody>
    </section>
  );
}

/**
 * Carte repliable (réglages) : l'en-tête entier est cliquable, avec un résumé quand la carte est repliée.
 * `actions` : boutons placés à droite de l'en-tête (hors zone cliquable).
 */
export function CollapsibleCard({
  id,
  icon,
  title,
  summary,
  actions,
  defaultOpen = false,
  children,
}: {
  id: string;
  icon?: React.ReactNode;
  title: React.ReactNode;
  summary?: React.ReactNode;
  actions?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, toggle] = useSectionOpen(id, defaultOpen);
  return (
    <Card>
      <div className="flex items-center gap-2 pr-3">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            haptic(6);
            toggle();
          }}
          className="flex min-h-14 min-w-0 flex-1 items-center gap-2.5 py-3 pl-4 text-left"
        >
          {icon && <span className="shrink-0">{icon}</span>}
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold tracking-tight text-slate-200">{title}</span>
            {summary != null && (
              <span className={cn('block truncate text-xs text-slate-400 transition-opacity', open && 'hidden')}>{summary}</span>
            )}
          </span>
          {!actions && <Chevron open={open} />}
        </button>
        {actions && (
          <>
            {actions}
            <button type="button" onClick={toggle} aria-label="" tabIndex={-1} className="p-1">
              <Chevron open={open} />
            </button>
          </>
        )}
      </div>
      <CollapseBody open={open}>
        <div className="px-4 pb-4">{children}</div>
      </CollapseBody>
    </Card>
  );
}
