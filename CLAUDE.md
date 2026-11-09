# Kal-Track — règles du projet

## Langues (obligatoire)

Toute nouvelle mise à jour doit être faite dans **toutes les langues prises en charge** par l'application :
français (fr, langue source), anglais (en), espagnol (es), portugais (pt), allemand (de), italien (it).

- Chaque texte visible passe par `t('texte en français')` (`src/i18n/index.ts`) — jamais de texte en dur.
- Ajouter la traduction de chaque nouveau texte dans `src/i18n/en.ts`, `es.ts`, `pt.ts`, `de.ts`, `it.ts`.
- Un même texte français avec deux sens : suffixe `"texte|contexte"`.
- Les réponses de l'IA suivent la langue choisie (`AI_LANG_NAMES`).
- Avant chaque commit : `npm run i18n:check` doit afficher `OK` (aucune clé manquante), et `npx tsc --noEmit` doit passer.
- Si une nouvelle langue est ajoutée à `LANGS`, elle devient soumise à la même règle.

## Autres contraintes

- Ne jamais demander ni écrire de clé secrète dans le dépôt ou la conversation : elles sont uniquement dans les secrets GitHub (`GEMINI_API_KEY`, `CLOUDFLARE_API_TOKEN`).
- Le dépôt est public : les codes d'accès n'apparaissent que sous forme d'empreinte SHA-256 dans `worker/wrangler.toml`.
- Les valeurs sont stockées en métrique ; conversion uniquement à l'affichage/saisie (`src/lib/units.ts`).
- Les réglages doivent rester persistants (Dexie `userProfile`) après mise à jour et redémarrage.
- Les nouveaux éléments d'interface doivent fonctionner en thème clair et sombre (`src/theme.css`).
