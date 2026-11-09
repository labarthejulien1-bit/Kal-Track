/**
 * Adaptations pour l'application Android (Capacitor).
 * Sur le site web / PWA, toutes ces fonctions gardent le comportement habituel.
 */
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();

/* ---------- Bouton retour Android ---------- */

// Pile des fenêtres ouvertes : le bouton retour ferme d'abord la plus récente.
const backStack: Array<() => void> = [];
let fallback: (() => boolean) | null = null;

/** Enregistre une fenêtre ouverte ; renvoie la fonction qui la retire de la pile. */
export function pushBack(close: () => void): () => void {
  backStack.push(close);
  return () => {
    const i = backStack.lastIndexOf(close);
    if (i >= 0) backStack.splice(i, 1);
  };
}

/** Action si aucune fenêtre n'est ouverte (ex. revenir au Journal). Renvoie false pour quitter l'app. */
export function setBackFallback(fn: (() => boolean) | null) {
  fallback = fn;
}

export async function initNative() {
  if (!isNative) return;
  const { App } = await import('@capacitor/app');
  App.addListener('backButton', () => {
    const close = backStack[backStack.length - 1];
    if (close) return close();
    if (fallback?.()) return;
    App.minimizeApp();
  });
}

/* ---------- Barre d'état (couleur des icônes selon le thème) ---------- */

export function applySystemBars(mode: 'light' | 'dark') {
  if (!isNative) return;
  SystemBars.setStyle({ style: mode === 'light' ? SystemBarsStyle.Light : SystemBarsStyle.Dark }).catch(() => {});
}

/* ---------- Export de fichier ---------- */

/** Web : téléchargement. Android : fichier temporaire + menu de partage (Drive, Fichiers, e-mail…). */
export async function saveFile(filename: string, content: string, type = 'application/json', title = filename) {
  if (!isNative) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
  const res = await Filesystem.writeFile({ path: filename, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
  try {
    await Share.share({ title, files: [res.uri] });
  } catch (e) {
    // L'utilisateur a simplement fermé le menu de partage.
    if (!/cancel/i.test(String((e as Error)?.message ?? e))) throw e;
  }
}
