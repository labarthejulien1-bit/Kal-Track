import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Loader2, CheckCircle2, XCircle, User, Calculator, SlidersHorizontal, Database, Download, Upload, ShieldCheck, Trash2, Info, HelpCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { SegmentedTabs } from '@/components/ui/tabs';
import { NumberField } from '@/components/common';
import { Sheet } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { ensureProfile, useProfile } from '@/hooks/useProfile';
import { checkAccessCode, normalizeCode } from '@/services/geminiVision';
import { ACTIVITY_FACTORS, GOAL_LABELS, MACRO_PRESETS, PACE_DELTAS, computeGoals, macroSplitFor } from '@/services/bmrCalculator';
import { db, exportBackup, getStorageInfo, importBackup, requestPersistentStorage } from '@/db/database';
import { COLORS, MEAL_LABELS, MEAL_TYPES, downloadFile, round, todayISO } from '@/lib/utils';
import type { ActivityLevel, BackupFile, Goal, GoalPace, MacroPreset, Profile, Sex } from '@/types';

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
    const t = setTimeout(flush, 400);
    return () => clearTimeout(t);
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
    toast('Profil enregistré');
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
    toast("Code retiré : tu utilises l'IA incluse.", 'info');
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
      toast(`Code ${r.name} activé.`);
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
    downloadFile(`kal-track-sauvegarde-${todayISO()}.json`, JSON.stringify(data));
    toast(`Sauvegarde exportée (${data.meals.length} repas, ${data.weightLogs.length} pesées)`);
  };

  const doImport = async (file?: File) => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as BackupFile;
      if (!confirm(`Importer ${data.meals?.length ?? 0} repas et ${data.weightLogs?.length ?? 0} pesées ?\nLes données actuelles seront remplacées.`)) return;
      dirty.current = false;
      await importBackup(data, { includeApiKey: !!(data.profile?.apiKey || data.profile?.accessCode) });
      setDraft(await ensureProfile());
      toast('Sauvegarde importée avec succès');
      refreshStorage();
    } catch (e) {
      toast((e as Error).message || 'Import impossible', 'error');
    }
  };

  const resetAll = async () => {
    if (!confirm('Supprimer définitivement TOUTES les données (repas, pesées, profil) ?')) return;
    if (!confirm('Dernière confirmation : cette action est irréversible. Continuer ?')) return;
    dirty.current = false;
    await Promise.all([db.meals.clear(), db.weightLogs.clear(), db.waterLogs.clear(), db.userProfile.clear()]);
    setDraft(null);
    toast('Toutes les données ont été supprimées', 'info');
  };

  const split = macroSplitFor(profile);
  const splitSum = split.protein + split.carbs + split.fat;
  const mealSum = MEAL_TYPES.reduce((s, t) => s + (profile.mealSplit[t] || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between pt-1">
        <h1 className="text-lg font-bold text-slate-50">Réglages</h1>
        <span className="flex items-center gap-1 text-xs text-slate-400">
          {saveState === 'saving' && (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Enregistrement…
            </>
          )}
          {saveState === 'saved' && (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Enregistré
            </>
          )}
        </span>
      </div>

      {/* ---------- IA ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-400" /> Analyse IA des repas
          </CardTitle>
          <button
            onClick={() => setShowHelp(true)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-400/40 active:scale-95"
            aria-label="À propos de l'analyse IA"
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
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Vérification de l'IA…
            </p>
          )}
          {showCode && (
            <div>
              <Label>Code d'accès (facultatif)</Label>
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
                  Retirer mon code
                </button>
              )}
            </div>
          )}
          <p className="text-[11px] text-slate-500">Tes repas restent sur ton téléphone. Seules les photos et descriptions à analyser sont envoyées à l'IA, de façon sécurisée.</p>
        </CardContent>
      </Card>

      <Sheet open={showHelp} onClose={() => setShowHelp(false)} title="L'analyse IA">
        <div className="space-y-3 pb-4 text-sm text-slate-300">
          <p>
            L'analyse de tes repas par l'IA (photo, étiquette, description) est <b>incluse</b> dans Kal-Track, sans clé ni inscription.
          </p>
          <p>Tu disposes d'un nombre d'analyses par jour sur ce téléphone, remis à zéro chaque nuit à minuit.</p>
          <p className="text-slate-400">Une fois tes analyses du jour utilisées, tu peux continuer avec le code-barres, la saisie manuelle et tes favoris, puis l'IA revient le lendemain.</p>
        </div>
      </Sheet>

      {/* ---------- Profil ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-4 w-4 text-emerald-400" /> Profil
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Prénom</Label>
            <Input value={profile.name} onChange={(e) => updateProfile({ name: e.target.value })} placeholder="Optionnel" autoComplete="given-name" autoCapitalize="words" className="text-base" />
          </div>
          <div>
            <Label>Sexe</Label>
            <SegmentedTabs<Sex>
              value={profile.sex}
              onChange={(v) => updateProfile({ sex: v })}
              options={[
                { value: 'male', label: 'Homme' },
                { value: 'female', label: 'Femme' },
              ]}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <NumberField label="Âge" value={profile.age} onChange={(v) => updateProfile({ age: v })} unit="ans" />
            <NumberField label="Taille" value={profile.height} onChange={(v) => updateProfile({ height: v })} unit="cm" />
            <NumberField label="Poids" value={profile.weight} onChange={(v) => updateProfile({ weight: v })} unit="kg" step={0.1} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Poids cible" value={profile.targetWeight} onChange={(v) => updateProfile({ targetWeight: v })} unit="kg" step={0.1} />
            <NumberField label="Masse grasse (optionnel)" value={profile.bodyFat ?? 0} onChange={(v) => updateProfile({ bodyFat: v || undefined })} unit="%" allowEmpty placeholder="—" />
          </div>
          <div>
            <Label>Activité quotidienne (hors sport)</Label>
            <Select value={profile.activityLevel} onChange={(e) => updateProfile({ activityLevel: e.target.value as ActivityLevel })}>
              {Object.entries(ACTIVITY_FACTORS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label} (×{v.factor}) — {v.hint}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Séances de sport / semaine" value={profile.workoutsPerWeek} onChange={(v) => updateProfile({ workoutsPerWeek: v })} unit="×" />
            <NumberField label="Durée moyenne" value={profile.workoutMinutes} onChange={(v) => updateProfile({ workoutMinutes: v })} unit="min" step={5} />
          </div>
          <div>
            <Label>Objectif</Label>
            <SegmentedTabs<Goal> value={profile.goal} onChange={(v) => updateProfile({ goal: v })} options={(['lose', 'maintain', 'gain'] as Goal[]).map((g) => ({ value: g, label: GOAL_LABELS[g].replace(' de poids', '') }))} />
          </div>
          {profile.goal !== 'maintain' && (
            <div>
              <Label>Rythme</Label>
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
                      <div>{d > 0 ? '+' : ''}{d} kcal/j</div>
                      <div className="text-[10px] opacity-70">≈ {d > 0 ? '+' : ''}{round((d * 7) / 7700, 2)} kg/sem</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div>
            <Label>Répartition des macronutriments</Label>
            <Select value={profile.macroPreset} onChange={(e) => updateProfile({ macroPreset: e.target.value as MacroPreset })}>
              {Object.entries(MACRO_PRESETS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
              <option value="custom">Personnalisée</option>
            </Select>
            {profile.macroPreset === 'custom' && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                <NumberField label="Protéines" value={profile.macroSplit.protein} onChange={(v) => updateProfile({ macroSplit: { ...profile.macroSplit, protein: v } })} unit="%" color={COLORS.protein} />
                <NumberField label="Glucides" value={profile.macroSplit.carbs} onChange={(v) => updateProfile({ macroSplit: { ...profile.macroSplit, carbs: v } })} unit="%" color={COLORS.carbs} />
                <NumberField label="Lipides" value={profile.macroSplit.fat} onChange={(v) => updateProfile({ macroSplit: { ...profile.macroSplit, fat: v } })} unit="%" color={COLORS.fat} />
              </div>
            )}
            {splitSum !== 100 && <p className="mt-1 text-[11px] text-amber-400">Le total fait {splitSum}% (devrait faire 100 %).</p>}
          </div>
          <div>
            <Label>Répartition des calories par repas</Label>
            <div className="grid grid-cols-4 gap-2">
              {MEAL_TYPES.map((t) => (
                <NumberField key={t} label={MEAL_LABELS[t].replace('Petit-déjeuner', 'P.-déj')} value={profile.mealSplit[t]} onChange={(v) => updateProfile({ mealSplit: { ...profile.mealSplit, [t]: v } })} unit="%" />
              ))}
            </div>
            {mealSum !== 100 && <p className="mt-1 text-[11px] text-amber-400">Le total fait {mealSum}% (devrait faire 100 %).</p>}
          </div>
          <NumberField label="Objectif d'hydratation (0 = automatique)" value={profile.waterGoalMl ?? 0} onChange={(v) => updateProfile({ waterGoalMl: v || undefined })} unit="ml" allowEmpty placeholder="Auto" />
          <Button className="w-full" onClick={saveNow}>
            <CheckCircle2 /> Enregistrer le profil
          </Button>
        </CardContent>
      </Card>

      {/* ---------- Calcul ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-amber-400" /> Calcul de tes besoins
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <Row label={`Métabolisme de base (${goals.bmrMethod})`} value={`${goals.bmr} kcal`} />
          <Row label="Dépense totale (TDEE, activité + sport)" value={`${goals.tdee} kcal`} />
          <div className="grid grid-cols-3 gap-2 py-1 text-center">
            <Zone label="Perte" value={goals.loseTarget} color={COLORS.lose} active={profile.goal === 'lose'} />
            <Zone label="Maintien" value={goals.maintenance} color={COLORS.maintain} active={profile.goal === 'maintain'} />
            <Zone label="Prise" value={goals.gainTarget} color={COLORS.gain} active={profile.goal === 'gain'} />
          </div>
          <Row label="Objectif quotidien" value={<b className="text-emerald-400">{goals.calories} kcal</b>} />
          <Row label="Protéines / Glucides / Lipides" value={`${goals.protein} g · ${goals.carbs} g · ${goals.fat} g`} />
          <Row label="Protéines par kg de poids" value={`${round(goals.protein / Math.max(1, profile.weight), 1)} g/kg`} />
          <Row label="Limite de sucres (OMS < 10 %)" value={`${goals.sugar} g`} />
          <Row label="Fibres recommandées" value={`${goals.fiber} g`} />
          <Row label="Variation attendue" value={`${goals.weeklyChangeKg > 0 ? '+' : ''}${goals.weeklyChangeKg} kg / semaine`} />
          {goals.weeksToTarget !== null && <Row label="Temps estimé jusqu'au poids cible" value={`≈ ${Math.ceil(goals.weeksToTarget)} semaines`} />}
          <Row label="IMC" value={goals.bmi} />
          {goals.clamped && (
            <p className="flex gap-1.5 rounded-lg bg-amber-500/10 p-2 text-amber-300">
              <Info className="h-4 w-4 shrink-0" /> Objectif relevé au minimum de sécurité ({goals.minSafe} kcal). Un déficit plus important est déconseillé.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ---------- Surcharge ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-rose-400" /> Surcharge manuelle
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
              <NumberField label="Calories" value={profile.overrides.calories} onChange={(v) => updateProfile({ overrides: { ...profile.overrides, calories: v } })} unit="kcal" color={COLORS.kcal} />
              <NumberField label="Protéines" value={profile.overrides.protein} onChange={(v) => updateProfile({ overrides: { ...profile.overrides, protein: v } })} unit="g" color={COLORS.protein} />
              <NumberField label="Glucides" value={profile.overrides.carbs} onChange={(v) => updateProfile({ overrides: { ...profile.overrides, carbs: v } })} unit="g" color={COLORS.carbs} />
              <NumberField label="Lipides" value={profile.overrides.fat} onChange={(v) => updateProfile({ overrides: { ...profile.overrides, fat: v } })} unit="g" color={COLORS.fat} />
              <NumberField label="Sucres (limite)" value={profile.overrides.sugar} onChange={(v) => updateProfile({ overrides: { ...profile.overrides, sugar: v } })} unit="g" color={COLORS.sugar} />
              <div className="flex items-end text-[11px] text-slate-500">
                Macros = {round(profile.overrides.protein * 4 + profile.overrides.carbs * 4 + profile.overrides.fat * 9)} kcal
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Active pour fixer toi-même tes objectifs de calories et de macros en grammes (ex. plan d'un diététicien).</p>
          )}
        </CardContent>
      </Card>

      {/* ---------- Données ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-4 w-4 text-sky-400" /> Données & sauvegarde
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-xl bg-slate-900/60 p-3 text-xs">
            <div className="flex items-center gap-2">
              <ShieldCheck className={`h-5 w-5 ${storage?.persisted ? 'text-emerald-400' : 'text-amber-400'}`} />
              <div>
                <p className="font-semibold text-slate-200">{storage?.persisted ? 'Stockage persistant activé' : 'Stockage non persistant'}</p>
                <p className="text-slate-500">
                  {storage ? `${(storage.usage / 1024 / 1024).toFixed(1)} Mo utilisés` : '…'}
                  {storage?.persisted ? ' · protégé contre le nettoyage automatique' : ' · installe l’appli sur l’écran d’accueil'}
                </p>
              </div>
            </div>
            {!storage?.persisted && (
              <Button size="sm" variant="secondary" onClick={async () => { const ok = await requestPersistentStorage(); toast(ok ? 'Stockage persistant accordé' : 'Refusé par le navigateur', ok ? 'success' : 'error'); refreshStorage(); }}>
                Activer
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={doExport}>
              <Download /> Exporter (JSON)
            </Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              <Upload /> Importer (JSON)
            </Button>
          </div>
          <label className="flex items-center justify-between text-xs text-slate-400">
            Inclure le code d'accès IA dans l'export
            <Switch checked={includeKey} onCheckedChange={setIncludeKey} />
          </label>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { doImport(e.target.files?.[0]); e.target.value = ''; }} />
          <Button variant="ghost" className="w-full text-rose-400" onClick={resetAll}>
            <Trash2 /> Effacer toutes les données
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
        <p>100 % local · aucune donnée envoyée hors de l'appareil, sauf les analyses IA vers Google Gemini et les recherches de code-barres vers Open Food Facts.</p>
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
    <div className="rounded-lg border p-1.5" style={{ borderColor: active ? color : '#334155', background: active ? `${color}18` : undefined }}>
      <div className="text-[10px]" style={{ color }}>{label}</div>
      <div className="font-semibold tabular-nums text-slate-200">{value}</div>
    </div>
  );
}
