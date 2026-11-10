/**
 * Unités d'affichage. Les données restent stockées en métrique (kg, cm, ml) :
 * on convertit seulement à l'affichage et à la saisie.
 */
export type WeightUnit = 'kg' | 'lb';
export type HeightUnit = 'cm' | 'ftin';
export type WaterUnit = 'ml' | 'floz';
export interface Units {
  weight: WeightUnit;
  height: HeightUnit;
  water: WaterUnit;
}

const LB = 0.45359237;
const FLOZ = 29.5735;

/** Unités par défaut selon la région du téléphone (impérial pour les États-Unis). */
export function defaultUnits(): Units {
  const lang = (typeof navigator !== 'undefined' && (navigator.languages?.[0] || navigator.language)) || '';
  const imperial = /^en-(US|LR)$/i.test(lang) || /^my/i.test(lang);
  return imperial ? { weight: 'lb', height: 'ftin', water: 'floz' } : { weight: 'kg', height: 'cm', water: 'ml' };
}

let current: Units = defaultUnits();
export const setUnits = (u: Units) => (current = u);
export const getUnits = () => current;
export const resolveUnits = (u?: Partial<Units> | null): Units => ({ ...defaultUnits(), ...(u ?? {}) });

const r = (n: number, d = 1) => {
  const p = 10 ** d;
  return Math.round((Number.isFinite(n) ? n : 0) * p) / p;
};

// ---- Poids ----
export const wUnit = () => current.weight;
/** kg → unité d'affichage */
export const wOut = (kg: number, d = 1) => r(current.weight === 'lb' ? kg / LB : kg, d);
/** unité d'affichage → kg */
export const wIn = (v: number) => (current.weight === 'lb' ? v * LB : v);
export const fmtW = (kg: number, d = 1) => `${wOut(kg, d)} ${current.weight}`;
/** Pas de réglage fin (±0,1 kg ou ±0,2 lb). */
export const wStep = () => (current.weight === 'lb' ? 0.2 : 0.1);

// ---- Taille ----
export const hUnit = () => current.height;
export function cmToFtIn(cm: number) {
  const totalIn = cm / 2.54;
  let ft = Math.floor(totalIn / 12);
  let inch = Math.round(totalIn - ft * 12);
  if (inch === 12) {
    ft += 1;
    inch = 0;
  }
  return { ft, inch };
}
export const ftInToCm = (ft: number, inch: number) => r((ft * 12 + inch) * 2.54, 1);
export const fmtH = (cm: number) => {
  if (current.height === 'cm') return `${Math.round(cm)} cm`;
  const { ft, inch } = cmToFtIn(cm);
  return `${ft}′${inch}″`;
};

// ---- Eau ----
export const waterUnit = () => current.water;
export const waterOut = (ml: number) => (current.water === 'floz' ? r(ml / FLOZ, 0) : Math.round(ml));
export const waterIn = (v: number) => (current.water === 'floz' ? v * FLOZ : v);
export const fmtWater = (ml: number) => (current.water === 'floz' ? `${r(ml / FLOZ, 0)} fl oz` : `${(ml / 1000).toFixed(ml % 1000 === 0 ? 1 : 2)} L`);
export const waterUnitLabel = () => (current.water === 'floz' ? 'fl oz' : 'ml');
/** Eau pour les graphiques d'analyse : litres (2 décimales) ou fl oz. */
export const waterChart = (ml: number) => (current.water === 'floz' ? r(ml / FLOZ, 0) : r(ml / 1000, 2));
export const waterChartUnit = () => (current.water === 'floz' ? 'fl oz' : 'L');
