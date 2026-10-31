import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Barcode, ScanText, MessageSquareText, Keyboard, History, Loader2, Sparkles, Star, Search, ArrowLeft, AlertTriangle } from 'lucide-react';
import { Sheet } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Label } from '@/components/ui/input';
import { Thumbnail } from '@/components/common';
import { MealReviewForm, type Draft } from './MealReviewForm';
import { BarcodeScanner } from './BarcodeScanner';
import { compressImage, type CompressedImage } from '@/services/imageCompressor';
import { analyzeMealPhoto, analyzeMealText, analyzeNutritionLabel } from '@/services/geminiVision';
import { fetchProductByBarcode } from '@/services/openFoodFacts';
import { saveMeal, useRecentMeals } from '@/hooks/useMeals';
import { useProfile } from '@/hooks/useProfile';
import { useToast } from '@/components/ui/toast';
import { useApp, type AddMode, type AddRequest } from '@/components/AppContext';
import { MEAL_LABELS, guessMealType, haptic, round, todayISO, fromISODate } from '@/lib/utils';
import type { MealAnalysis, MealType, MealSource } from '@/types';

type Step = AddMode | 'analyzing' | 'review' | 'photo-preview';

const DEFAULT_HOURS: Record<MealType, [number, number]> = { breakfast: [8, 0], lunch: [12, 30], dinner: [19, 30], snack: [16, 0] };

function timestampFor(date: string, type: MealType) {
  if (date === todayISO()) return Date.now();
  const d = fromISODate(date);
  const [h, m] = DEFAULT_HOURS[type];
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

const LOADING_MESSAGES = ['Identification des aliments…', 'Estimation des portions…', 'Prise en compte de la cuisson…', 'Calcul des macronutriments…', 'Vérification de la cohérence…'];

export function CameraModal({ request, onClose }: { request: AddRequest | null; onClose: () => void }) {
  const open = !!request;
  const { profile } = useProfile();
  const { setTab } = useApp();
  const toast = useToast();
  const recent = useRecentMeals(40);

  const [step, setStep] = useState<Step>('choose');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [photo, setPhoto] = useState<CompressedImage | null>(null);
  const [hint, setHint] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [loadingMsg, setLoadingMsg] = useState(0);
  const [search, setSearch] = useState('');
  const [pendingMode, setPendingMode] = useState<'photo' | 'label'>('photo');
  const [formKey, setFormKey] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const openReview = (d: Draft) => {
    setDraft(d);
    setFormKey((k) => k + 1);
    setStep('review');
  };
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  const date = request?.date ?? todayISO();
  const mealType = request?.mealType ?? guessMealType();

  useEffect(() => {
    if (!request) return;
    setError('');
    setHint('');
    setText('');
    setPhoto(null);
    setSearch('');
    if (request.edit) {
      const e = request.edit;
      openReview({ ...e, items: e.items ?? [], sugar: e.sugar ?? 0, fiber: e.fiber ?? 0 });
    } else {
      setDraft(null);
      const m = request.mode ?? 'choose';
      setStep(m);
      if (m === 'manual') startManual();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  useEffect(() => {
    if (step !== 'analyzing') return;
    const id = setInterval(() => setLoadingMsg((i) => (i + 1) % LOADING_MESSAGES.length), 1400);
    return () => clearInterval(id);
  }, [step]);

  const close = () => {
    abortRef.current?.abort();
    onClose();
  };

  const toDraft = (a: MealAnalysis, source: MealSource, image?: string): Draft => ({
    title: a.title,
    calories: a.calories,
    protein: a.protein,
    carbs: a.carbs,
    fat: a.fat,
    sugar: a.sugar,
    fiber: a.fiber,
    items: a.items ?? [],
    confidenceNote: a.confidence_note,
    confidence: a.confidence,
    barcode: a.barcode,
    nutriScore: a.nutriScore,
    per100g: a.per100g,
    servingSize_g: a.servingSize_g,
    image: image ?? a.imageUrl,
    source,
    date,
    mealType,
  });

  const startManual = () => {
    openReview({ title: '', calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, fiber: 0, items: [], source: 'manual', date, mealType });
  };

  const requireKey = () => {
    if (profile.apiKey) return true;
    setError('Clé API Gemini manquante : ajoute-la dans Réglages pour utiliser l’IA.');
    return false;
  };

  const pickPhoto = (mode: 'photo' | 'label', fromCamera: boolean) => {
    setPendingMode(mode);
    setError('');
    (fromCamera ? cameraInput : galleryInput).current?.click();
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    try {
      setStep('analyzing');
      const img = await compressImage(file);
      setPhoto(img);
      if (pendingMode === 'label') await runLabel(img);
      else setStep('photo-preview');
    } catch (e) {
      setError((e as Error).message);
      setStep(pendingMode);
    }
  };

  const runPhoto = async () => {
    if (!photo || !requireKey()) return;
    setStep('analyzing');
    setError('');
    abortRef.current = new AbortController();
    try {
      const a = await analyzeMealPhoto(photo.base64, { apiKey: profile.apiKey, model: profile.model, hint, signal: abortRef.current.signal });
      haptic(30);
      openReview(toDraft(a, 'photo', photo.dataUrl));
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError((e as Error).message);
      setStep('photo-preview');
    }
  };

  const runLabel = async (img: CompressedImage) => {
    if (!requireKey()) {
      setStep('label');
      return;
    }
    setStep('analyzing');
    abortRef.current = new AbortController();
    try {
      let a = await analyzeNutritionLabel(img.base64, { apiKey: profile.apiKey, model: profile.model, signal: abortRef.current.signal });
      // Si un code-barres a été lu et que le tableau est illisible, on complète avec Open Food Facts.
      if (a.barcode && a.per100g && a.per100g.calories === 0) {
        const off = await fetchProductByBarcode(a.barcode).catch(() => null);
        if (off) a = off;
      }
      haptic(30);
      openReview(toDraft(a, 'label', img.dataUrl));
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError((e as Error).message);
      setStep('label');
    }
  };

  const runText = async () => {
    if (!text.trim() || !requireKey()) return;
    setStep('analyzing');
    setError('');
    abortRef.current = new AbortController();
    try {
      const a = await analyzeMealText(text, { apiKey: profile.apiKey, model: profile.model, signal: abortRef.current.signal });
      openReview(toDraft(a, 'text'));
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError((e as Error).message);
      setStep('text');
    }
  };

  const onBarcode = useCallback(
    async (code: string) => {
      setStep('analyzing');
      setError('');
      try {
        const p = await fetchProductByBarcode(code);
        if (!p) {
          setError(`Produit ${code} introuvable dans Open Food Facts. Photographie l'étiquette nutritionnelle à la place.`);
          setStep('label');
          return;
        }
        openReview(toDraft(p, 'barcode'));
      } catch (e) {
        setError((e as Error).message);
        setStep('barcode');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [date, mealType],
  );

  const save = async () => {
    if (!draft) return;
    if (!draft.title.trim()) {
      toast('Donne un nom au repas', 'error');
      return;
    }
    const { per100g: _p, servingSize_g: _s, ...rest } = draft;
    const sameDay = request?.edit && request.edit.date === draft.date && request.edit.mealType === draft.mealType;
    await saveMeal({
      ...rest,
      title: draft.title.trim(),
      calories: round(draft.calories),
      timestamp: sameDay ? request!.edit!.timestamp : timestampFor(draft.date, draft.mealType),
    });
    haptic(25);
    toast(request?.edit ? 'Repas mis à jour' : `Ajouté au ${MEAL_LABELS[draft.mealType].toLowerCase()}`);
    onClose();
  };

  const back = () => {
    abortRef.current?.abort();
    setError('');
    setStep('choose');
  };

  const title = request?.edit
    ? 'Modifier le repas'
    : step === 'review'
      ? 'Vérifier & enregistrer'
      : `Ajouter · ${MEAL_LABELS[mealType]}${date !== todayISO() ? ` (${fromISODate(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })})` : ''}`;

  const filteredRecent = recent.filter((m) => m.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <Sheet
      open={open}
      onClose={close}
      title={title}
      fullHeight={step === 'review' || step === 'barcode'}
      footer={
        step === 'review' ? (
          <div className="flex gap-2">
            {!request?.edit && (
              <Button variant="secondary" onClick={back} className="flex-none">
                <ArrowLeft /> Retour
              </Button>
            )}
            <Button className="flex-1" onClick={save}>
              {request?.edit ? 'Mettre à jour' : 'Enregistrer'} · {round(draft?.calories ?? 0)} kcal
            </Button>
          </div>
        ) : undefined
      }
    >
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={galleryInput} type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            {error}
            {!profile.apiKey && (
              <button className="mt-1 block font-semibold text-rose-100 underline" onClick={() => { close(); setTab('settings'); }}>
                Ouvrir les réglages
              </button>
            )}
          </div>
        </div>
      )}

      {step === 'choose' && (
        <div className="grid grid-cols-2 gap-2 pb-2">
          <ModeButton icon={Camera} color="#10b981" title="Photo du plat" text="Analyse IA détaillée" onClick={() => setStep('photo')} big />
          <ModeButton icon={Barcode} color="#6366f1" title="Code-barres" text="Produit emballé" onClick={() => setStep('barcode')} big />
          <ModeButton icon={ScanText} color="#f59e0b" title="Étiquette" text="Tableau nutritionnel" onClick={() => setStep('label')} />
          <ModeButton icon={MessageSquareText} color="#d946ef" title="Décrire" text="Texte libre → IA" onClick={() => setStep('text')} />
          <ModeButton icon={History} color="#0ea5e9" title="Récents & favoris" text={`${recent.length} enregistrés`} onClick={() => setStep('recent')} />
          <ModeButton icon={Keyboard} color="#94a3b8" title="Saisie manuelle" text="Valeurs connues" onClick={startManual} />
        </div>
      )}

      {(step === 'photo' || step === 'label') && (
        <div className="space-y-3 pb-2">
          <BackLink onClick={back} />
          <div className="rounded-2xl border border-dashed border-slate-700 p-5 text-center">
            {step === 'photo' ? <Camera className="mx-auto h-10 w-10 text-emerald-400" /> : <ScanText className="mx-auto h-10 w-10 text-amber-400" />}
            <p className="mt-2 text-sm font-medium text-slate-200">{step === 'photo' ? 'Photographie ton assiette' : "Photographie l'emballage"}</p>
            <p className="mt-1 text-xs text-slate-500">
              {step === 'photo'
                ? 'Astuce : prends la photo du dessus, en entier, avec une fourchette visible comme repère de taille.'
                : 'Cadre le tableau nutritionnel (et si possible le nom et le code-barres). L’IA lit les valeurs pour 100 g.'}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => pickPhoto(step, true)} size="lg">
              <Camera /> Caméra
            </Button>
            <Button variant="secondary" onClick={() => pickPhoto(step, false)} size="lg">
              <ImagePlus /> Galerie
            </Button>
          </div>
        </div>
      )}

      {step === 'photo-preview' && photo && (
        <div className="space-y-3 pb-2">
          <BackLink onClick={() => setStep('photo')} />
          <img src={photo.dataUrl} alt="" className="max-h-72 w-full rounded-2xl object-cover" />
          <p className="text-center text-[11px] text-slate-500">
            {photo.width}×{photo.height} · {round(photo.sizeBytes / 1024)} Ko
          </p>
          <div>
            <Label>Précisions pour l'IA (optionnel)</Label>
            <Textarea value={hint} onChange={(e) => setHint(e.target.value)} placeholder="Ex. : cuit à l'huile d'olive, 150 g de riz, sauce à part, pain complet…" className="min-h-[70px]" />
          </div>
          <Button size="lg" className="w-full" onClick={runPhoto}>
            <Sparkles /> Analyser avec l'IA
          </Button>
        </div>
      )}

      {step === 'barcode' && (
        <div className="space-y-3 pb-2">
          <BackLink onClick={back} />
          <BarcodeScanner onDetected={onBarcode} />
          <button onClick={() => setStep('label')} className="w-full text-center text-xs text-amber-300">
            Pas de code-barres ? Photographier l'étiquette →
          </button>
        </div>
      )}

      {step === 'text' && (
        <div className="space-y-3 pb-2">
          <BackLink onClick={back} />
          <Label>Décris ce que tu as mangé</Label>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex. : 2 œufs brouillés au beurre, 1 tranche de pain complet, un café avec un sucre" className="min-h-[120px]" autoFocus />
          <div className="flex flex-wrap gap-1.5">
            {['Un bol de muesli avec lait demi-écrémé', 'Burger frites menu moyen', 'Salade César avec poulet', 'Pomme et 20 g d’amandes'].map((ex) => (
              <button key={ex} onClick={() => setText(ex)} className="rounded-full border border-slate-700 px-2.5 py-1 text-[11px] text-slate-400">
                {ex}
              </button>
            ))}
          </div>
          <Button size="lg" className="w-full" onClick={runText} disabled={!text.trim()}>
            <Sparkles /> Analyser
          </Button>
        </div>
      )}

      {step === 'recent' && (
        <div className="space-y-2 pb-2">
          <BackLink onClick={back} />
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input placeholder="Rechercher" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          {filteredRecent.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Aucun repas enregistré pour l'instant.</p>}
          {filteredRecent.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                const { id: _id, timestamp: _t, ...rest } = m;
                openReview({ ...rest, items: m.items ?? [], sugar: m.sugar ?? 0, fiber: m.fiber ?? 0, date, mealType, favorite: false });
              }}
              className="flex w-full items-center gap-3 rounded-xl bg-slate-800/60 p-2 text-left"
            >
              <Thumbnail src={m.image} mealType={m.mealType} className="h-11 w-11" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 truncate text-sm text-slate-100">
                  {m.favorite && <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />}
                  {m.title}
                </p>
                <p className="text-[11px] text-slate-500">
                  {round(m.calories)} kcal · P{round(m.protein)} G{round(m.carbs)} L{round(m.fat)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {step === 'analyzing' && (
        <div className="flex flex-col items-center gap-4 py-10">
          {photo && <img src={photo.dataUrl} alt="" className="h-40 w-40 rounded-2xl object-cover opacity-70" />}
          <div className="relative">
            <Loader2 className="h-10 w-10 animate-spin text-emerald-400" />
            <Sparkles className="absolute -right-2 -top-2 h-4 w-4 animate-pulse text-amber-300" />
          </div>
          <p className="text-sm text-slate-300">{LOADING_MESSAGES[loadingMsg]}</p>
          <Button variant="ghost" size="sm" onClick={back}>
            Annuler
          </Button>
        </div>
      )}

      {step === 'review' && draft && <MealReviewForm key={formKey} initial={draft} onChange={setDraft} />}
    </Sheet>
  );
}

function ModeButton({ icon: Icon, color, title, text, onClick, big }: { icon: React.ElementType; color: string; title: string; text: string; onClick: () => void; big?: boolean }) {
  return (
    <button onClick={onClick} className="flex flex-col items-start gap-2 rounded-2xl border border-slate-800 bg-slate-800/50 p-3 text-left transition-colors active:scale-[0.98] hover:bg-slate-800" style={big ? { borderColor: `${color}55`, background: `${color}12` } : undefined}>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `${color}22`, color }}>
        <Icon className="h-5 w-5" />
      </span>
      <span>
        <span className="block text-sm font-semibold text-slate-100">{title}</span>
        <span className="block text-[11px] text-slate-400">{text}</span>
      </span>
    </button>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-xs text-slate-400">
      <ArrowLeft className="h-3.5 w-3.5" /> Autres méthodes
    </button>
  );
}
