# Shopicar — Offre instantanée

App mobile pour les particuliers : scan ou saisie du NIV, questionnaire court, offre ferme* calculée par l'AI (valeur wholesale − frais Shopicar de 700 $ à 1 200 $), puis suivi de l'auto dans « Mon garage ».

Projet indépendant : aucun lien avec HomPilot ni avec l'infrastructure de Julia.

## Structure
- `index.html` : toute l'app (HTML/CSS/JS, aucune compilation)
- `api/ai.js` : fonction serverless qui appelle l'API Anthropic (décodage NIV, lecture de photo, chat « Julia » de l'app)
- `api/estimate.js` : estimation sur le serveur. Au client : l'offre, l'offre avant ajustements et les ajustements d'état déclarés seulement. Marge, valeur wholesale, frais et comparables : seulement au Super Admin (`?admin=<clé>`, en-tête x-admin-key) et à la fiche 360inspek.
- `api/market.js` (Super Admin seulement) et `api/_lib/market.js` : annonces comparables au Québec (recherche web AI), mises en cache 7 jours dans Vercel Blob (store privé `shopicar-market-cache`), clé = squish VIN + tranche de 50 000 km
- `api/_lib/pricing.js` : calcul de l'offre (sur le serveur seulement) 100 % déterministe (aucune AI) : médiane des comparables ajustées au km, écart détail→wholesale selon la demande/l'âge/le km, barème fixe d'état selon les réponses, frais Shopicar

## Paramètres (objet `PRICING` dans api/_lib/pricing.js)
- `FEE_MIN` / `FEE_MAX` = 700 / 1200 : frais Shopicar, linéaire selon la valeur wholesale entre `FEE_LOW_AT` (10 000 $) et `FEE_HIGH_AT` (40 000 $), arrondi à 50 $
- `BONUS_24H` = 250 : bonus si acceptée en moins de 24 h
- `OFFER_HOURS` = 48 : validité de l'offre
- `SHOW_BREAKDOWN` = true : afficher le calcul wholesale − frais au client

## Déploiement Vercel
1. Importer ce dépôt dans Vercel (framework : Other, aucune commande de build).
2. Ajouter la variable d'environnement `ANTHROPIC_API_KEY`.
3. Déployer.

## Parcours client (estimation → meilleur prix)
1. « Julia analyse ton véhicule… » pendant le vrai calcul (api/estimate.js → api/_lib/pricing.js, règles inchangées).
2. Première estimation (non garantie), demande de photos, bouton « Obtenir mon meilleur prix Shopicar ».
3. « Julia travaille pour toi! » : meilleure offre validée en direct (montant animé, jauge en escalier, message de hausse). Une offre plus basse ne fait jamais baisser la meilleure offre valide; les offres expirées ou retirées ne comptent plus.
4. Meilleure offre finale (validité 48 h, conditions), puis Accepter et prendre rendez-vous / Parler à un conseiller / Discuter avec Julia.
5. Notification sur l'appareil (avec permission) quand le prix monte et que l'app est en arrière-plan.

**Offres réelles : 360inspek (réseau Shopicar, agent.shopicar.com).** Au bouton « Obtenir mon meilleur prix », `api/lead.js` crée la fiche (avec photos) dans le réseau Shopicar par la fonction 360inspek `shopicar-lead`. L'équipe envoie ses offres avec le bouton « Offre d'achat » de la fiche (case « Offre finale » pour terminer la recherche). Le client reçoit un texto avec un lien `?o=<jeton>` quand son prix monte, et l'app interroge 360inspek toutes les 8 s. Accepter, demander un rappel ou une cueillette avise l'équipe par texto.
Variable Vercel : `SHOPICAR_LEAD_SECRET` (même valeur que le secret `shopicar_lead_secret` du vault 360inspek).
Démo sans 360inspek : ouvrir l'app avec `?demo=1` (offres simulées +300, +400, +300, +500 $), `?demo=0` pour revenir.

## À brancher pour la production
- Stockage : le garage est sauvegardé sur l'appareil (localStorage). Prochaine étape : une base Supabase dédiée + connexion Google/Facebook ou code SMS.
- Prix : l'AI ne fait que trouver les annonces (rapportées telles quelles, mises en cache 7 jours). Le prix est calculé sur le serveur par `api/_lib/pricing.js` : la même auto avec les mêmes réponses obtient toujours la même offre. Les photos ne changent jamais le prix, elles signalent seulement un écart à l'acheteur. Pour une offre réellement ferme, ajouter une source wholesale (Canadian Black Book, Manheim MMR) et l'historique des transactions Shopicar pour calibrer `SPREAD_PCT`.
- Carfax : appel API à l'acceptation pour valider les déclarations.
- Protection de `/api/ai` : limite de débit (ex. Vercel Firewall) avant le lancement public.
