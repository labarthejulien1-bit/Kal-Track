import type { MealAnalysis, MealItem, Nutrients } from '@/types';
import { round } from '@/lib/utils';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export const GEMINI_MODELS = [
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', hint: 'Rapide & économique' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', hint: 'Équilibré (recommandé)' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', hint: 'Le plus précis' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', hint: 'Léger' },
] as const;

export class GeminiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

// ---------- Schéma JSON strict ----------
const NUTRIENT_PROPS = {
  calories: { type: 'NUMBER' },
  protein: { type: 'NUMBER' },
  carbs: { type: 'NUMBER' },
  fat: { type: 'NUMBER' },
  sugar: { type: 'NUMBER' },
  fiber: { type: 'NUMBER' },
};
const NUTRIENT_KEYS = Object.keys(NUTRIENT_PROPS);

const ITEM_SCHEMA = {
  type: 'OBJECT',
  properties: { name: { type: 'STRING' }, quantity_g: { type: 'NUMBER' }, ...NUTRIENT_PROPS },
  required: ['name', 'quantity_g', ...NUTRIENT_KEYS],
};

const MEAL_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    ...NUTRIENT_PROPS,
    confidence: { type: 'NUMBER' },
    confidence_note: { type: 'STRING' },
    items: { type: 'ARRAY', items: ITEM_SCHEMA },
  },
  required: ['title', ...NUTRIENT_KEYS, 'confidence', 'confidence_note', 'items'],
};

const LABEL_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    barcode: { type: 'STRING' },
    nutriScore: { type: 'STRING' },
    servingSize_g: { type: 'NUMBER' },
    per100g: { type: 'OBJECT', properties: NUTRIENT_PROPS, required: NUTRIENT_KEYS },
    confidence: { type: 'NUMBER' },
    confidence_note: { type: 'STRING' },
  },
  required: ['title', 'per100g', 'servingSize_g', 'confidence', 'confidence_note'],
};

// ---------- Prompts ----------
const MEAL_SYSTEM_PROMPT = `Tu es un nutritionniste diététicien expert en analyse visuelle d'aliments et en bases de composition nutritionnelle (CIQUAL/ANSES, USDA FoodData Central).
Ta mission : estimer le plus précisément possible les apports nutritionnels d'un repas.

MÉTHODE OBLIGATOIRE (raisonne étape par étape avant de répondre) :
1. Identifie CHAQUE aliment visible séparément (féculents, protéines, légumes, sauces, garnitures, boissons, pain, desserts).
2. Estime le poids en grammes de chaque élément à l'aide de repères visuels : assiette plate standard ≈ 26-27 cm, assiette creuse ≈ 22 cm, couverts (fourchette ≈ 19 cm), verre ≈ 25 cl, main, épaisseur des aliments, volume occupé.
3. Tiens compte du mode de cuisson (frit, poêlé, rôti, vapeur, cru) et des matières grasses cachées : huile de cuisson (≈ 5-10 g par portion poêlée), beurre, sauces, vinaigrette, fromage râpé.
4. Utilise les valeurs nutritionnelles de référence par 100 g (aliment cuit si cuit) et calcule pour la portion estimée.
5. Vérifie la cohérence : calories ≈ 4×protéines + 4×glucides + 9×lipides (± 10 %), sucres ≤ glucides, fibres réalistes.
6. Les totaux doivent être EXACTEMENT la somme des éléments.

RÈGLES :
- Réponds UNIQUEMENT en JSON valide, sans texte autour, en français.
- "title" : nom court et appétissant du plat (ex : "Poulet rôti, riz basmati et haricots verts").
- Nombres : calories en kcal (entier), macros/sucres/fibres en grammes (1 décimale max).
- "confidence" entre 0 et 1 selon la visibilité et l'ambiguïté des portions.
- "confidence_note" : résume en 1-2 phrases les hypothèses clés (portions, cuisson, matières grasses supposées).
- Si l'image ne contient pas de nourriture, renvoie title "Aucun aliment détecté", toutes valeurs à 0, items vide.

FORMAT :
{"title":"Nom du plat","calories":450,"protein":30,"carbs":40,"fat":15,"sugar":6,"fiber":5,"confidence":0.8,"confidence_note":"Portion estimée…","items":[{"name":"…","quantity_g":150,"calories":…,"protein":…,"carbs":…,"fat":…,"sugar":…,"fiber":…}]}`;

const TEXT_SYSTEM_PROMPT = `Tu es un nutritionniste diététicien expert (bases CIQUAL/ANSES et USDA).
L'utilisateur décrit ce qu'il a mangé en texte libre. Décompose en aliments, estime les quantités en grammes lorsqu'elles ne sont pas précisées (portions standards françaises), prends en compte la cuisson et les matières grasses usuelles, puis calcule les apports.
Les totaux doivent être EXACTEMENT la somme des éléments. Vérifie : calories ≈ 4P + 4G + 9L (± 10 %).
Réponds UNIQUEMENT en JSON valide en français au format :
{"title":"…","calories":0,"protein":0,"carbs":0,"fat":0,"sugar":0,"fiber":0,"confidence":0.8,"confidence_note":"…","items":[{"name":"…","quantity_g":0,"calories":0,"protein":0,"carbs":0,"fat":0,"sugar":0,"fiber":0}]}`;

const LABEL_SYSTEM_PROMPT = `Tu es un expert en lecture d'emballages alimentaires.
L'image montre un emballage : tableau des valeurs nutritionnelles, liste d'ingrédients, face avant et/ou code-barres.
1. Lis le nom commercial du produit (et la marque) → "title".
2. Si un code-barres EAN/UPC est lisible, recopie ses chiffres → "barcode" (sinon chaîne vide).
3. Si un Nutri-Score est visible, indique sa lettre (A-E) → "nutriScore" (sinon chaîne vide).
4. Recopie les valeurs POUR 100 g (ou 100 ml) du tableau nutritionnel → "per100g" (énergie en kcal, pas en kJ ; si seul le kJ est lisible, divise par 4,184).
5. Si une portion est indiquée (ex. "par biscuit 12 g", "1 portion = 30 g"), mets son poids en g → "servingSize_g", sinon le poids net le plus probable d'une portion.
6. Si le tableau n'est pas lisible, estime d'après les ingrédients et le type de produit, et baisse "confidence".
Réponds UNIQUEMENT en JSON valide en français :
{"title":"…","barcode":"","nutriScore":"","servingSize_g":30,"per100g":{"calories":0,"protein":0,"carbs":0,"fat":0,"sugar":0,"fiber":0},"confidence":0.9,"confidence_note":"…"}`;

// ---------- Appel HTTP ----------
interface CallOptions {
  apiKey: string;
  model: string;
  systemPrompt: string;
  parts: Array<Record<string, unknown>>;
  schema?: object;
  signal?: AbortSignal;
}

async function callGemini({ apiKey, model, systemPrompt, parts, schema, signal }: CallOptions): Promise<unknown> {
  if (!apiKey) throw new GeminiError('Clé API Gemini manquante. Ajoute-la dans les Réglages.');
  const url = `${API_BASE}/${encodeURIComponent(model)}:generateContent`;

  const buildBody = (withSchema: boolean) =>
    JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts }],
      generationConfig: {
        response_mime_type: 'application/json',
        ...(withSchema && schema ? { response_schema: schema } : {}),
        temperature: 0.2,
      },
    });

  let withSchema = true;
  let lastError: GeminiError | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: buildBody(withSchema),
        signal,
      });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      throw new GeminiError('Connexion impossible. Vérifie ta connexion Internet.');
    }

    if (res.ok) {
      const json = await res.json();
      const candidate = json?.candidates?.[0];
      if (!candidate) {
        const block = json?.promptFeedback?.blockReason;
        throw new GeminiError(block ? `Requête bloquée par Gemini (${block}).` : 'Réponse vide de Gemini.');
      }
      const text: string = (candidate.content?.parts ?? [])
        .filter((p: { text?: string; thought?: boolean }) => typeof p.text === 'string' && !p.thought)
        .map((p: { text: string }) => p.text)
        .join('');
      return parseJsonLoose(text);
    }

    let message = `Erreur Gemini (${res.status})`;
    try {
      const err = await res.json();
      if (err?.error?.message) message = err.error.message;
    } catch {
      /* noop */
    }
    lastError = new GeminiError(humanizeError(res.status, message), res.status);

    if (res.status === 400 && withSchema && /schema|response_schema|responseSchema/i.test(message)) {
      withSchema = false; // certains modèles n'acceptent pas response_schema
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
      continue;
    }
    throw lastError;
  }
  throw lastError ?? new GeminiError('Erreur inconnue.');
}

function humanizeError(status: number, msg: string) {
  if (status === 400 && /API key/i.test(msg)) return 'Clé API invalide.';
  if (status === 403) return 'Accès refusé : clé API invalide ou API non activée.';
  if (status === 404) return `Modèle introuvable : ${msg}`;
  if (status === 429) return 'Quota dépassé, réessaie dans un instant.';
  if (status >= 500) return 'Service Gemini indisponible, réessaie plus tard.';
  return msg;
}

function parseJsonLoose(text: string): unknown {
  const cleaned = text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        /* noop */
      }
    }
    throw new GeminiError("Réponse de l'IA illisible. Réessaie.");
  }
}

// ---------- Normalisation ----------
function num(v: unknown, d = 1) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? round(n, d) : 0;
}

function normNutrients(o: Record<string, unknown> | undefined): Nutrients {
  const r = o ?? {};
  const n: Nutrients = {
    calories: num(r.calories, 0),
    protein: num(r.protein),
    carbs: num(r.carbs),
    fat: num(r.fat),
    sugar: num(r.sugar),
    fiber: num(r.fiber),
  };
  if (n.sugar > n.carbs) n.sugar = n.carbs;
  return n;
}

function normalizeMeal(raw: unknown): MealAnalysis {
  const r = (raw ?? {}) as Record<string, unknown>;
  const items: MealItem[] = Array.isArray(r.items)
    ? (r.items as Record<string, unknown>[]).map((it) => ({
        name: String(it.name ?? 'Aliment'),
        quantity_g: num(it.quantity_g, 0),
        ...normNutrients(it),
      }))
    : [];
  let totals = normNutrients(r);
  if (items.length) {
    const sum = items.reduce(
      (a, i) => ({
        calories: a.calories + i.calories,
        protein: a.protein + i.protein,
        carbs: a.carbs + i.carbs,
        fat: a.fat + i.fat,
        sugar: a.sugar + i.sugar,
        fiber: a.fiber + i.fiber,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, fiber: 0 },
    );
    // Les éléments font foi : garantit des totaux cohérents.
    if (sum.calories > 0) {
      totals = {
        calories: round(sum.calories),
        protein: round(sum.protein, 1),
        carbs: round(sum.carbs, 1),
        fat: round(sum.fat, 1),
        sugar: round(sum.sugar, 1),
        fiber: round(sum.fiber, 1),
      };
    }
  }
  return {
    title: String(r.title ?? 'Repas'),
    ...totals,
    confidence: r.confidence !== undefined ? Math.min(1, num(r.confidence, 2)) : undefined,
    confidence_note: String(r.confidence_note ?? ''),
    items,
  };
}

export function scaleNutrients(per100: Nutrients, grams: number): Nutrients {
  const f = grams / 100;
  return {
    calories: round(per100.calories * f),
    protein: round(per100.protein * f, 1),
    carbs: round(per100.carbs * f, 1),
    fat: round(per100.fat * f, 1),
    sugar: round(per100.sugar * f, 1),
    fiber: round(per100.fiber * f, 1),
  };
}

// ---------- API publique ----------
interface AiConfig {
  apiKey: string;
  model: string;
  signal?: AbortSignal;
}

export async function analyzeMealPhoto(base64Jpeg: string, cfg: AiConfig & { hint?: string }): Promise<MealAnalysis> {
  const parts: Array<Record<string, unknown>> = [
    { inline_data: { mime_type: 'image/jpeg', data: base64Jpeg } },
    {
      text:
        'Analyse ce repas en détail selon la méthode.' +
        (cfg.hint?.trim() ? `\nPrécisions de l'utilisateur (prioritaires) : ${cfg.hint.trim()}` : ''),
    },
  ];
  const raw = await callGemini({ ...cfg, systemPrompt: MEAL_SYSTEM_PROMPT, parts, schema: MEAL_SCHEMA });
  return normalizeMeal(raw);
}

export async function analyzeMealText(description: string, cfg: AiConfig): Promise<MealAnalysis> {
  const raw = await callGemini({
    ...cfg,
    systemPrompt: TEXT_SYSTEM_PROMPT,
    parts: [{ text: description }],
    schema: MEAL_SCHEMA,
  });
  return normalizeMeal(raw);
}

export async function analyzeNutritionLabel(base64Jpeg: string, cfg: AiConfig): Promise<MealAnalysis> {
  const raw = (await callGemini({
    ...cfg,
    systemPrompt: LABEL_SYSTEM_PROMPT,
    parts: [
      { inline_data: { mime_type: 'image/jpeg', data: base64Jpeg } },
      { text: "Lis l'emballage et extrais les informations nutritionnelles." },
    ],
    schema: LABEL_SCHEMA,
  })) as Record<string, unknown>;
  const per100g = normNutrients(raw.per100g as Record<string, unknown>);
  const serving = num(raw.servingSize_g, 0) || 100;
  const totals = scaleNutrients(per100g, serving);
  const title = String(raw.title ?? 'Produit');
  return {
    title,
    ...totals,
    per100g,
    servingSize_g: serving,
    barcode: String(raw.barcode ?? '').replace(/\D/g, '') || undefined,
    nutriScore: String(raw.nutriScore ?? '').toUpperCase().slice(0, 1) || undefined,
    confidence: raw.confidence !== undefined ? Math.min(1, num(raw.confidence, 2)) : undefined,
    confidence_note: String(raw.confidence_note ?? ''),
    items: [{ name: title, quantity_g: serving, ...totals }],
  };
}

/** Vérifie la clé et la disponibilité du modèle (requête légère). */
export async function testGeminiConnection(apiKey: string, model: string): Promise<{ ok: boolean; message: string }> {
  try {
    const raw = (await callGemini({
      apiKey,
      model,
      systemPrompt: 'Réponds uniquement en JSON.',
      parts: [{ text: 'Renvoie {"status":"ok"}' }],
    })) as { status?: string };
    return { ok: true, message: raw?.status === 'ok' ? `Connexion réussie avec ${model} ✔` : `Connexion établie avec ${model}.` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
