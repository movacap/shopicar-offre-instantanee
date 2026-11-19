// Parcours rapide : le client peut accepter son offre initiale directement (validation par un conseiller ensuite)
// SEULEMENT pour les véhicules avec lesquels Shopicar est confortable. Tout le reste passe par photos + dommages + Julia.
// Les seuils (âge, km, valeur), la liste des modèles et la liste luxe se règlent dans l'app (Super Admin → Réglages),
// voir api/_lib/settings.js. Un modèle inscrit dans la liste de confiance passe même si sa marque est dans la liste luxe.
import { DEFAULTS } from './settings.js';
export const COMFORT = DEFAULTS.comfort;
export const RULES = { MAX_AGE: DEFAULTS.maxAge, MAX_KM: DEFAULTS.maxKm, MIN_OFFER: DEFAULTS.minOffer, MAX_OFFER: DEFAULTS.maxOffer };

// Versions de performance ou d'exception : jamais en parcours rapide, même si le modèle est dans la liste.
const EXCEPTION_TRIM = /type\s*r|\bsi\b|\bgti\b|golf\s*r\b|\bsti\b|\bwrx\b|nismo|\bn\b(?!\s*line)/i;
const PICKUP = /camionnette|pickup|pick-up/i;

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s_]+/g, ' ').trim();
const squash = (s) => norm(s).replace(/[\s-]/g, '');

/* raison : 'categorie' (catégorie difficile à évaluer), 'etat' (état déclaré à confirmer en photos), 'donnees' (peu de données de marché) */
export function fastTrack({ vehicle = {}, answers = {}, calc = {}, market = {}, settings = DEFAULTS }) {
  const S = settings || DEFAULTS;
  const make = norm(vehicle.make), model = norm(vehicle.model), trim = String(vehicle.trim || '');
  const no = (raison, detail) => ({ ok: false, raison, detail });

  if (S.pickupsToJulia && (PICKUP.test(vehicle.body || '') || /f-?150|silverado|sierra|ram\b|tacoma|tundra|ridgeline|frontier|colorado|canyon|ranger|maverick|gladiator|santa cruz|cybertruck/i.test(model))) return no('categorie', 'camionnette');
  const list = (S.comfort || {})[make];
  const listed = !!(list && list.some((m) => squash(model).startsWith(squash(m))));
  if (!listed && (S.luxury || []).some((l) => norm(l) === make)) return no('categorie', 'luxe');
  if (S.useComfortList && !listed) return no('categorie', 'hors liste');
  if (market.special || vehicle.edition_speciale || EXCEPTION_TRIM.test(trim)) return no('categorie', 'édition spéciale ou performance');
  if (S.requireKnownTrim && (vehicle.trimUnknown || (Array.isArray(vehicle.trims) && vehicle.trims.length && !trim.trim()))) return no('categorie', 'version à confirmer');

  const year = +vehicle.year || 0; const km = Number(String(answers.km ?? '').replace(/[^\d]/g, '')) || 0;
  if (!year || new Date().getFullYear() - year > S.maxAge) return no('categorie', 'âge');
  if (km > S.maxKm) return no('categorie', 'kilométrage');

  const has = (k, none) => (answers[k] || []).some((x) => x !== none);
  if (answers.roulable === 'Non') return no('etat', 'ne roule pas');
  if (has('titre', 'Rien à déclarer')) return no('etat', 'historique');
  if (has('voyants', 'Aucun voyant')) return no('etat', 'voyants');
  if (has('modifs', "Aucune, tout d'origine")) return no('etat', 'modifications');
  if (['2 ou plus', 'Je ne sais pas'].includes(answers.accidents)) return no('etat', 'accidents');
  if (answers.rouille === 'Perforée (trous)') return no('etat', 'rouille');
  if ((answers.ext || []).includes('Carrosserie fissurée')) return no('etat', 'carrosserie');

  if (!calc.enough) return no('donnees', 'peu de comparables');
  if (!(calc.offer >= S.minOffer && calc.offer <= S.maxOffer)) return no('categorie', 'valeur');
  return { ok: true };
}
