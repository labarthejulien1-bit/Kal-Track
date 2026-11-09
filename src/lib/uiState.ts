/**
 * État d'affichage des sections repliables (ouvert / replié).
 * Conservé dans IndexedDB (table uiState) : survit aux redémarrages et aux mises à jour.
 * Copie dans localStorage pour un affichage immédiat au démarrage.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { db } from '@/db/database';

const LS_KEY = 'kal-ui-open';
let state: Record<string, boolean> = {};
const listeners = new Set<() => void>();

try {
  state = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
} catch {
  /* stockage navigateur indisponible */
}

/** Lit l'état enregistré (à appeler avant le premier affichage). */
export async function loadUiState() {
  try {
    const rows = await db.uiState.toArray();
    for (const r of rows) state[r.key] = r.open;
    listeners.forEach((l) => l());
  } catch {
    /* garde l'état local */
  }
}

function setOpen(key: string, open: boolean) {
  state = { ...state, [key]: open };
  listeners.forEach((l) => l());
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    /* noop */
  }
  db.uiState.put({ key, open }).catch(() => {});
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** [ouvert, basculer] pour une section identifiée par `key`. */
export function useSectionOpen(key: string, defaultOpen = true): [boolean, () => void] {
  const open = useSyncExternalStore(subscribe, () => state[key] ?? defaultOpen);
  const toggle = useCallback(() => setOpen(key, !(state[key] ?? defaultOpen)), [key, defaultOpen]);
  return [open, toggle];
}

/** Ouvre ou replie plusieurs sections d'un coup. */
export function setSections(keys: string[], open: boolean) {
  keys.forEach((k) => setOpen(k, open));
}
