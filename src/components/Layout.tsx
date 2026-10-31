import { BookOpen, BarChart3, Scale, Settings as SettingsIcon, ScanLine } from 'lucide-react';
import { cn, haptic } from '@/lib/utils';
import { useApp, type Tab } from './AppContext';

const ITEMS: { tab: Tab; label: string; icon: React.ElementType }[] = [
  { tab: 'journal', label: 'Journal', icon: BookOpen },
  { tab: 'analytics', label: 'Analyses', icon: BarChart3 },
  { tab: 'weight', label: 'Poids', icon: Scale },
  { tab: 'settings', label: 'Réglages', icon: SettingsIcon },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { tab, setTab, openAdd, selectedDate } = useApp();
  const left = ITEMS.slice(0, 2);
  const right = ITEMS.slice(2);

  const NavBtn = ({ item }: { item: (typeof ITEMS)[number] }) => {
    const Icon = item.icon;
    const active = tab === item.tab;
    return (
      <button
        onClick={() => {
          haptic(6);
          setTab(item.tab);
          window.scrollTo({ top: 0 });
        }}
        className={cn('flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors', active ? 'text-emerald-400' : 'text-slate-500')}
        aria-current={active ? 'page' : undefined}
      >
        <Icon className={cn('h-5 w-5 transition-transform', active && 'scale-110')} />
        {item.label}
      </button>
    );
  };

  return (
    <div className="mx-auto min-h-dvh max-w-lg">
      <main className="px-4 pb-32 pt-[max(0.75rem,env(safe-area-inset-top))]">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-40">
        <div className="mx-auto max-w-lg border-t border-slate-800 bg-slate-900/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
          <div className="relative flex items-end">
            {left.map((i) => (
              <NavBtn key={i.tab} item={i} />
            ))}
            <div className="flex flex-1 justify-center">
              <button
                onClick={() => {
                  haptic(15);
                  openAdd({ date: tab === 'journal' ? selectedDate : undefined, mode: 'choose' });
                }}
                className="-mt-7 mb-1 flex h-16 w-16 flex-col items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-slate-950 shadow-xl shadow-emerald-500/30 ring-4 ring-slate-900 transition-transform active:scale-95"
                aria-label="Scanner un repas"
              >
                <ScanLine className="h-7 w-7" />
              </button>
            </div>
            {right.map((i) => (
              <NavBtn key={i.tab} item={i} />
            ))}
          </div>
        </div>
      </nav>
    </div>
  );
}
