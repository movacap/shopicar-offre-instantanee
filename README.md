# Shopicar — Offre instantanée

App mobile pour les particuliers : scan ou saisie du NIV, questionnaire court, offre ferme* calculée par l'AI (valeur wholesale − frais Shopicar de 700 $ à 1 200 $), puis suivi de l'auto dans « Mon garage ».

Projet indépendant : aucun lien avec HomPilot ni avec l'infrastructure de Julia.

## Structure
- `index.html` : toute l'app (HTML/CSS/JS, aucune compilation)
- `api/ai.js` : fonction serverless qui appelle l'API Anthropic (décodage NIV, lecture de photo, évaluation wholesale, chat « Julia » de l'app)

## Paramètres (haut du script dans index.html)
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
- Prix : l'AI cherche 3 à 8 annonces comparables au Québec (recherche web de l'API Anthropic, version Vercel seulement), évalue directement le prix wholesale réel (encan entre marchands / valeur d'échange) à partir des signaux de marché et de l'écart détail→wholesale propre au segment, ajuste pour l'état, puis retire le frais Shopicar. Le prix de détail est affiché pour référence seulement. Pour une offre réellement ferme, l'alimenter avec une source de marché (Canadian Black Book, Manheim MMR) et l'historique des transactions Shopicar.
- Carfax : appel API à l'acceptation pour valider les déclarations.
- Protection de `/api/ai` : limite de débit (ex. Vercel Firewall) avant le lancement public.
