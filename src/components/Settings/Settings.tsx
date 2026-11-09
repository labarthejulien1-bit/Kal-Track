import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Languages, Moon, Palette, Ruler, Sun, SunMoon, Sparkles, Loader2, CheckCircle2, XCircle, User, Calculator, SlidersHorizontal, Database, Download, Upload, ShieldCheck, Trash2, Info, HelpCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { SegmentedTabs } from '@/components/ui/tabs';
import { HeightField, NumberField, WeightField } from '@/components/common';
import { getUnits, waterIn, waterOut, waterUnitLabel, wOut, wUnit, type Units } from '@/lib/units';
import { Sheet } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { ensureProfile, useProfile } from '@/hooks/useProfile';
import { checkAccessCode, normalizeCode } from '@/services/geminiVision';
import { ACTIVITY_FACTORS, MACRO_PRESETS, PACE_DELTAS, computeGoals, macroSplitFor } from '@/services/bmrCalculator';
import { db, exportBackup, getStorageInfo, importBackup, requestPersistentStorage } from '@/db/database';
import { saveFile } from '@/lib/native';
import { COLORS, MEAL_SHORT, MEAL_TYPES, round, todayISO } from '@/lib/utils';
import type { ActivityLevel, BackupFile, Goal, GoalPace, MacroPreset, Profile, Sex } from '@/types';
import { LANGS, detectLang, t, type LangSetting } from '@/i18n';
import { applyTheme, type ThemeSetting } from '@/lib/theme';

export function Settings() {
  const { profile: stored, loading } = useProfile();
  const [draft, setDraft] = useState<Profile | null>(null);

  // Copie locale du profil : la saisie est instantanée (pas d'aller-retour IndexedDB à chaque touche),
  // puis enregistrée automatiquement après une courte pause.
  useEffect(() => {
    if (!loading && !draft) setDraft(stored);
  }, [loading, stored, draft]);

  if (!draft) {
    return (
      <div className="flex justify-center py-20 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  return <SettingsForm draft={draft} setDraft={setDraft} />;
}

function SettingsForm({ draft, setDraft }: { draft: Profile; setDraft: React.Dispatch<React.SetStateAction<Profile | null>> }) {
  const profile = draft;
  const goals = useMemo(() => computeGoals(draft), [draft]);
  const toast = useToast();
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const dirty = useRef(false);
  const latest = useRef(draft);
  latest.current = draft;

  const flush = useCallback(async () => {
    if (!dirty.current) return;
    dirty.current = false;
    await db.userProfile.put({ ...latest.current, id: 1, updatedAt: Date.now() });
    setSaveState('saved');
  }, []);

  const updateProfile = useCallback(
    async (patch: Partial<Profile>) => {
      dirty.current = true;
      setSaveState('saving');
      // Mise à jour immédiate de la copie à enregistrer (évite d'écrire une version sans la modification).
      latest.current = { ...latest.current, ...patch };
      setDraft((d) => (d ? { ...d, ...patch } : d));
    },
    [setDraft],
  );

  // Enregistrement automatique 400 ms après la dernière modification.
  useEffect(() => {
    if (!dirty.current) return;
    const timer = setTimeout(flush, 400);
    return () => clearTimeout(timer);
  }, [draft, flush]);

  // Sauvegarde immédiate si l'appli passe en arrière-plan ou si on change d'onglet.
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);

  const saveNow = async () => {
    (document.activeElement as HTMLElement | null)?.blur();
    dirty.current = true;
    await flush();
    toast(t('Profil enregistré'));
  };

  // --- IA (serveur Kal-Track : clé et modèle gérés côté serveur) ---
  const [code, setCode] = useState(profile.accessCode ?? '');
  const [checking, setChecking] = useState(false);
  const [access, setAccess] = useState<{ ok: boolean; message: string; name?: string } | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const devTaps = useRef(0);

  // Statut de l'IA (accès inclus ou code personnel) et analyses restantes.
  useEffect(() => {
    checkAccessCode(profile.accessCode ?? '').then(setAccess);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeCode = async () => {
    setCode('');
    await updateProfile({ accessCode: '' });
    dirty.current = true;
    await flush();
    await db.userProfile.update(1, { accessCode: '' });
    setShowCode(false);
    setAccess(await checkAccessCode(''));
    toast(t("Code retiré : tu utilises l'IA incluse."), 'info');
  };

  const verify = async () => {
    const v = normalizeCode(code);
    if (!v) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    setChecking(true);
    setAccess(null);
    const r = await checkAccessCode(v);
    setAccess(r);
    if (r.ok) {
      setCode(v);
      await updateProfile({ accessCode: v });
      dirty.current = true;
      await flush();
      await db.userProfile.update(1, { accessCode: v });
      toast(t('Code {name} activé.', { name: r.name ?? '' }));
      setShowCode(false);
    }
    setChecking(false);
  };

  // --- Stockage ---
  const [storage, setStorage] = useState<{ persisted: boolean; usage: number; quota: number } | null>(null);
  const refreshStorage = () => getStorageInfo().then(setStorage).catch(() => {});
  useEffect(() => {
    refreshStorage();
  }, []);

  const [includeKey, setIncludeKey] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const doExport = async () => {
    const data = await exportBackup();
    if (!includeKey && data.profile) data.profile = { ...data.profile, apiKey: '', accessCode: '' };
    try {
      await saveFile(`kal-track-sauvegarde-${todayISO()}.json`, JSON.stringify(data), 'application/json', t('Sauvegarde Kal-Track'));
    } catch {
      toast(t('Export impossible'), 'error');
      return;
    }
    toast(t('Sauvegarde exportée ({a} repas, {b} pesées)', { a: data.meals.length, b: data.weightLogs.length }));
  };

  const doImport = async (file?: File) => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as BackupFile;
      if (!confirm(t('Importer {a} repas et {b} pesées ?\nLes données actuelles seront remplacées.', { a: data.meals?.length ?? 0, b: data.weightLogs?.length ?? 0 }))) return;
      dirty.current = false;
      await importBackup(data, { includeApiKey: !!(data.profile?.apiKey || data.profile?.accessCode) });
      setDraft(await ensureProfile());
      toast(t('Sauvegarde importée avec succès'));
      refreshStorage();
    } catch (e) {
      toast(t((e as Error).message || 'Import impossible'), 'error');
    }
  };

  const resetAll = async () => {
    if (!confirm(t('Supprimer définitivement TOUTES les données (repas, pesées, profil) ?'))) return;
    if (!confirm(t('Dernière confirmation : cette action est irréversible. Continuer ?'))) return;
    dirty.current = false;
    await Promise.all([db.meals.clear(), db.weightLogs.clear(), db.waterLogs.clear(), db.userProfile.clear()]);
    setDraft(null);
    toast(t('Toutes les données ont été supprimées'), 'info');
  };

  const split = macroSplitFor(profile);
  const splitSum = split.protein + split.carbs + split.fat;
  const mealSum = MEAL_TYPES.reduce((acc, mt) => acc + (profile.mealSplit[mt] || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between pt-1">
        <h1 className="text-lg font-bold text-slate-50">{t('Réglages')}</h1>
        <span className="flex items-center gap-1 text-xs text-slate-400">
          {saveState === 'saving' && (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('Enregistrement…')}
            </>
          )}
          {saveState === 'saved' && (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> {t('Enregistré')}
            </>
          )}
        </span>
      </div>

      {/* ---------- IA ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-400" /> {t('Analyse IA des repas')}
          </CardTitle>
          <button
            onClick={() => setShowHelp(true)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-400/40 active:scale-95"
            aria-label={t("À propos de l'analyse IA")}
          >
            <HelpCircle className="h-5 w-5" />
          </button>
        </CardHeader>
        <CardContent className="space-y-3">
          {access ? (
            <p className={`flex items-start gap-2 rounded-xl p-2 text-xs ${access.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'}`}>
              {access.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
              <span>
                
                {access.message}
              </span>
            </p>
          ) : (
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("Vérification de l'IA…")}
            </p>
          )}
          {showCode && (
            <div>
              <Label>{t("Code d'accès (facultatif)")}</Label>
              <div className="flex gap-2">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && verify()}
                  placeholder="KAL-XXXX-XXXX"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono text-base uppercase tracking-wider"
                />
                <Button onClick={verify} disabled={checking || !code.trim()} className="shrink-0">
                  {checking ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Valider
                </Button>
              </div>
              {profile.accessCode && (
                <button onClick={removeCode} className="mt-1.5 text-[11px] text-slate-400 underline">
                  {t('Retirer mon code')}
                </button>
              )}
            </div>
          )}
          <p className="text-[11px] text-slate-500">{t("Tes repas restent sur ton téléphone. Seules les photos et descriptions à analyser sont envoyées à l'IA, de façon sécurisée.")}</p>
        </CardContent>
      </Card>

      <Sheet open={showHelp} onClose={() => setShowHelp(false)} title={t("L'analyse IA")}>
        <div className="space-y-3 pb-4 text-sm text-slate-300">
          <p>
            {t("L'analyse de tes repas par l'IA (photo, étiquette, description) est incluse dans Kal-Track, sans clé ni inscription.")}
          </p>
          <p>{t("Tu disposes d'un nombre d'analyses par jour sur ce téléphone, remis à zéro chaque nuit à minuit.")}</p>
          <p className="text-slate-400">{t("Une fois tes analyses du jour utilisées, tu peux continuer avec le code-barres, la saisie manuelle et tes favoris, puis l'IA revient le lendemain.")}</p>
        </div>
      </Sheet>

      {/* ---------- Apparence ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-fuchsia-400" /> {t('Apparence')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SegmentedTabs<ThemeSetting>
            value={profile.theme ?? 'light'}
            onChange={async (theme) => {
              applyTheme(theme);
              await updateProfile({ theme });
              dirty.current = true;
              await flush();
              await db.userProfile.update(1, { theme });
            }}
            options={[
              { value: 'light', label: <span className="flex items-center justify-center gap-1.5"><Sun className="h-4 w-4" /> {t('Clair')}</span> },
              { value: 'dark', label: <span className="flex items-center justify-center gap-1.5"><Moon className="h-4 w-4" /> {t('Sombre')}</span> },
              { value: 'auto', label: <span className="flex items-center justify-center gap-1.5"><SunMoon className="h-4 w-4" /> {t('Auto')}</span> },
            ]}
          />
        </CardContent>
      </Card>

      {/* ---------- Langue ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Languages className="h-4 w-4 text-sky-400" /> {t('Langue')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select
            value={profile.language ?? 'auto'}
            onChange={async (e) => {
              const language = e.target.value as LangSetting;
              await updateProfile({ language });
              dirty.current = true;
              await flush();
              await db.userProfile.update(1, { language });
            }}
          >
            <option value="auto">
              {t('Automatique (langue du téléphone)')} · {LANGS.find((l) => l.code === detectLang())?.label}
            </option>
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.flag} {l.label}
              </option>
            ))}
          </Select>
        </CardContent>
      </Card>

      {/* ---------- Unités ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ruler className="h-4 w-4 text-amber-400" /> {t('Unités')}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-2">
          {(
            [
              ['weight', t('Poids'), [['kg', 'kg'], ['lb', 'lb']]],
              ['height', t('Taille'), [['cm', 'cm'], ['ftin', 'ft / in']]],
              ['water', t('Eau'), [['ml', 'ml / L'], ['floz', 'fl oz']]],
            ] as [keyof Units, string, [string, string][]][]
          ).map(([key, label, opts]) => (
            <div key={key}>
              <Label>{label}</Label>
              <Select
                value={getUnits()[key]}
                onChange={async (e) => {
                  const units = { ...getUnits(), [key]: e.target.value } as Units;
                  await updateProfile({ units });
                  dirty.current = true;
                  await flush();
                  await db.userProfile.update(1, { units });
                }}
              >
                {opts.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ---------- Profil ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-4 w-4 text-emerald-400" /> {t('Profil')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>{t('Prénom')}</Label>
            <Input value={profile.name} onChange={(e) => updateProfile({ name: e.target.value })} placeholder={t('Optionnel')} autoComplete="given-name" autoCapitalize="words" className="text-base" />
          </div>
          <div>
            <Label>{t('Sexe')}</Label>
            <SegmentedTabs<Sex>
              value={profile.sex}
              onChange={(v) => updateProfile({ sex: v })}
              options={[
                { value: 'male', label: t('Homme') },
                { value: 'female', label: t('Femme') },
              ]}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <NumberField label={t('Âge')} value={profile.age} onChange={(v) => updateProfile({ age: v })} unit={t('ans')} />
            <HeightField label={t('Taille')} cm={profile.height} onChange={(v) => updateProfile({ height: v })} />
            <WeightField label={t('Poids')} kg={profile.weight} onChange={(v) => updateProfile({ weight: v })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <WeightField label={t('Poids cible')} kg={profile.targetWeight} onChange={(v) => updateProfile({ targetWeight: v })} />
            <NumberField label={t('Masse grasse (optionnel)')} value={profile.bodyFat ?? 0} onChange={(v) => updateProfile({ bodyFat: v || undefined })} unit="%" allowEmpty placeholder="—" />
          </div>
          <div>
            <Label>{t('Activité quotidienne (hors sport)')}</Label>
            <Select value={profile.activityLevel} onChange={(e) => updateProfile({ activityLevel: e.target.value as ActivityLevel })}>
              {Object.entries(ACTIVITY_FACTORS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label} (×{v.factor}) — {v.hint}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label={t('Séances de sport / semaine')} value={profile.workoutsPerWeek} onChange={(v) => updateProfile({ workoutsPerWeek: v })} unit="×" />
            <NumberField label={t('Durée moyenne')} value={profile.workoutMinutes} onChange={(v) => updateProfile({ workoutMinutes: v })} unit="min" step={5} />
          </div>
          <div>
            <Label>{t('Objectif')}</Label>
            <SegmentedTabs<Goal> value={profile.goal} onChange={(v) => updateProfile({ goal: v })} options={(['lose', 'maintain', 'gain'] as Goal[]).map((g) => ({ value: g, label: { lose: t('Perte'), maintain: t('Maintien'), gain: t('Prise') }[g] }))} />
          </div>
          {profile.goal !== 'maintain' && (
            <div>
              <Label>{t('Rythme')}</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {(Object.keys(PACE_DELTAS) as GoalPace[]).map((p) => {
                  const d = PACE_DELTAS[p][profile.goal === 'lose' ? 'lose' : 'gain'];
                  const active = profile.pace === p;
                  return (
                    <button
                      key={p}
                      onClick={() => updateProfile({ pace: p })}
                      className={`rounded-xl border p-2 text-center text-xs ${active ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 text-slate-400'}`}
                    >
                      <div className="font-semibold">{PACE_DELTAS[p].label}</div>
                      <div>{d > 0 ? '+' : ''}{d} {t('kcal/j')}</div>
                      <div className="text-[10px] opacity-70">≈ {d > 0 ? '+' : ''}{wOut((d * 7) / 7700, 2)} {t('{u}/sem', { u: wUnit() })}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div>
            <Label>{t('Répartition des macronutriments')}</Label>
            <Select value={profile.macroPreset} onChange={(e) => updateProfile({ macroPreset: e.target.value as MacroPreset })}>
              {Object.entries(MACRO_PRESETS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
              <option value="custom">{t('Personnalisée')}</option>
            </Select>
            {profile.macroPreset === 'custom' && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                <NumberField label={t('Protéines')} value={profile.macroSplit.protein} onChange={(v) => updateProfile({ macroSplit: { ...profile.macroSplit, protein: v } })} unit="%" color={COLORS.protein} />
                <NumberField label={t('Glucides')} value={profile.macroSplit.carbs} onChange={(v) => updateProfile({ macroSplit: { ...profile.macroSplit, carbs: v } })} unit="%" color={COLORS.carbs} />
                <NumberField label={t('Lipides')} value={profile.macroSplit.fat} onChange={(v) => updateProfile({ macroSplit: { ...profile.macroSplit, fat: v } })} unit="%" color={COLORS.fat} />
              </div>
            )}
            {splitSum !== 100 && <p className="mt-1 text-[11px] text-amber-400">{t('Le total fait {n}% (devrait faire 100 %).', { n: splitSum })}</p>}
          </div>
          <div>
            <Label>{t('Répartition des calories par repas')}</Label>
            <div className="grid grid-cols-4 gap-2">
              {MEAL_TYPES.map((mt) => (
                <NumberField key={mt} label={MEAL_SHORT[mt]} value={profile.mealSplit[mt]} onChange={(v) => updateProfile({ mealSplit: { ...profile.mealSplit, [mt]: v } })} unit="%" />
              ))}
            </div>
            {mealSum !== 100 && <p className="mt-1 text-[11px] text-amber-400">{t('Le total fait {n}% (devrait faire 100 %).', { n: mealSum })}</p>}
          </div>
          <NumberField label={t("Objectif d'hydratation (0 = automatique)")} value={waterOut(profile.waterGoalMl ?? 0)} onChange={(v) => updateProfile({ waterGoalMl: v ? Math.round(waterIn(v)) : undefined })} unit={waterUnitLabel()} allowEmpty placeholder={t('Auto')} />
          <Button className="w-full" onClick={saveNow}>
            <CheckCircle2 /> {t('Enregistrer le profil')}
          </Button>
        </CardContent>
      </Card>

      {/* ---------- Calcul ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-amber-400" /> {t('Calcul de tes besoins')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <Row label={`${t('Métabolisme de base')} (${goals.bmrMethod})`} value={`${goals.bmr} kcal`} />
          <Row label={t('Dépense totale (TDEE, activité + sport)')} value={`${goals.tdee} kcal`} />
          <div className="grid grid-cols-3 gap-2 py-1 text-center">
            <Zone label={t('Perte')} value={goals.loseTarget} color={COLORS.lose} active={profile.goal === 'lose'} />
            <Zone label={t('Maintien')} value={goals.maintenance} color={COLORS.maintain} active={profile.goal === 'maintain'} />
            <Zone label={t('Prise')} value={goals.gainTarget} color={COLORS.gain} active={profile.goal === 'gain'} />
          </div>
          <Row label={t('Objectif quotidien')} value={<b className="text-emerald-400">{goals.calories} kcal</b>} />
          <Row label={t('Protéines / Glucides / Lipides')} value={`${goals.protein} g · ${goals.carbs} g · ${goals.fat} g`} />
          <Row label={t('Protéines par {u} de poids', { u: wUnit() })} value={`${round(goals.protein / Math.max(1, wOut(profile.weight)), 1)} g/${wUnit()}`} />
          <Row label={t('Limite de sucres (OMS < 10 %)')} value={`${goals.sugar} g`} />
          <Row label={t('Fibres recommandées')} value={`${goals.fiber} g`} />
          <Row label={t('Variation attendue')} value={`${goals.weeklyChangeKg > 0 ? '+' : ''}${wOut(goals.weeklyChangeKg, 2)} ${t('{u} / semaine', { u: wUnit() })}`} />
          {goals.weeksToTarget !== null && <Row label={t("Temps estimé jusqu'au poids cible")} value={t('≈ {n} semaines', { n: Math.ceil(goals.weeksToTarget) })} />}
          <Row label={t('IMC')} value={goals.bmi} />
          {goals.clamped && (
            <p className="flex gap-1.5 rounded-lg bg-amber-500/10 p-2 text-amber-300">
              <Info className="h-4 w-4 shrink-0" /> {t('Objectif relevé au minimum de sécurité ({n} kcal). Un déficit plus important est déconseillé.', { n: goals.minSafe })}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ---------- Surcharge ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-rose-400" /> {t('Surcharge manuelle')}
          </CardTitle>
          <Switch
            checked={profile.manualOverride}
            onCheckedChange={(v) =>
              updateProfile({
                manualOverride: v,
                ...(v && !profile.manualOverride ? { overrides: { calories: goals.calories, protein: goals.protein, carbs: goals.carbs, fat: goals.fat, sugar: goals.sugar } } : {}),
              })
            }
          />
        </CardHeader>
        <CardContent>
          {profile.manualOverride ? (
            <div className="grid grid-cols-2 gap-2">
              <NumberField label={t('Calories')} value={profile.overrides.calories} onChange={(v) => updateProfile({ overrides: { ...profile.overrides, calories: v } })} unit="kcal" color={COLORS.kcal} />
              <NumberField label={t('Protéines')} value={profile.overrides.protein} onChange={(v) => updateProfile({ overrides: { ...profile.overrides, protein: v } })} unit="g" color={COLORS.protein} />
              <NumberField label={t('Glucides')} value={profile.overrides.carbs} onChange={(v) => updateProfile({ overrides: { ...profile.overrides, carbs: v } })} unit="g" color={COLORS.carbs} />
              <NumberField label={t('Lipides')} value={profile.overrides.fat} onChange={(v) => updateProfile({ overrides: { ...profile.overrides, fat: v } })} unit="g" color={COLORS.fat} />
              <NumberField label={t('Sucres (limite)')} value={profile.overrides.sugar} onChange={(v) => updateProfile({ overrides: { ...profile.overrides, sugar: v } })} unit="g" color={COLORS.sugar} />
              <div className="flex items-end text-[11px] text-slate-500">
                {t('Macros')} = {round(profile.overrides.protein * 4 + profile.overrides.carbs * 4 + profile.overrides.fat * 9)} kcal
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">{t("Active pour fixer toi-même tes objectifs de calories et de macros en grammes (ex. plan d'un diététicien).")}</p>
          )}
        </CardContent>
      </Card>

      {/* ---------- Données ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-4 w-4 text-sky-400" /> {t('Données & sauvegarde')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-xl bg-slate-900/60 p-3 text-xs">
            <div className="flex items-center gap-2">
              <ShieldCheck className={`h-5 w-5 ${storage?.persisted ? 'text-emerald-400' : 'text-amber-400'}`} />
              <div>
                <p className="font-semibold text-slate-200">{storage?.persisted ? t('Stockage persistant activé') : t('Stockage non persistant')}</p>
                <p className="text-slate-500">
                  {storage ? t('{n} Mo utilisés', { n: (storage.usage / 1024 / 1024).toFixed(1) }) : '…'}
                  {storage?.persisted ? ` · ${t('protégé contre le nettoyage automatique')}` : ` · ${t('installe l’appli sur l’écran d’accueil')}`}
                </p>
              </div>
            </div>
            {!storage?.persisted && (
              <Button size="sm" variant="secondary" onClick={async () => { const ok = await requestPersistentStorage(); toast(ok ? t('Stockage persistant accordé') : t('Refusé par le navigateur'), ok ? 'success' : 'error'); refreshStorage(); }}>
                {t('Activer')}
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={doExport}>
              <Download /> {t('Exporter (JSON)')}
            </Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              <Upload /> {t('Importer (JSON)')}
            </Button>
          </div>
          <label className="flex items-center justify-between text-xs text-slate-400">
            {t("Inclure le code d'accès IA dans l'export")}
            <Switch checked={includeKey} onCheckedChange={setIncludeKey} />
          </label>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { doImport(e.target.files?.[0]); e.target.value = ''; }} />
          <Button variant="ghost" className="w-full text-rose-400" onClick={resetAll}>
            <Trash2 /> {t('Effacer toutes les données')}
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-col items-center gap-1 py-4 text-center text-[11px] text-slate-500">
        <img src="./logo.svg" alt="" className="h-12 w-12 rounded-2xl" />
        <p
          className="select-none font-semibold text-slate-400"
          onClick={() => {
            devTaps.current += 1;
            if (devTaps.current >= 7) {
              setShowCode(true);
              devTaps.current = 0;
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }}
        >
          Kal-Track v1.0
        </p>
        <p>{t("100 % local · aucune donnée envoyée hors de l'appareil, sauf les analyses IA vers Google Gemini et les recherches de code-barres vers Open Food Facts.")}</p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5 last:border-0">
      <span className="text-slate-400">{label}</span>
      <span className="text-right font-medium tabular-nums text-slate-200">{value}</span>
    </div>
  );
}

function Zone({ label, value, color, active }: { label: string; value: number; color: string; active: boolean }) {
  return (
    <div className="rounded-lg border p-1.5" style={{ borderColor: active ? color : 'var(--c-line)', background: active ? `${color}18` : undefined }}>
      <div className="text-[10px]" style={{ color }}>{label}</div>
      <div className="font-semibold tabular-nums text-slate-200">{value}</div>
    </div>
  );
}
