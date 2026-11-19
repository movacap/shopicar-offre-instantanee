// Parcours rapide : le client peut accepter son offre initiale directement (validation par un conseiller ensuite)
// SEULEMENT pour les véhicules avec lesquels Shopicar est confortable. Tout le reste passe par photos + dommages + Julia.
// Liste à ajuster ici : marque → modèles acceptés (comparaison sans accents ni tirets, début du nom du modèle).

export const COMFORT = {
  honda: ['civic', 'cr-v', 'accord', 'hr-v', 'fit'],
  toyota: ['rav4', 'corolla', 'camry', 'c-hr', 'prius'],
  tesla: ['model 3', 'model y'],
  mazda: ['mazda3', '3', 'cx-3', 'cx-30', 'cx-5'],
  hyundai: ['elantra', 'kona', 'tucson'],
  kia: ['forte', 'seltos', 'soul'],
  subaru: ['crosstrek', 'impreza', 'forester'],
  volkswagen: ['golf', 'jetta'],
  nissan: ['rogue'],
};

export const RULES = {
  MAX_AGE: 10,          // années modèle (ex. 2016+ en 2026)
  MAX_KM: 200000,
  MIN_OFFER: 3000,
  MAX_OFFER: 60000,
};

// Versions de performance ou d'exception : jamais en parcours rapide, même si le modèle est dans la liste.
const EXCEPTION_TRIM = /type\s*r|\bsi\b|\bgti\b|golf\s*r\b|\bsti\b|\bwrx\b|nismo|\bn\b(?!\s*line)/i;
const PICKUP = /camionnette|pickup|pick-up/i;
const LUXURY = /^(bmw|mercedes|mercedes-benz|audi|porsche|lexus|land rover|range rover|jaguar|maserati|genesis|cadillac|lincoln|infiniti|acura|volvo|alfa romeo|bentley|rolls-royce|ferrari|lamborghini|aston martin|mclaren|lotus|lucid|rivian|polestar)$/i;

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s_]+/g, ' ').trim();
const squash = (s) => norm(s).replace(/[\s-]/g, '');

/* raison : 'categorie' (catégorie difficile à évaluer), 'etat' (état déclaré à confirmer en photos), 'donnees' (peu de données de marché) */
export function fastTrack({ vehicle = {}, answers = {}, calc = {}, market = {} }) {
  const make = norm(vehicle.make), model = norm(vehicle.model), trim = String(vehicle.trim || '');
  const no = (raison, detail) => ({ ok: false, raison, detail });

  if (PICKUP.test(vehicle.body || '') || /f-?150|silverado|sierra|ram\b|tacoma|tundra|ridgeline|frontier|colorado|canyon|ranger|maverick|gladiator|santa cruz|cybertruck/i.test(model)) return no('categorie', 'camionnette');
  if (LUXURY.test(make)) return no('categorie', 'luxe');
  const list = COMFORT[make];
  if (!list || !list.some((m) => squash(model).startsWith(squash(m)))) return no('categorie', 'hors liste');
  if (market.special || vehicle.edition_speciale || EXCEPTION_TRIM.test(trim)) return no('categorie', 'édition spéciale ou performance');
  if (vehicle.trimUnknown || (Array.isArray(vehicle.trims) && vehicle.trims.length && !trim.trim())) return no('categorie', 'version à confirmer');

  const year = +vehicle.year || 0; const km = Number(String(answers.km ?? '').replace(/[^\d]/g, '')) || 0;
  if (!year || new Date().getFullYear() - year > RULES.MAX_AGE) return no('categorie', 'âge');
  if (km > RULES.MAX_KM) return no('categorie', 'kilométrage');

  const has = (k, none) => (answers[k] || []).some((x) => x !== none);
  if (answers.roulable === 'Non') return no('etat', 'ne roule pas');
  if (has('titre', 'Rien à déclarer')) return no('etat', 'historique');
  if (has('voyants', 'Aucun voyant')) return no('etat', 'voyants');
  if (has('modifs', "Aucune, tout d'origine")) return no('etat', 'modifications');
  if (['2 ou plus', 'Je ne sais pas'].includes(answers.accidents)) return no('etat', 'accidents');
  if (answers.rouille === 'Perforée (trous)') return no('etat', 'rouille');
  if ((answers.ext || []).includes('Carrosserie fissurée')) return no('etat', 'carrosserie');

  if (!calc.enough) return no('donnees', 'peu de comparables');
  if (!(calc.offer >= RULES.MIN_OFFER && calc.offer <= RULES.MAX_OFFER)) return no('categorie', 'valeur');
  return { ok: true };
}
