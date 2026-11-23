// Évaluation sur le serveur : comparables (cache 7 jours) + api/_lib/pricing.js. Plus les offres réelles des acheteurs du réseau (360inspek) quand il y en a.
// clientView : seulement ce que le particulier voit (offre, offre avant ajustements, ajustements d'état déclarés).
// internalView : marge, valeur wholesale, frais et comparables, pour le Super Admin et la fiche 360inspek seulement.
import { getMarket } from './market.js';
import { computeOffer } from './pricing.js';
import { loadSettings, pricingFrom } from './settings.js';

const DEMANDE_TXT = { forte: 'se revend très vite', normale: 'se revend dans un délai normal', faible: 'se revend plus lentement' };

/* Offres réelles des acheteurs du réseau Shopicar (360inspek, fonction shopicar-bids), 120 derniers jours. Jamais bloquant. */
async function getBids(v) {
  const secret = process.env.SHOPICAR_LEAD_SECRET; if (!secret || !v || !v.make || !v.model || !v.year) return [];
  try {
    const r = await fetch('https://mffgahqikvvqdhblfrfn.supabase.co/functions/v1/shopicar-bids', {
      method: 'POST', signal: AbortSignal.timeout(6000), headers: { 'content-type': 'application/json', 'x-lead-secret': secret },
      body: JSON.stringify({ make: v.make, model: v.model, year: v.year }) });
    const j = await r.json(); return r.ok && Array.isArray(j.bids) ? j.bids : [];
  } catch (e) { console.warn('[valuation] offres réseau', e?.message || e); return []; }
}

export async function valuate({ vin, vehicle, answers }) {
  const [m, bids, settings] = await Promise.all([getMarket({ vin, vehicle, km: answers && answers.km }), getBids(vehicle), loadSettings().catch(() => ({}))]);
  const market = { ...m, bids };
  const a = { ...(answers || {}), km: Number(String((answers && answers.km) ?? '').replace(/[^\d]/g, '')) || 0 };
  const calc = computeOffer({ market, vehicle, answers: a }, pricingFrom(settings));
  if (!calc) { const e = new Error('aucune annonce comparable trouvée'); e.status = 422; throw e; }
  return { calc, market, km: a.km };
}

export function clientView({ calc }) {
  const adj = calc.ajustements.map((x) => ({ libelle: x.libelle, montant: x.montant }));
  const sum = adj.reduce((s, x) => s + x.montant, 0);
  return { estimate: calc.offer, enough: calc.enough, base: adj.length ? calc.offer - sum : calc.offer, ajustements: adj };
}

export function internalView({ calc, market, km }) {
  const d = DEMANDE_TXT[market.demande] || DEMANDE_TXT.normale;
  return {
    comparables: calc.used.map((x) => ({ titre: x.titre, prix: x.prix, km: x.km, ville: x.ville, source: x.source, url: x.url })),
    detail_comparable: calc.retail, recon: calc.spread.amount, spread_pct: calc.spread.pct, demande: market.demande,
    wholesale_base: calc.wholesale_base, ajustements: calc.ajustements, wholesale_final: calc.wholesale_final, fee: calc.fee, offer: calc.offer,
    market_at: market.fetchedAt, excluded: calc.excluded, version_identifiee: market.version || null, edition_speciale: !!market.special,
    source_wholesale: calc.source, wholesale_comparables: calc.wholesale_comps || null, wholesale_offres_reseau: calc.wholesale_bids || null,
    offres_reseau: (calc.bids || []).map((b) => ({ annee: b.year, version: b.trim, km: b.km, offre: b.amount, ajustee: b.ajuste, date: b.at })),
    methode_wholesale: `${calc.source === 'offres' ? `Valeur wholesale = médiane de ${calc.bids.length} offre(s) réelle(s) d'acheteurs du réseau pour ce modèle (120 derniers jours), ajustées à l'année et au km. ` : calc.source === 'mixte' ? `Valeur wholesale = moyenne entre ${calc.bids.length} offre(s) réelle(s) du réseau (${calc.wholesale_bids} $) et le calcul par comparables (${calc.wholesale_comps} $). ` : ''}${market.version ? `Version identifiée par le NIV : ${market.version}${market.special ? ' (édition spéciale)' : ''}. ` : ''}Prix de détail = médiane de ${calc.used.length} annonce(s) au Québec, chacune ajustée au kilométrage${calc.excluded ? ` (${calc.excluded} annonce(s) trop loin du marché retirée(s))` : ''}. Ce modèle ${d} : le concessionnaire garde ${calc.spread.pct} % pour sa marge et la remise en état.`,
    facteurs: [`${calc.used.length} annonce(s) comparable(s) au Québec, prix ajustés à ${Number(km).toLocaleString('fr-CA')} km.`,
      `Écart détail → wholesale de ${calc.spread.pct} % : ce modèle ${d}${(calc.spread.raisons || []).length ? ` (dont ${calc.spread.raisons.join(', ')})` : ''}.`,
      calc.ajustements.length ? `Ajustements selon les réponses : ${calc.ajustements.map((x) => x.libelle.toLowerCase()).join(', ')}.` : 'Aucun ajustement d\'état selon les réponses.'],
  };
}
