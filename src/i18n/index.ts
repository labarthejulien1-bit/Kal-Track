/**
 * Traductions de Kal-Track.
 * Le texte français sert de clé : t('Petit-déjeuner') → « Breakfast » en anglais.
 * Si une traduction manque, le texte français est affiché.
 */
import en from './en';
import es from './es';
import pt from './pt';
import de from './de';
import it from './it';

export type Lang = 'fr' | 'en' | 'es' | 'pt' | 'de' | 'it';
export type LangSetting = 'auto' | Lang;

export const LANGS: { code: Lang; label: string; flag: string }[] = [
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
];

const DICTS: Record<Exclude<Lang, 'fr'>, Record<string, string>> = { en, es, pt, de, it };
const LOCALES: Record<Lang, string> = { fr: 'fr-FR', en: 'en-GB', es: 'es-ES', pt: 'pt-BR', de: 'de-DE', it: 'it-IT' };
/** Nom de la langue pour demander à l'IA de répondre dans cette langue. */
export const AI_LANG_NAMES: Record<Lang, string> = { fr: 'French', en: 'English', es: 'Spanish', pt: 'Brazilian Portuguese', de: 'German', it: 'Italian' };

let current: Lang = 'fr';

/** Première langue du téléphone prise en charge (sinon anglais). */
export function detectLang(): Lang {
  const list = (typeof navigator !== 'undefined' && (navigator.languages?.length ? navigator.languages : [navigator.language])) || [];
  for (const l of list) {
    const c = String(l || '').slice(0, 2).toLowerCase();
    if (LANGS.some((x) => x.code === c)) return c as Lang;
  }
  return 'en';
}

export function resolveLang(setting?: LangSetting | null): Lang {
  return !setting || setting === 'auto' ? detectLang() : setting;
}

export function setLang(l: Lang) {
  current = l;
  if (typeof document !== 'undefined') document.documentElement.lang = l;
}

export const getLang = () => current;
export const locale = () => LOCALES[current];
/** Séparateur décimal de la langue courante. */
export const decimalSep = () => (current === 'en' ? '.' : ',');

export function t(text: string, params?: Record<string, string | number>): string {
  // « texte|contexte » permet deux traductions d'un même mot français (ex. libellé court).
  const fr = text.includes('|') ? text.slice(0, text.indexOf('|')) : text;
  let out = current === 'fr' ? fr : (DICTS[current][text] ?? fr);
  if (params) for (const [k, v] of Object.entries(params)) out = out.split(`{${k}}`).join(String(v));
  return out;
}
