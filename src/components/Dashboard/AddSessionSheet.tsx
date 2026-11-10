import { useEffect, useState } from 'react';
import { Sheet } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/input';
import { SegmentedTabs } from '@/components/ui/tabs';
import { NumberField } from '@/components/common';
import { useToast } from '@/components/ui/toast';
import { db } from '@/db/database';
import { useProfile } from '@/hooks/useProfile';
import { SPORTS, SPORT_TYPES, estimateKcal } from '@/lib/sport';
import { fromISODate, haptic, cn, todayISO } from '@/lib/utils';
import type { SportIntensity, SportType } from '@/types';
import { t } from '@/i18n';

const DURATIONS = [15, 30, 45, 60, 90];

/** Ajout rapide d'une séance : type, durée, intensité → calories estimées (modifiables). */
export function AddSessionSheet({ open, onClose, date }: { open: boolean; onClose: () => void; date: string }) {
  const { profile } = useProfile();
  const toast = useToast();
  const [type, setType] = useState<SportType>('walk');
  const [minutes, setMinutes] = useState(30);
  const [intensity, setIntensity] = useState<SportIntensity>('moderate');
  const [kcal, setKcal] = useState(0); // 0 = estimation automatique

  useEffect(() => {
    if (open) setKcal(0);
  }, [open]);

  const estimate = estimateKcal(type, minutes, profile.weight, intensity);
  const finalKcal = kcal > 0 ? kcal : estimate;

  const save = async () => {
    if (minutes <= 0) return toast(t('Durée invalide'), 'error');
    const now = new Date();
    const start = date === todayISO() ? now.getTime() - minutes * 60_000 : fromISODate(date).getTime();
    await db.activities.add({ date, startTime: start, type, minutes: Math.round(minutes), kcal: Math.round(finalKcal), intensity, source: 'manual' });
    haptic(20);
    toast(t('Séance ajoutée : {n} kcal', { n: Math.round(finalKcal) }));
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('Ajouter une séance')}
      footer={
        <Button className="w-full" onClick={save}>
          {t('Enregistrer')} · {Math.round(finalKcal)} kcal
        </Button>
      }
    >
      <div className="space-y-4 pb-2">
        <div>
          <Label>{t('Sport')}</Label>
          <div className="grid grid-cols-5 gap-1.5">
            {SPORT_TYPES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setType(s)}
                className={cn(
                  'flex flex-col items-center gap-0.5 rounded-xl border p-1.5 text-center transition-colors',
                  type === s ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-800 bg-slate-800/40',
                )}
              >
                <span className="text-xl leading-none">{SPORTS[s].emoji}</span>
                <span className={cn('line-clamp-2 text-[10px] leading-tight', type === s ? 'text-emerald-300' : 'text-slate-400')}>{SPORTS[s].label()}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label>{t('Durée')}</Label>
          <div className="mb-2 flex gap-1.5">
            {DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setMinutes(d)}
                className={cn('flex-1 rounded-lg border py-1.5 text-xs font-semibold', minutes === d ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 text-slate-400')}
              >
                {d}
              </button>
            ))}
          </div>
          <NumberField label="" value={minutes} onChange={setMinutes} unit="min" />
        </div>

        <div>
          <Label>{t('Intensité')}</Label>
          <SegmentedTabs<SportIntensity>
            value={intensity}
            onChange={setIntensity}
            options={[
              { value: 'light', label: t('Légère') },
              { value: 'moderate', label: t('Modérée') },
              { value: 'intense', label: t('Intense') },
            ]}
          />
        </div>

        <div>
          <NumberField
            label={t('Calories brûlées (optionnel, ex. valeur de ta montre)')}
            value={kcal}
            onChange={setKcal}
            unit="kcal"
            allowEmpty
            placeholder={t('≈ {n} estimées', { n: estimate })}
          />
          <p className="mt-1 text-[11px] text-slate-500">{t('Estimation selon ton poids, la durée et l’intensité. Laisse vide pour l’utiliser.')}</p>
        </div>
      </div>
    </Sheet>
  );
}
