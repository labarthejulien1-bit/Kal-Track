import { useEffect } from 'react';
import { useProfile } from '@/hooks/useProfile';
import { healthSupported, syncHealth } from '@/lib/health';

/** Synchronise Santé Android à l'ouverture et à chaque retour dans l'appli (au plus toutes les 5 min). */
export function HealthSync() {
  const { profile, loading } = useProfile();
  const connected = healthSupported && !loading && !!profile.health?.connected;
  const weight = profile.weight;

  useEffect(() => {
    if (!connected) return;
    const run = () => document.visibilityState === 'visible' && syncHealth({ weight }).catch(() => {});
    const first = setTimeout(run, 800); // laisse l'interface s'afficher d'abord
    document.addEventListener('visibilitychange', run);
    return () => {
      clearTimeout(first);
      document.removeEventListener('visibilitychange', run);
    };
  }, [connected, weight]);

  return null;
}
