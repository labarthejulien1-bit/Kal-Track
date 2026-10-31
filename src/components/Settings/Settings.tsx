import { useEffect, useRef, useState } from 'react';
import { KeyRound, Eye, EyeOff, Wifi, Loader2, CheckCircle2, XCircle, User, Calculator, SlidersHorizontal, Database, Download, Upload, ShieldCheck, Trash2, ExternalLink, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { SegmentedTabs } from '@/components/ui/tabs';
import { NumberField } from '@/components/common';
import { useToast } from '@/components/ui/toast';
import { useProfile } from '@/hooks/useProfile';
import { GEMINI_MODELS, testGeminiConnection } from '@/services/geminiVision';
import { ACTIVITY_FACTORS, GOAL_LABELS, MACRO_PRESETS, PACE_DELTAS, macroSplitFor } from '@/services/bmrCalculator';
import { db, exportBackup, getStorageInfo, importBackup, requestPersistentStorage } from '@/db/database';
import { COLORS, MEAL_LABELS, MEAL_TYPES, downloadFile, round, todayISO } from '@/lib/utils';
import type { ActivityLevel, BackupFile, Goal, GoalPace, MacroPreset, Sex } from '@/types';

export function Settings() {
  const { profile, goals, updateProfile } = useProfile();
  const toast = useToast();

  // --- IA ---
  const [key, setKey] = useState(profile.apiKey);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const isPreset = GEMINI_MODELS.some((m) => m.id === profile.model);
  const [customModel, setCustomModel] = useState(isPreset ? '' : profile.model);
  useEffect(() => setKey(profile.apiKey), [profile.apiKey]);

  const saveKey = async () => {
    await updateProfile({ apiKey: key.trim() });
    toast('Clé API enregistrée localement');
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    if (key.trim() !== profile.apiKey) await updateProfile({ apiKey: key.trim() });
    setTestResult(await testGeminiConnection(key.trim(), profile.model));
    setTesting(false);
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
    if (!includeKey && data.profile) data.profile = { ...data.profile, apiKey: '' };
    downloadFile(`kal-track-sauvegarde-${todayISO()}.json`, JSON.stringify(data));
    toast(`Sauvegarde exportée (${data.meals.length} repas, ${data.weightLogs.length} pesées)`);
  };

  const doImport = async (file?: File) => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as BackupFile;
      if (!confirm(`Importer ${data.meals?.length ?? 0} repas et ${data.weightLogs?.length ?? 0} pesées ?\nLes données actuelles seront remplacées.`)) return;
      await importBackup(data, { includeApiKey: !!data.profile?.apiKey });
      toast('Sauvegarde importée avec succès');
      refreshStorage();
    } catch (e) {
      toast((e as Error).message || 'Import impossible', 'error');
    }
  };

  const resetAll = async () => {
    if (!confirm('Supprimer définitivement TOUTES les données (repas, pesées, profil) ?')) return;
    if (!confirm('Dernière confirmation : cette action est irréversible. Continuer ?')) return;
    await Promise.all([db.meals.clear(), db.weightLogs.clear(), db.waterLogs.clear(), db.userProfile.clear()]);
    toast('Toutes les données ont été supprimées', 'info');
  };

  const split = macroSplitFor(profile);
  const splitSum = split.protein + split.carbs + split.fat;
  const mealSum = MEAL_TYPES.reduce((s, t) => s + (profile.mealSplit[t] || 0), 0);

  return (
    <div className="space-y-3">
      <h1 className="pt-1 text-lg font-bold text-slate-50">Réglages</h1>

      {/* ---------- IA ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-indigo-400" /> Intelligence artificielle (Gemini)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Clé API Google Gemini</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input type={showKey ? 'text' : 'password'} value={key} onChange={(e) => setKey(e.target.value)} onBlur={saveKey} placeholder="AIza…" autoComplete="off" spellCheck={false} className="pr-10" />
                <button className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400" onClick={() => setShowKey((s) => !s)} aria-label="Afficher la clé">
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11px] text-indigo-300">
              Obtenir une clé gratuite sur Google AI Studio <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div>
            <Label>Modèle IA</Label>
            <Select
              value={isPreset ? profile.model : '__custom'}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '__custom') updateProfile({ model: customModel || 'gemini-flash-latest' });
                else updateProfile({ model: v });
                setTestResult(null);
              }}
            >
              {GEMINI_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id} — {m.hint}
                </option>
              ))}
              <option value="__custom">Autre modèle (saisie manuelle)…</option>
            </Select>
            {!isPreset && (
              <Input
                className="mt-2"
                value={customModel || profile.model}
                onChange={(e) => setCustomModel(e.target.value)}
                onBlur={() => customModel.trim() && updateProfile({ model: customModel.trim() })}
                placeholder="ex. gemini-flash-latest"
              />
            )}
          </div>
          <Button variant="indigo" className="w-full" onClick={test} disabled={testing || !key.trim()}>
            {testing ? <Loader2 className="animate-spin" /> : <Wifi />} Tester la connexion
          </Button>
          {testResult && (
            <p className={`flex items-start gap-2 rounded-xl p-2 text-xs ${testResult.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'}`}>
              {testResult.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
              {testResult.message}
            </p>
          )}
          <p className="text-[11px] text-slate-500">La clé est stockée uniquement sur cet appareil (IndexedDB). Les photos sont envoyées directement à Google, sans serveur intermédiaire.</p>
        </CardContent>
      </Card>

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
            <Input value={profile.name} onChange={(e) => updateProfile({ name: e.target.value })} placeholder="Optionnel" />
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
            <NumberField label="Masse grasse (optionnel)" value={profile.bodyFat ?? 0} onChange={(v) => updateProfile({ bodyFat: v || undefined })} unit="%" step={0.5} />
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
          <NumberField label="Objectif d'hydratation (0 = automatique)" value={profile.waterGoalMl ?? 0} onChange={(v) => updateProfile({ waterGoalMl: v || undefined })} unit="ml" step={250} />
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
            Inclure la clé API dans l'export
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
        <p className="font-semibold text-slate-400">Kal-Track v1.0</p>
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
