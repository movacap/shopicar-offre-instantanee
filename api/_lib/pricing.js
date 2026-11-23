// Shopicar — calcul de l'offre, 100 % déterministe (aucune AI ici).
// L'AI fournit seulement les annonces comparables (mises en cache 7 jours, voir api/market.js).
// Mêmes comparables + mêmes réponses = même offre, à chaque fois.

export const PRICING = {
  // Comparables
  MIN_COMPS: 3,                // sous ce nombre : offre « à valider » par un acheteur
  KM_PCT_PER_10K: 2,           // ajustement de kilométrage : 2 % du prix par 10 000 km d'écart
  KM_ADJ_CAP_PCT: 15,          // plafond de l'ajustement de km par annonce
  YEAR_PCT: 8,                 // annonce d'une année voisine : 8 % par année d'écart
  OUTLIER_PCT: 20,             // annonces à plus de 20 % de la médiane retirées
  // Écart détail → wholesale (marge, remise en état, certification, frais de vente du concessionnaire)
  SPREAD_PCT: { forte: 12, normale: 15, faible: 19 },
  // Autos récentes (4 ans ou moins) : les concessionnaires paient plus près du détail (ex. Model Y 2023 payé 41 500 $ pour ~43 000 $ au détail)
  SPREAD_RECENT_YEARS: 4, SPREAD_PCT_RECENT: { forte: 8, normale: 10, faible: 13 },
  // Offres réelles des acheteurs du réseau (360inspek) : elles priment sur le calcul détail → wholesale dès qu'il y en a assez
  BIDS_MIN: 3, BIDS_BLEND_MIN: 2,
  SPREAD_OLD_YEARS: 8, SPREAD_OLD_PCT: 2,       // +2 points dès 8 ans
  SPREAD_HIGH_KM: 200000, SPREAD_HIGH_KM_PCT: 2, // +2 points dès 200 000 km
  SPREAD_MIN: 3000,            // profit minimum en dollars, même pour une auto bon marché
  // Frais Shopicar : 700 $ à 1 200 $, linéaire entre 10 000 $ et 40 000 $ de wholesale, arrondi à 50 $
  FEE_MIN: 700, FEE_MAX: 1200, FEE_LOW_AT: 10000, FEE_HIGH_AT: 40000,
};

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r = (n, step) => Math.round(n / step) * step;

/** Prix de détail d'un exemplaire en bon état moyen, au kilométrage exact du véhicule. */
export function retailFromComps(comps, subject, P = PRICING) {
  const year = +subject.year || 0, km = +subject.km || 0;
  const valid = (comps || []).filter((c) => +c.prix > 1000);
  const same = valid.filter((c) => !c.annee || !year || +c.annee === year);
  const pool = same.length >= P.MIN_COMPS ? same : valid.filter((c) => !c.annee || !year || Math.abs(+c.annee - year) <= 1);
  const adjusted = pool.map((c) => {
    let prix = +c.prix;
    const yearAdj = c.annee && year ? (year - +c.annee) * (P.YEAR_PCT / 100) * prix : 0;
    let kmAdj = 0;
    if (+c.km > 0 && km > 0) {
      kmAdj = ((+c.km - km) / 10000) * (P.KM_PCT_PER_10K / 100) * prix;
      const cap = (P.KM_ADJ_CAP_PCT / 100) * prix;
      kmAdj = Math.max(-cap, Math.min(cap, kmAdj));
    }
    return { ...c, ajuste: Math.round(prix + yearAdj + kmAdj) };
  });
  if (!adjusted.length) return { retail: 0, used: [], excluded: valid.length };
  const m = median(adjusted.map((c) => c.ajuste));
  const kept = adjusted.length >= 4 ? adjusted.filter((c) => Math.abs(c.ajuste - m) <= (P.OUTLIER_PCT / 100) * m) : adjusted;
  const used = kept.length ? kept : adjusted;
  return { retail: r(median(used.map((c) => c.ajuste)), 100), used, excluded: valid.length - used.length };
}

/** Valeur wholesale tirée des offres réelles des acheteurs : chaque offre ajustée à l'année et au km du véhicule, puis médiane. */
export function wholesaleFromBids(bids, subject, P = PRICING) {
  const year = +subject.year || 0, km = +subject.km || 0;
  const adj = (bids || []).filter((b) => +b.amount > 2000).map((b) => {
    const prix = +b.amount;
    const yearAdj = b.year && year ? (year - +b.year) * (P.YEAR_PCT / 100) * prix : 0;
    let kmAdj = 0;
    if (+b.km > 0 && km > 0) { const cap = (P.KM_ADJ_CAP_PCT / 100) * prix; kmAdj = Math.max(-cap, Math.min(cap, ((+b.km - km) / 10000) * (P.KM_PCT_PER_10K / 100) * prix)); }
    return { ...b, ajuste: Math.round(prix + yearAdj + kmAdj) };
  });
  if (!adj.length) return { wholesale: 0, used: [] };
  const m = median(adj.map((b) => b.ajuste));
  const used = adj.length >= 3 ? adj.filter((b) => Math.abs(b.ajuste - m) <= (P.OUTLIER_PCT / 100) * m) : adj;
  return { wholesale: used.length ? r(median(used.map((b) => b.ajuste)), 50) : 0, used };
}

/** Écart détail → wholesale selon la demande, l'âge et le kilométrage. */
export function spreadFor(retail, { demande, year, km }, P = PRICING, now = new Date()) {
  const age = year ? now.getFullYear() - +year : 0;
  const table = year && age <= P.SPREAD_RECENT_YEARS ? P.SPREAD_PCT_RECENT : P.SPREAD_PCT;
  let pct = table[demande] ?? table.normale;
  if (age >= P.SPREAD_OLD_YEARS) pct += P.SPREAD_OLD_PCT;
  if (+km >= P.SPREAD_HIGH_KM) pct += P.SPREAD_HIGH_KM_PCT;
  const amount = r(Math.max(P.SPREAD_MIN, (pct / 100) * retail), 50);
  return { pct, amount };
}

/** Ajustements d'état, selon les réponses du questionnaire seulement (barème fixe). */
export function conditionAdjustments(a, wholesale) {
  const out = [];
  const add = (libelle, montant) => { if (montant) out.push({ libelle, montant: Math.round(montant) }); };
  const has = (k, v) => Array.isArray(a[k]) && a[k].includes(v);
  const pctOf = (p, min) => -Math.max(min, r((p / 100) * wholesale, 50));

  if (has('ext', "Petites égratignures ou bosses (moins qu'une balle de golf)")) add('Petites égratignures ou bosses', -400);
  if (has('ext', 'Bosses ou éraflures plus grandes')) add('Bosses ou éraflures', -1200);
  if (has('ext', 'Carrosserie fissurée')) add('Carrosserie fissurée', -1500);
  if (has('ext', 'Pare-brise ou vitre fissuré')) add('Pare-brise ou vitre à remplacer', -600);
  if (a.rouille === 'Légère en surface') add('Rouille légère', -500);
  if (a.rouille === 'Perforée (trous)') add('Rouille perforée', -2500);
  if (has('int', 'Taches visibles')) add('Taches à l\'intérieur', -250);
  if (has('int', 'Sièges déchirés')) add('Sièges déchirés', -600);
  if (has('int', 'Tableau de bord ou panneaux abîmés')) add('Tableau de bord ou panneaux abîmés', -500);
  if (a.odeur === 'Odeur de cigarette') add('Odeur de cigarette (traitement)', -800);
  if (a.odeur === 'Animaux ou humidité') add('Odeur d\'animaux ou d\'humidité', -600);
  if (has('voyants', 'Check engine')) add('Voyant Check engine', -1000);
  if (has('voyants', 'Freins / ABS')) add('Voyant freins / ABS', -700);
  if (has('voyants', 'Coussin gonflable')) add('Voyant coussin gonflable', -1500);
  if (has('voyants', 'Bruit, fuite ou autre')) add('Bruit ou fuite à diagnostiquer', -800);
  if (a.roulable === 'Non') add('Ne roule pas (remorquage, diagnostic)', -1000);
  // Accident déclaré (nov. 2026) : si le client donne le montant des dommages au Carfax, on enlève 25 % de ce montant.
  // Sans montant : ajustement par défaut de 4 % (min. 500 $), validé ensuite avec le rapport Carfax.
  const dmg = Math.min(200000, Number(String(a.accidentMontant ?? '').replace(/[^\d]/g, '')) || 0);
  if ((a.accidents === 'Oui' || a.accidents === '1') && dmg > 0) add(`Dommages au Carfax (25 % de ${dmg.toLocaleString('fr-CA')} $)`, -r(0.25 * dmg, 50));
  else if (a.accidents === 'Oui' || a.accidents === '1') add('Accident ou réclamation déclaré', pctOf(4, 500));
  if (a.accidents === '2 ou plus') add('2 accidents ou plus', pctOf(8, 1000));
  if (has('titre', 'Reconstruit / VGR')) add('Titre reconstruit (VGR)', pctOf(30, 2000));
  if (has('titre', 'Inondation ou feu')) add('Inondation ou feu', pctOf(50, 3000));
  if (has('titre', 'Déjà volé')) add('Déjà volé', pctOf(5, 500));
  if (has('titre', 'Ancien taxi, location ou police')) add('Ancien taxi, location ou police', pctOf(10, 1000));
  if (a.cles === '1') add('Une seule clé', -350);
  if (a.pneus === '2 ensembles (été + hiver)') add('2e ensemble de pneus', 400);
  if (a.pneusAge === 'Plus de 3 ans') add('Pneus de plus de 3 ans', -600);
  if (a.mags === 'Après-marché') add('Jantes après-marché', -300);
  if (has('modifs', 'Suspension')) add('Suspension modifiée', -800);
  if (has('modifs', 'Échappement')) add('Échappement modifié', -400);
  if (has('modifs', 'Performance')) add('Modifications de performance', -1000);
  if (has('modifs', 'Wrap / esthétique')) add('Wrap à retirer', -500);
  if (has('modifs', 'Système de son')) add('Système de son modifié', -200);
  return out;
}

export function feeFor(w, P = PRICING) {
  const t = Math.min(1, Math.max(0, (w - P.FEE_LOW_AT) / (P.FEE_HIGH_AT - P.FEE_LOW_AT)));
  return r(P.FEE_MIN + t * (P.FEE_MAX - P.FEE_MIN), 50);
}

/** Offre complète à partir du marché (comparables + demande) et des réponses. */
export function computeOffer({ market, vehicle, answers }, P = PRICING, now = new Date()) {
  const km = +answers.km || 0;
  const { retail, used, excluded } = retailFromComps(market.comps, { year: vehicle.year, km }, P);
  const bids = wholesaleFromBids(market.bids, { year: vehicle.year, km }, P);
  const nb = bids.used.length;
  if (!retail && nb < P.BIDS_MIN) return null;
  const spread = retail ? spreadFor(retail, { demande: market.demande, year: vehicle.year, km }, P, now) : { pct: 0, amount: 0 };
  const fromComps = retail ? r(retail - spread.amount, 50) : 0;
  // Source : offres réelles (3+), moyenne offres réelles + comparables (2), sinon comparables seulement
  const source = nb >= P.BIDS_MIN ? 'offres' : nb >= P.BIDS_BLEND_MIN && fromComps ? 'mixte' : 'comparables';
  const wholesale_base = source === 'offres' ? bids.wholesale : source === 'mixte' ? r((bids.wholesale + fromComps) / 2, 50) : fromComps;
  const ajustements = conditionAdjustments(answers, wholesale_base);
  const wholesale_final = Math.max(0, wholesale_base + ajustements.reduce((s, x) => s + x.montant, 0));
  const fee = feeFor(wholesale_final, P);
  const offer = Math.max(0, Math.floor((wholesale_final - fee) / 25) * 25);
  return { retail, used, excluded, spread, wholesale_comps: fromComps, bids: bids.used, wholesale_bids: bids.wholesale, source, wholesale_base, ajustements, wholesale_final, fee, offer, enough: used.length >= P.MIN_COMPS || nb >= P.BIDS_MIN };
}
