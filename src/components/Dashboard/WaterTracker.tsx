import { Droplets, Minus, Plus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useWater } from '@/hooks/useWater';
import { haptic } from '@/lib/utils';

export function WaterTracker({ date, goal }: { date: string; goal: number }) {
  const { ml, add } = useWater(date);
  const glasses = Math.ceil(goal / 250);
  const filled = Math.floor(ml / 250);
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400">
            <Droplets className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-slate-100">Hydratation</div>
            <div className="text-xs text-slate-400">
              <span className="tabular-nums text-sky-300">{(ml / 1000).toFixed(2)} L</span> / {(goal / 1000).toFixed(1)} L
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="rounded-full bg-slate-700/60 p-2 text-slate-300" onClick={() => { haptic(); add(-250); }} aria-label="Retirer un verre">
            <Minus className="h-4 w-4" />
          </button>
          <button className="rounded-full bg-sky-500 p-2 text-slate-950" onClick={() => { haptic(); add(250); }} aria-label="Ajouter un verre">
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {Array.from({ length: glasses }).map((_, i) => (
          <div key={i} className="h-6 w-4 overflow-hidden rounded-b-md rounded-t-sm border border-sky-500/40">
            <div className="h-full w-full origin-bottom bg-sky-400 transition-transform" style={{ transform: `scaleY(${i < filled ? 1 : 0})` }} />
          </div>
        ))}
      </div>
    </Card>
  );
}
