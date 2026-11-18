// Évaluation sur le serveur : comparables (cache 7 jours) + api/_lib/pricing.js. Mêmes règles qu'avant, aucun prix modifié.
// clientView : seulement ce que le particulier voit (offre, offre avant ajustements, ajustements d'état déclarés).
// internalView : marge, valeur wholesale, frais et comparables, pour le Super Admin et la fiche 360inspek seulement.
import { getMarket } from './market.js';
import { computeOffer } from './pricing.js';

const DEMANDE_TXT = { forte: 'se revend très vite', normale: 'se revend dans un délai normal', faible: 'se revend plus lentement' };

export async function valuate({ vin, vehicle, answers }) {
  const market = await getMarket({ vin, vehicle, km: answers && answers.km });
  const a = { ...(answers || {}), km: Number(String((answers && answers.km) ?? '').replace(/[^\d]/g, '')) || 0 };
  const calc = computeOffer({ market, vehicle, answers: a });
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
    market_at: market.fetchedAt, excluded: calc.excluded,
    methode_wholesale: `Prix de détail = médiane de ${calc.used.length} annonce(s) au Québec, chacune ajustée au kilométrage${calc.excluded ? ` (${calc.excluded} annonce(s) trop loin du marché retirée(s))` : ''}. Ce modèle ${d} : le concessionnaire garde ${calc.spread.pct} % pour sa marge et la remise en état.`,
    facteurs: [`${calc.used.length} annonce(s) comparable(s) au Québec, prix ajustés à ${Number(km).toLocaleString('fr-CA')} km.`,
      `Écart détail → wholesale de ${calc.spread.pct} % : ce modèle ${d}.`,
      calc.ajustements.length ? `Ajustements selon les réponses : ${calc.ajustements.map((x) => x.libelle.toLowerCase()).join(', ')}.` : 'Aucun ajustement d\'état selon les réponses.'],
  };
}
