# Kal-Track — réponses pour la Play Console

Textes de la fiche du store : `fastlane/metadata/android/<langue>/`
(`title.txt` ≤ 30 caractères, `short_description.txt` ≤ 80, `full_description.txt` ≤ 4000).
Langue par défaut : **fr-FR**. Traductions : en-US, es-ES, pt-PT, pt-BR, de-DE, it-IT.

Politique de confidentialité : https://labarthejulien1-bit.github.io/Kal-Track/privacy.html

---

## Configuration de l'application (« Contenu de l'application »)

| Question | Réponse |
|---|---|
| Règles de confidentialité | L'URL ci-dessus |
| Accès à l'application | **Toutes les fonctionnalités sont disponibles sans restrictions d'accès** (pas de compte) |
| Annonces | **Non**, l'application ne contient pas d'annonces |
| Public cible | **18 ans et plus** uniquement (exigé par les conditions de l'API Gemini) |
| Contenu attrayant pour les enfants | Non |
| Application d'actualités | Non |
| Applis de santé | Cocher **« Nutrition et gestion du poids »** (ou « Suivi de l'activité et de la condition physique » si demandé). Pas d'appareil médical, pas de diagnostic |
| Applications gouvernementales | Non |
| Fonctionnalités financières | Aucune |
| ID publicitaire | **Non**, l'application n'utilise pas l'identifiant publicitaire |

## Classification du contenu (questionnaire IARC)

- Catégorie : **Toutes les autres catégories d'applications** (ni jeu, ni réseau social)
- Violence, sexualité, langage grossier, drogues, jeux d'argent : **Non** partout
- Les utilisateurs peuvent-ils interagir ou échanger du contenu entre eux ? **Non**
- L'application partage-t-elle la position de l'utilisateur ? **Non**
- Achats numériques : **Non** (pour l'instant, à mettre à jour avec l'abonnement)
- Contenu généré par IA : **Oui** — estimations nutritionnelles textuelles générées à la demande de l'utilisateur (pas d'images ni de contenu libre)

## Sécurité des données (« Data safety »)

**L'application collecte-t-elle ou partage-t-elle des données ?** → **Oui**
**Toutes les données sont-elles chiffrées en transit ?** → **Oui** (HTTPS)
**Les utilisateurs peuvent-ils demander la suppression ?** → **Oui** (Réglages → Données → Effacer, ou désinstallation ; aucune donnée conservée sur nos serveurs)

Données stockées uniquement sur le téléphone : **à ne pas déclarer** (Google ne compte comme « collectées » que les données qui quittent l'appareil).

| Type de données (Google) | Collectée | Partagée | Pourquoi | Facultative ? | Traitement éphémère |
|---|---|---|---|---|---|
| **Photos et vidéos → Photos** | Oui | Non* | Fonctionnalité de l'application | Oui (l'utilisateur choisit d'analyser) | **Oui** |
| **Santé et remise en forme → Informations nutritionnelles** *(ou « Autres infos de santé »)* : descriptions de repas en texte | Oui | Non* | Fonctionnalité de l'application | Oui | **Oui** |
| **Identifiants de l'appareil ou autres → ID de l'appareil** (numéro aléatoire anonyme) | Oui | Non | Fonctionnalité de l'application (limite d'analyses), prévention de la fraude/des abus | Non (envoyé avec chaque analyse IA) | Non (compteurs gardés quelques jours) |

\* Google (Gemini), Cloudflare et Open Food Facts agissent comme **prestataires de services** traitant les données pour notre compte : selon les règles Google Play, ce n'est **pas** un « partage ».

Non collectées : position, contacts, e-mail, nom, informations financières, historique de navigation, messages, fichiers, audio, statistiques d'usage, plantages, identifiant publicitaire.

Code-barres : le numéro EAN d'un produit n'est pas une donnée personnelle → rien à déclarer.

## ⚠️ Prérequis avant publication

- **Activer la facturation sur le projet Google AI Studio / Gemini (offre payante)** : les conditions de l'API Gemini n'autorisent que l'offre payante pour une application utilisée dans l'Union européenne, en Suisse ou au Royaume-Uni. La politique de confidentialité indique les conditions payantes (pas d'entraînement sur les données).
- Adresse de contact (fiche du store, politique de confidentialité) : kalapps.contact@gmail.com

## Santé Android (Health Connect) — déclaration Play Console

Play Console → Contenu de l'application → **Autorisations Health Connect** (déclaration « Applications de santé »).

Autorisations demandées (lecture seule) et justification :

| Autorisation | Justification à saisir |
|---|---|
| `READ_STEPS` | Afficher le nombre de pas du jour dans le journal et suggérer le niveau d'activité utilisé pour calculer l'objectif calorique. |
| `READ_EXERCISE` | Afficher les séances de sport du jour et ajouter les calories des séances supplémentaires à l'objectif calorique. |
| `READ_ACTIVE_CALORIES_BURNED` | Afficher les calories actives brûlées et calculer les calories de chaque séance. |
| `READ_WEIGHT` | Importer automatiquement le poids mesuré par une balance connectée dans la courbe de poids. |

- Catégorie d'usage : **Suivi de la nutrition et du poids / remise en forme**.
- Les données restent sur l'appareil, ne sont ni transmises ni partagées, ni utilisées pour la publicité.
- URL de la politique (section Health Connect incluse) : https://labarthejulien1-bit.github.io/Kal-Track/privacy.html
- Sécurité des données : les données Health Connect ne quittent pas l'appareil → **rien de plus à déclarer comme « collecté »**.
