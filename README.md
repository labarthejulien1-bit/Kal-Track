# Kal-Track 🍽️🔍

PWA Android **100 % locale** de suivi des calories et macronutriments, avec analyse des repas par IA (Google Gemini).

## Démarrage

```bash
npm install
npm run dev        # développement (http://localhost:5173, accessible sur le réseau local)
npm run build      # build de production dans dist/
npm run preview    # sert le build (tester l'installation PWA)
```

> L'installation PWA et la caméra nécessitent **HTTPS** (ou `localhost`). Déploie `dist/` sur n'importe quel hébergement statique (GitHub Pages, Netlify, Vercel, Cloudflare Pages), ouvre-le dans Chrome Android puis « Ajouter à l'écran d'accueil ».

## Fonctionnalités

- **Journal** : navigation jour par jour (flèches, bande de la semaine, calendrier), ajout/modification sur n'importe quel jour passé, 4 sections (petit-déj, déjeuner, dîner, en-cas) avec cible calorique par repas et répartition de la journée, anneau calorique avec zones perte / maintien / prise, 3 cercles bilans P/G/L, barres sucres et fibres, hydratation, série de jours, bilan du jour, copie de la veille.
- **Scanner** : photo du plat (analyse IA détaillée par aliment, précisions facultatives), code-barres (caméra en direct via BarcodeDetector/ZXing + Open Food Facts, Nutri-Score), photo d'étiquette nutritionnelle (lecture IA des valeurs pour 100 g), description en texte libre, récents & favoris, saisie manuelle. Modale de validation éditable (portion ×0,5…×2, grammes, détail par aliment, contrôle de cohérence kcal/macros).
- **Analyses** : Jour (jauges graduées vs objectifs, % d'atteinte, détail par repas en kcal par macro, camembert), Semaine (barres vs objectif + limites perte/maintien/prise, empilement P/G/L + ligne calories, graphiques dédiés protéines/glucides/lipides/sucres), Mois (conformité, calendrier, évolution, poids, macros).
- **Poids** : pesée pour n'importe quelle date, courbe avec tendance lissée et ligne objectif, IMC, projection de la date d'atteinte, **dépense adaptative** estimée à partir des données réelles, historique éditable.
- **Réglages** : clé API Gemini + test de connexion, liste déroulante des modèles, profil complet (sexe, âge, taille, poids, poids cible, masse grasse, activité, sport, objectif et rythme, répartition des macros et des repas), détail du calcul BMR/TDEE, surcharge manuelle, export/import JSON, état du stockage persistant.

## Calcul des besoins

- BMR Mifflin-St Jeor (moyenné avec Katch-McArdle si la masse grasse est renseignée).
- TDEE = BMR × facteur d'activité (1,2 / 1,375 / 1,55 / 1,725 / 1,9) + dépense nette des séances de sport.
- Objectif : perte (−250 / **−500** / −750 kcal), maintien, prise (+150 / **+300** / +500 kcal), avec plancher de sécurité.
- Macros par défaut 30 % P / 40 % G / 30 % L ; sucres < 10 % de l'énergie (OMS) ; fibres 14 g / 1000 kcal.

## Persistance

Toutes les données sont dans IndexedDB (Dexie, base `CalorieTrackerDB`). `navigator.storage.persist()` est appelé au démarrage pour empêcher Android de les effacer ; elles survivent aux redémarrages du téléphone. Les seuls appels réseau sont l'API Gemini (avec ta clé) et Open Food Facts (codes-barres).

## Structure

```
src/
  types/index.ts              Interfaces (Meal, Profile, WeightLog, MealAnalysis…)
  db/database.ts              Schéma Dexie, stockage persistant, export/import
  services/imageCompressor.ts Canvas : ≤ 1024 px, JPEG 0,75, < 200 Ko
  services/geminiVision.ts    Appels REST Gemini (JSON strict + schéma)
  services/openFoodFacts.ts   Recherche par code-barres
  services/bmrCalculator.ts   BMR / TDEE / objectifs / TDEE adaptatif
  hooks/                      useProfile, useMeals, useWeights, useWater
  components/                 Layout, Dashboard/, Scan/, Analytics/, Weight/, Settings/, ui/
```
