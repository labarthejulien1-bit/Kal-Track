import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

type Kind = 'success' | 'error' | 'info';
interface Toast { id: number; text: string; kind: Kind; action?: { label: string; onClick: () => void } }

const Ctx = createContext<(text: string, kind?: Kind, action?: Toast['action']) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Kind = 'success', action?: Toast['action']) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 5000 : 2800);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => {
          const Icon = t.kind === 'success' ? CheckCircle2 : t.kind === 'error' ? AlertTriangle : Info;
          return (
            <div
              key={t.id}
              className={cn(
                'pointer-events-auto flex w-full max-w-md animate-pop items-center gap-2 rounded-xl border px-3 py-2.5 text-sm shadow-xl backdrop-blur',
                t.kind === 'success' && 'border-emerald-500/40 bg-emerald-950/90 text-emerald-100',
                t.kind === 'error' && 'border-rose-500/40 bg-rose-950/90 text-rose-100',
                t.kind === 'info' && 'border-slate-600 bg-slate-800/95 text-slate-100',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{t.text}</span>
              {t.action && (
                <button
                  className="font-semibold text-emerald-300"
                  onClick={() => {
                    t.action!.onClick();
                    setToasts((x) => x.filter((y) => y.id !== t.id));
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
