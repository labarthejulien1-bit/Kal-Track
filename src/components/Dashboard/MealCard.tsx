import { useState } from 'react';
import { Pencil, Trash2, Star, Copy, ChevronDown, Camera, Barcode, ScanText, MessageSquareText, Keyboard } from 'lucide-react';
import { MacroPill, NutriScoreBadge, Thumbnail } from '@/components/common';
import { COLORS, cn, haptic, round, todayISO } from '@/lib/utils';
import type { Meal, MealSource } from '@/types';
import { db } from '@/db/database';
import { deleteMeal, duplicateMeal } from '@/hooks/useMeals';
import { useApp } from '@/components/AppContext';
import { useToast } from '@/components/ui/toast';

const SOURCE_ICON: Record<MealSource, React.ElementType> = {
  photo: Camera,
  barcode: Barcode,
  label: ScanText,
  text: MessageSquareText,
  manual: Keyboard,
};

export function MealCard({ meal }: { meal: Meal }) {
  const { openAdd } = useApp();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const SourceIcon = SOURCE_ICON[meal.source] ?? Keyboard;
  const time = new Date(meal.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  const remove = async () => {
    haptic(20);
    const backup = { ...meal };
    await deleteMeal(meal.id!);
    toast('Repas supprimé', 'info', { label: 'Annuler', onClick: () => db.meals.put(backup) });
  };

  const toggleFav = async () => {
    haptic();
    await db.meals.update(meal.id!, { favorite: !meal.favorite });
  };

  const copyToday = async () => {
    await duplicateMeal(meal, todayISO());
    toast("Ajouté à aujourd'hui");
  };

  return (
    <div className="rounded-xl bg-slate-900/60 p-2.5">
      <div className="flex items-center gap-3">
        <button onClick={() => setOpen((o) => !o)} className="shrink-0">
          <Thumbnail src={meal.image} mealType={meal.mealType} />
        </button>
        <div className="min-w-0 flex-1" onClick={() => setOpen((o) => !o)}>
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-medium text-slate-100">{meal.title}</p>
            {meal.favorite && <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
            <SourceIcon className="h-3 w-3" /> {time}
            <span className="font-semibold text-emerald-400">· {round(meal.calories)} kcal</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <MacroPill label="P" value={meal.protein} color={COLORS.protein} />
            <MacroPill label="G" value={meal.carbs} color={COLORS.carbs} />
            <MacroPill label="L" value={meal.fat} color={COLORS.fat} />
            <MacroPill label="Sucres" value={meal.sugar ?? 0} color={COLORS.sugar} />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700" onClick={() => openAdd({ edit: meal })} aria-label="Modifier">
            <Pencil className="h-4 w-4" />
          </button>
          <button className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400" onClick={remove} aria-label="Supprimer">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-2 animate-fade-in space-y-2 border-t border-slate-800 pt-2">
          {meal.image && <img src={meal.image} alt="" className="max-h-56 w-full rounded-lg object-cover" />}
          <div className="flex flex-wrap items-center gap-2">
            <NutriScoreBadge grade={meal.nutriScore} />
            <span className="text-[11px] text-slate-400">Fibres {round(meal.fiber ?? 0, 1)} g</span>
            {meal.confidence !== undefined && <span className="text-[11px] text-slate-400">Confiance IA {round(meal.confidence * 100)}%</span>}
          </div>
          {meal.items && meal.items.length > 0 && (
            <ul className="space-y-1">
              {meal.items.map((it, i) => (
                <li key={i} className="flex items-center justify-between rounded-lg bg-slate-800/60 px-2 py-1 text-[11px]">
                  <span className="truncate text-slate-300">
                    {it.name} <span className="text-slate-500">· {round(it.quantity_g)} g</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-slate-400">
                    {round(it.calories)} kcal · P{round(it.protein)} G{round(it.carbs)} L{round(it.fat)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {meal.confidenceNote && <p className="text-[11px] italic text-slate-500">{meal.confidenceNote}</p>}
          <div className="flex gap-2">
            <button onClick={toggleFav} className={cn('flex flex-1 items-center justify-center gap-1 rounded-lg bg-slate-800 py-1.5 text-xs', meal.favorite ? 'text-amber-400' : 'text-slate-300')}>
              <Star className={cn('h-3.5 w-3.5', meal.favorite && 'fill-amber-400')} /> {meal.favorite ? 'Favori' : 'Mettre en favori'}
            </button>
            {meal.date !== todayISO() && (
              <button onClick={copyToday} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-slate-800 py-1.5 text-xs text-slate-300">
                <Copy className="h-3.5 w-3.5" /> Copier aujourd'hui
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function MealSectionHeaderChevron({ open }: { open: boolean }) {
  return <ChevronDown className={cn('h-4 w-4 transition-transform', open ? 'rotate-180' : '')} />;
}
