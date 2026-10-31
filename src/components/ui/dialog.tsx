import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Bottom-sheet modal adapté au mobile (style shadcn Drawer). */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  className,
  fullHeight,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  fullHeight?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 animate-fade-in bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative flex w-full max-w-lg animate-slide-up flex-col rounded-t-3xl border border-slate-800 bg-slate-900 shadow-2xl sm:rounded-3xl',
          fullHeight ? 'h-[94dvh]' : 'max-h-[92dvh]',
          className,
        )}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-slate-700 sm:hidden" />
        <div className="flex items-center justify-between gap-2 px-5 pb-2 pt-3">
          <h2 className="text-base font-semibold text-slate-100">{title}</h2>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-800" aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
        {footer && <div className="border-t border-slate-800 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
