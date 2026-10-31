import { useState } from 'react';
import { Sheet } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SegmentedTabs } from '@/components/ui/tabs';
import { Select, Label } from '@/components/ui/input';
import { NumberField } from '@/components/common';
import { ACTIVITY_FACTORS, DEFAULT_PROFILE, GOAL_LABELS, computeGoals } from '@/services/bmrCalculator';
import { db } from '@/db/database';
import { upsertWeight } from '@/hooks/useWeights';
import { todayISO } from '@/lib/utils';
import type { ActivityLevel, Goal, Profile, Sex } from '@/types';

/** Assistant de première ouverture : profil minimal pour calculer les objectifs. */
export function Onboarding({ open, onDone }: { open: boolean; onDone: () => void }) {
  const [p, setP] = useState<Profile>({ ...DEFAULT_PROFILE });
  const goals = computeGoals(p);
  const set = (patch: Partial<Profile>) => setP((x) => ({ ...x, ...patch }));

  const finish = async () => {
    await db.userProfile.put({ ...p, createdAt: Date.now(), updatedAt: Date.now() });
    await upsertWeight(todayISO(), p.weight);
    onDone();
  };

  return (
    <Sheet
      open={open}
      onClose={finish}
      title="Bienvenue sur Kal-Track 👋"
      footer={
        <Button className="w-full" size="lg" onClick={finish}>
          C'est parti · {goals.calories} kcal/jour
        </Button>
      }
    >
      <div className="space-y-3 pb-2">
        <div className="flex items-center gap-3">
          <img src="./logo.svg" alt="" className="h-14 w-14 rounded-2xl" />
          <p className="text-xs text-slate-400">Quelques infos pour calculer précisément tes besoins. Tout reste stocké sur ton téléphone.</p>
        </div>
        <SegmentedTabs<Sex> value={p.sex} onChange={(v) => set({ sex: v })} options={[{ value: 'male', label: 'Homme' }, { value: 'female', label: 'Femme' }]} />
        <div className="grid grid-cols-3 gap-2">
          <NumberField label="Âge" value={p.age} onChange={(v) => set({ age: v })} unit="ans" />
          <NumberField label="Taille" value={p.height} onChange={(v) => set({ height: v })} unit="cm" />
          <NumberField label="Poids" value={p.weight} onChange={(v) => set({ weight: v })} unit="kg" step={0.1} />
        </div>
        <NumberField label="Poids cible" value={p.targetWeight} onChange={(v) => set({ targetWeight: v })} unit="kg" step={0.1} />
        <div>
          <Label>Activité quotidienne</Label>
          <Select value={p.activityLevel} onChange={(e) => set({ activityLevel: e.target.value as ActivityLevel })}>
            {Object.entries(ACTIVITY_FACTORS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label} — {v.hint}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Séances sport / sem." value={p.workoutsPerWeek} onChange={(v) => set({ workoutsPerWeek: v })} />
          <NumberField label="Durée moyenne" value={p.workoutMinutes} onChange={(v) => set({ workoutMinutes: v })} unit="min" />
        </div>
        <div>
          <Label>Objectif</Label>
          <SegmentedTabs<Goal> value={p.goal} onChange={(v) => set({ goal: v })} options={(['lose', 'maintain', 'gain'] as Goal[]).map((g) => ({ value: g, label: GOAL_LABELS[g].replace(' de poids', '') }))} />
        </div>
        <div className="rounded-xl bg-slate-800/60 p-3 text-xs text-slate-300">
          Métabolisme de base <b>{goals.bmr} kcal</b> · Dépense totale <b>{goals.tdee} kcal</b>
          <br />
          Objectif : <b className="text-emerald-400">{goals.calories} kcal</b> · P {goals.protein} g · G {goals.carbs} g · L {goals.fat} g
        </div>
      </div>
    </Sheet>
  );
}
