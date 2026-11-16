# Shopicar — Offre instantanée

App mobile pour les particuliers : scan ou saisie du NIV, questionnaire court, offre ferme* calculée par l'AI (valeur wholesale − frais fixe 1 200 $), puis suivi de l'auto dans « Mon garage ».

Projet indépendant : aucun lien avec HomPilot ni avec l'infrastructure de Julia.

## Structure
- `index.html` : toute l'app (HTML/CSS/JS, aucune compilation)
- `api/ai.js` : fonction serverless qui appelle l'API Anthropic (décodage NIV, lecture de photo, évaluation wholesale, chat « Julia » de l'app)

## Paramètres (haut du script dans index.html)
- `FEE` = 1200 : frais Shopicar
- `RECON` = 5500 : marge + remise en état du concessionnaire retirée du prix de détail des comparables
- `BONUS_24H` = 250 : bonus si acceptée en moins de 24 h
- `OFFER_HOURS` = 48 : validité de l'offre
- `SHOW_BREAKDOWN` = true : afficher le calcul wholesale − frais au client

## Déploiement Vercel
1. Importer ce dépôt dans Vercel (framework : Other, aucune commande de build).
2. Ajouter la variable d'environnement `ANTHROPIC_API_KEY`.
3. Déployer.

## À brancher pour la production
- Stockage : le garage est sauvegardé sur l'appareil (localStorage). Prochaine étape : une base Supabase dédiée + connexion Google/Facebook ou code SMS.
- Prix : l'AI cherche 3 à 8 annonces comparables au Québec (recherche web de l'API Anthropic, version Vercel seulement), estime le prix de détail au kilométrage du véhicule, retire `RECON`, ajuste pour l'état, puis retire `FEE`. Pour une offre réellement ferme, l'alimenter avec une source de marché (Canadian Black Book, Manheim MMR) et l'historique des transactions Shopicar.
- Carfax : appel API à l'acceptation pour valider les déclarations.
- Protection de `/api/ai` : limite de débit (ex. Vercel Firewall) avant le lancement public.
