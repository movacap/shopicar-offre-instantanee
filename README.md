# Shopicar — Offre instantanée

App mobile pour les particuliers : scan ou saisie du NIV, questionnaire court, offre ferme* calculée par l'AI (valeur wholesale − frais Shopicar de 700 $ à 1 200 $), puis suivi de l'auto dans « Mon garage ».

Projet indépendant : aucun lien avec HomPilot ni avec l'infrastructure de Julia.

## Structure
- `index.html` : toute l'app (HTML/CSS/JS, aucune compilation)
- `api/ai.js` : fonction serverless qui appelle l'API Anthropic (décodage NIV, lecture de photo, chat « Julia » de l'app)
- `api/market.js` : annonces comparables au Québec (recherche web AI), mises en cache 7 jours dans Vercel Blob (store privé `shopicar-market-cache`), clé = squish VIN + tranche de 50 000 km
- `pricing.js` : calcul de l'offre 100 % déterministe (aucune AI) : médiane des comparables ajustées au km, écart détail→wholesale selon la demande/l'âge/le km, barème fixe d'état selon les réponses, frais Shopicar

## Paramètres (objet `PRICING` dans pricing.js)
- `FEE_MIN` / `FEE_MAX` = 700 / 1200 : frais Shopicar, linéaire selon la valeur wholesale entre `FEE_LOW_AT` (10 000 $) et `FEE_HIGH_AT` (40 000 $), arrondi à 50 $
- `BONUS_24H` = 250 : bonus si acceptée en moins de 24 h
- `OFFER_HOURS` = 48 : validité de l'offre
- `SHOW_BREAKDOWN` = true : afficher le calcul wholesale − frais au client

## Déploiement Vercel
1. Importer ce dépôt dans Vercel (framework : Other, aucune commande de build).
2. Ajouter la variable d'environnement `ANTHROPIC_API_KEY`.
3. Déployer.

## À brancher pour la production
- Stockage : le garage est sauvegardé sur l'appareil (localStorage). Prochaine étape : une base Supabase dédiée + connexion Google/Facebook ou code SMS.
- Prix : l'AI ne fait que trouver les annonces (rapportées telles quelles, mises en cache 7 jours). Le prix est calculé par `pricing.js` : la même auto avec les mêmes réponses obtient toujours la même offre. Les photos ne changent jamais le prix, elles signalent seulement un écart à l'acheteur. Pour une offre réellement ferme, ajouter une source wholesale (Canadian Black Book, Manheim MMR) et l'historique des transactions Shopicar pour calibrer `SPREAD_PCT`.
- Carfax : appel API à l'acceptation pour valider les déclarations.
- Protection de `/api/ai` : limite de débit (ex. Vercel Firewall) avant le lancement public.
