import { useMemo, useState } from 'react';
import { AlertTriangle, Check, Trash2, Sparkles, Plus } from 'lucide-react';
import { Input, Label } from '@/components/ui/input';
import { NumberField, NutriScoreBadge } from '@/components/common';
import { COLORS, MEAL_EMOJI, MEAL_LABELS, MEAL_TYPES, cn, round, todayISO } from '@/lib/utils';
import type { MealItem, MealType, MealSource, Nutrients } from '@/types';
import { scaleNutrients } from '@/services/geminiVision';

export interface Draft extends Nutrients {
  id?: number;
  title: string;
  date: string;
  mealType: MealType;
  timestamp?: number;
  image?: string;
  items: MealItem[];
  source: MealSource;
  confidenceNote?: string;
  confidence?: number;
  barcode?: string;
  nutriScore?: string;
  per100g?: Nutrients;
  servingSize_g?: number;
  favorite?: boolean;
}

const NKEYS = ['calories', 'protein', 'carbs', 'fat', 'sugar', 'fiber'] as const;

function scale(n: Nutrients, f: number): Nutrients {
  return {
    calories: round(n.calories * f),
    protein: round(n.protein * f, 1),
    carbs: round(n.carbs * f, 1),
    fat: round(n.fat * f, 1),
    sugar: round(n.sugar * f, 1),
    fiber: round(n.fiber * f, 1),
  };
}

function sumItems(items: MealItem[]): Nutrients {
  const s = items.reduce(
    (a, i) => {
      for (const k of NKEYS) a[k] += i[k] || 0;
      return a;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, fiber: 0 } as Nutrients,
  );
  return scale(s, 1);
}

export function MealReviewForm({ initial, onChange }: { initial: Draft; onChange: (d: Draft) => void }) {
  const [d, setD] = useState<Draft>(initial);
  const [base] = useState<Draft>(initial);
  const [mult, setMult] = useState(1);
  const [grams, setGrams] = useState<number>(initial.servingSize_g ?? 100);

  const update = (patch: Partial<Draft>) => {
    setD((prev) => {
      const next = { ...prev, ...patch };
      onChange(next);
      return next;
    });
  };

  const applyGrams = (g: number) => {
    setGrams(g);
    if (!d.per100g) return;
    const n = scaleNutrients(d.per100g, g);
    update({ ...n, servingSize_g: g, items: d.items.length === 1 ? [{ ...d.items[0], ...n, quantity_g: g }] : d.items });
  };

  const applyMult = (m: number) => {
    setMult(m);
    const n = scale(base, m);
    update({ ...n, items: base.items.map((it) => ({ ...it, ...scale(it, m), quantity_g: round(it.quantity_g * m) })) });
  };

  const updateItem = (idx: number, patch: Partial<MealItem>) => {
    const items = d.items.map((it, i) => {
      if (i !== idx) return it;
      if (patch.quantity_g !== undefined && it.quantity_g > 0) {
        const f = patch.quantity_g / it.quantity_g;
        return { ...it, ...scale(it, f), quantity_g: patch.quantity_g };
      }
      return { ...it, ...patch };
    });
    update({ items, ...sumItems(items) });
  };

  const removeItem = (idx: number) => {
    const items = d.items.filter((_, i) => i !== idx);
    update({ items, ...(items.length ? sumItems(items) : {}) });
  };

  const addItem = () => {
    const items = [...d.items, { name: 'Nouvel aliment', quantity_g: 100, calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, fiber: 0 }];
    update({ items });
  };

  const macroKcal = round(d.protein * 4 + d.carbs * 4 + d.fat * 9);
  const mismatch = d.calories > 0 && macroKcal > 0 && Math.abs(macroKcal - d.calories) / d.calories > 0.15;

  const split = useMemo(() => {
    const t = d.protein * 4 + d.carbs * 4 + d.fat * 9;
    if (!t) return null;
    return { p: (d.protein * 400) / t, c: (d.carbs * 400) / t, f: (d.fat * 900) / t };
  }, [d.protein, d.carbs, d.fat]);

  return (
    <div className="space-y-4">
      {d.image && (
        <div className="relative overflow-hidden rounded-2xl">
          <img src={d.image} alt="" className="max-h-56 w-full object-cover" />
          {d.confidence !== undefined && (
            <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-slate-950/80 px-2 py-1 text-[11px] text-emerald-300">
              <Sparkles className="h-3 w-3" /> Confiance {round(d.confidence * 100)}%
            </span>
          )}
        </div>
      )}

      <div>
        <Label>Nom du plat</Label>
        <Input value={d.title} onChange={(e) => update({ title: e.target.value })} />
        <div className="mt-1 flex items-center gap-2">
          <NutriScoreBadge grade={d.nutriScore} />
          {d.barcode && <span className="text-[11px] text-slate-500">EAN {d.barcode}</span>}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div>
          <Label>Repas</Label>
          <div className="grid grid-cols-4 gap-1">
            {MEAL_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => update({ mealType: t })}
                className={cn('flex flex-col items-center rounded-xl border py-1.5 text-[10px]', d.mealType === t ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300' : 'border-slate-700 text-slate-400')}
              >
                <span className="text-base">{MEAL_EMOJI[t]}</span>
                {MEAL_LABELS[t].replace('Petit-déjeuner', 'P.-déj')}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label>Date</Label>
          <input
            type="date"
            max={todayISO()}
            value={d.date}
            onChange={(e) => e.target.value && update({ date: e.target.value })}
            className="h-[52px] rounded-xl border border-slate-700 bg-slate-900/60 px-2 text-xs text-slate-100 [color-scheme:dark]"
          />
        </div>
      </div>

      {d.per100g ? (
        <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-3">
          <Label>Quantité consommée</Label>
          <div className="flex items-center gap-2">
            <NumberField label="" value={grams} onChange={applyGrams} unit="g" />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[...(d.servingSize_g && d.servingSize_g !== 100 ? [d.servingSize_g] : []), 30, 50, 100, 150, 200, 250].map((g, i) => (
              <button key={`${g}-${i}`} type="button" onClick={() => applyGrams(g)} className={cn('rounded-full border px-2.5 py-1 text-xs', grams === g ? 'border-emerald-500 text-emerald-300' : 'border-slate-700 text-slate-400')}>
                {i === 0 && d.servingSize_g && d.servingSize_g !== 100 ? `1 portion (${g} g)` : `${g} g`}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Pour 100 g : {d.per100g.calories} kcal · P {d.per100g.protein} · G {d.per100g.carbs} (sucres {d.per100g.sugar}) · L {d.per100g.fat}
          </p>
        </div>
      ) : (
        base.calories > 0 && (
          <div>
            <Label>Ajuster la portion</Label>
            <div className="flex gap-1.5">
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((m) => (
                <button key={m} type="button" onClick={() => applyMult(m)} className={cn('flex-1 rounded-lg border py-1.5 text-xs', mult === m ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 text-slate-400')}>
                  ×{m}
                </button>
              ))}
            </div>
          </div>
        )
      )}

      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Calories" value={d.calories} onChange={(v) => update({ calories: v })} unit="kcal" color={COLORS.kcal} />
        <NumberField label="Protéines" value={d.protein} onChange={(v) => update({ protein: v })} unit="g" color={COLORS.protein} step={0.1} />
        <NumberField label="Glucides" value={d.carbs} onChange={(v) => update({ carbs: v })} unit="g" color={COLORS.carbs} step={0.1} />
        <NumberField label="dont Sucres" value={d.sugar} onChange={(v) => update({ sugar: v })} unit="g" color={COLORS.sugar} step={0.1} />
        <NumberField label="Lipides" value={d.fat} onChange={(v) => update({ fat: v })} unit="g" color={COLORS.fat} step={0.1} />
        <NumberField label="Fibres" value={d.fiber} onChange={(v) => update({ fiber: v })} unit="g" color={COLORS.fiber} step={0.1} />
      </div>

      {split && (
        <div>
          <div className="flex h-2 overflow-hidden rounded-full">
            <div style={{ width: `${split.p}%`, background: COLORS.protein }} />
            <div style={{ width: `${split.c}%`, background: COLORS.carbs }} />
            <div style={{ width: `${split.f}%`, background: COLORS.fat }} />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-slate-400">
            <span style={{ color: COLORS.protein }}>P {round(split.p)}%</span>
            <span style={{ color: COLORS.carbs }}>G {round(split.c)}%</span>
            <span style={{ color: COLORS.fat }}>L {round(split.f)}%</span>
          </div>
        </div>
      )}

      {mismatch && (
        <button type="button" onClick={() => update({ calories: macroKcal })} className="flex w-full items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-2 text-left text-xs text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Les macros correspondent à ≈ {macroKcal} kcal. Toucher pour utiliser cette valeur.
        </button>
      )}

      {(d.items.length > 0 || d.source !== 'barcode') && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label className="mb-0">Détail des aliments ({d.items.length})</Label>
            <button type="button" onClick={addItem} className="flex items-center gap-1 text-xs text-emerald-400">
              <Plus className="h-3.5 w-3.5" /> Ajouter
            </button>
          </div>
          <div className="space-y-1.5">
            {d.items.map((it, i) => (
              <div key={i} className="rounded-xl bg-slate-800/60 p-2">
                <div className="flex items-center gap-2">
                  <input value={it.name} onChange={(e) => updateItem(i, { name: e.target.value })} className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 focus:outline-none" />
                  <div className="relative w-20">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={it.quantity_g}
                      onChange={(e) => updateItem(i, { quantity_g: parseFloat(e.target.value) || 0 })}
                      className="h-8 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 pr-6 text-right text-xs text-slate-100"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">g</span>
                  </div>
                  <button type="button" onClick={() => removeItem(i)} className="p-1 text-slate-500 hover:text-rose-400" aria-label="Retirer">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-1 grid grid-cols-5 gap-1 text-[10px]">
                  {(['calories', 'protein', 'carbs', 'fat', 'sugar'] as const).map((k) => (
                    <label key={k} className="flex flex-col">
                      <span className="text-slate-500">{{ calories: 'kcal', protein: 'P', carbs: 'G', fat: 'L', sugar: 'Sucres' }[k]}</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={it[k]}
                        onChange={(e) => updateItem(i, { [k]: parseFloat(e.target.value) || 0 })}
                        className="h-7 w-full rounded-md border border-slate-700 bg-slate-900 px-1 text-slate-200"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {d.confidenceNote && (
        <p className="flex gap-1.5 rounded-xl bg-indigo-500/10 p-2 text-xs text-indigo-200">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {d.confidenceNote}
        </p>
      )}
    </div>
  );
}
