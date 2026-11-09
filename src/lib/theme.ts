/** Thème clair / sombre / automatique (système). Clair par défaut à la première ouverture. */
export type ThemeSetting = 'light' | 'dark' | 'auto';
const KEY = 'kal-theme';
let mql: MediaQueryList | null = null;

function resolve(t: ThemeSetting): 'light' | 'dark' {
  if (t !== 'auto') return t;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(setting: ThemeSetting = 'light') {
  const mode = resolve(setting);
  const root = document.documentElement;
  root.classList.toggle('light', mode === 'light');
  root.classList.toggle('dark', mode === 'dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'light' ? '#f4f6fa' : '#0f172a');
  try {
    localStorage.setItem(KEY, setting);
  } catch {
    /* stockage navigateur indisponible : le profil IndexedDB reste la référence */
  }
  // En mode automatique, suit les changements du système.
  if (mql) mql.onchange = null;
  if (setting === 'auto' && window.matchMedia) {
    mql = window.matchMedia('(prefers-color-scheme: dark)');
    mql.onchange = () => applyTheme('auto');
  }
}

/** Thème mémorisé pour l'affichage immédiat au démarrage (avant lecture du profil). */
export function storedTheme(): ThemeSetting {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'auto') return v;
  } catch {
    /* noop */
  }
  return 'light';
}
