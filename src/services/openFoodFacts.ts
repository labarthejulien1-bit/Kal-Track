import type { MealAnalysis, Nutrients } from '@/types';
import { round } from '@/lib/utils';
import { scaleNutrients } from './geminiVision';

/** Recherche d'un produit par code-barres dans la base ouverte Open Food Facts. */
export async function fetchProductByBarcode(code: string, signal?: AbortSignal): Promise<MealAnalysis | null> {
  const clean = code.replace(/\D/g, '');
  if (clean.length < 6) return null;
  const fields = [
    'product_name',
    'product_name_fr',
    'brands',
    'quantity',
    'serving_quantity',
    'serving_size',
    'nutriscore_grade',
    'image_front_small_url',
    'nutriments',
  ].join(',');
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${clean}.json?fields=${fields}`, { signal });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Open Food Facts indisponible (${res.status}).`);
  }
  const json = await res.json();
  if (json.status !== 1 || !json.product) return null;
  const p = json.product;
  const n = p.nutriments ?? {};
  const kcal =
    n['energy-kcal_100g'] ?? (n['energy_100g'] !== undefined ? Number(n['energy_100g']) / 4.184 : 0);
  const per100g: Nutrients = {
    calories: round(Number(kcal) || 0),
    protein: round(Number(n.proteins_100g) || 0, 1),
    carbs: round(Number(n.carbohydrates_100g) || 0, 1),
    fat: round(Number(n.fat_100g) || 0, 1),
    sugar: round(Number(n.sugars_100g) || 0, 1),
    fiber: round(Number(n.fiber_100g) || 0, 1),
  };
  const serving = Number(p.serving_quantity) > 0 ? Number(p.serving_quantity) : 100;
  const name = [p.product_name_fr || p.product_name || 'Produit', p.brands?.split(',')[0]].filter(Boolean).join(' – ');
  const totals = scaleNutrients(per100g, serving);
  return {
    title: name,
    ...totals,
    per100g,
    servingSize_g: serving,
    barcode: clean,
    nutriScore: p.nutriscore_grade && /^[a-e]$/i.test(p.nutriscore_grade) ? p.nutriscore_grade.toUpperCase() : undefined,
    confidence: 1,
    confidence_note: `Données Open Food Facts${p.serving_size ? ` · portion indiquée : ${p.serving_size}` : ''}${p.quantity ? ` · emballage : ${p.quantity}` : ''}`,
    items: [{ name, quantity_g: serving, ...totals }],
    imageUrl: p.image_front_small_url,
  };
}
