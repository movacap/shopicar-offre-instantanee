// Réglages du parcours rapide (« Cette offre me convient »), modifiables par le Super Admin dans l'app.
// Gardés dans Vercel Blob privé (settings/fast-track.json). Sans fichier ou sans Blob : valeurs par défaut ci-dessous.
import { get, put } from '@vercel/blob';

const PATH = 'settings/fast-track.json';
const TTL_MS = 20 * 1000; // une modification est prise en compte en moins de 20 secondes

export const DEFAULTS = {
  maxAge: 10,            // années modèle maximum (ex. 10 → 2016 et plus en 2026)
  maxKm: 200000,
  minOffer: 3000,
  maxOffer: 60000,
  useComfortList: true,  // false : toutes les marques et modèles (sauf luxe et camionnettes) peuvent passer
  comfort: {
    honda: ['civic', 'cr-v', 'accord', 'hr-v', 'fit'],
    toyota: ['rav4', 'corolla', 'camry', 'c-hr', 'prius'],
    tesla: ['model 3', 'model y'],
    mazda: ['mazda3', '3', 'cx-3', 'cx-30', 'cx-5'],
    hyundai: ['elantra', 'kona', 'tucson'],
    kia: ['forte', 'seltos', 'soul'],
    subaru: ['crosstrek', 'impreza', 'forester'],
    volkswagen: ['golf', 'jetta'],
    nissan: ['rogue'],
  },
  luxury: ['bmw', 'mercedes', 'mercedes-benz', 'audi', 'porsche', 'lexus', 'land rover', 'range rover', 'jaguar', 'maserati', 'genesis', 'cadillac', 'lincoln', 'infiniti', 'acura', 'volvo', 'alfa romeo', 'bentley', 'rolls-royce', 'ferrari', 'lamborghini', 'aston martin', 'mclaren', 'lotus', 'lucid', 'rivian', 'polestar'],
  pickupsToJulia: true,
  requireKnownTrim: true,
};

const num = (v, d, lo, hi) => { if (v === undefined || v === null || String(v).trim() === '') return d; const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n) : d; };
const words = (a) => (Array.isArray(a) ? a : String(a || '').split(',')).map((s) => String(s).trim().toLowerCase()).filter(Boolean).slice(0, 80);

/* Nettoie ce qui arrive de l'écran Super Admin (ou du fichier) : jamais de valeur invalide dans le calcul. */
export function sanitize(s = {}) {
  const D = DEFAULTS; const out = {
    maxAge: num(s.maxAge, D.maxAge, 0, 40),
    maxKm: num(s.maxKm, D.maxKm, 0, 1000000),
    minOffer: num(s.minOffer, D.minOffer, 0, 500000),
    maxOffer: num(s.maxOffer, D.maxOffer, 0, 1000000),
    useComfortList: s.useComfortList === undefined ? D.useComfortList : !!s.useComfortList,
    luxury: s.luxury === undefined ? D.luxury : words(s.luxury),
    pickupsToJulia: s.pickupsToJulia === undefined ? D.pickupsToJulia : !!s.pickupsToJulia,
    requireKnownTrim: s.requireKnownTrim === undefined ? D.requireKnownTrim : !!s.requireKnownTrim,
    comfort: {},
  };
  const src = s.comfort && typeof s.comfort === 'object' ? s.comfort : D.comfort;
  for (const [make, models] of Object.entries(src).slice(0, 80)) { const k = String(make).trim().toLowerCase(); const m = words(models); if (k && m.length) out.comfort[k] = m; }
  if (out.maxOffer < out.minOffer) out.maxOffer = out.minOffer;
  return out;
}

let cache = null, cacheAt = 0;
export async function loadSettings() {
  if (cache && Date.now() - cacheAt < TTL_MS) return cache;
  let raw = null;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try { const r = await get(PATH, { access: 'private', useCache: false }); if (r && r.stream) raw = await new Response(r.stream).json(); }
    catch (e) { /* pas encore de réglages : valeurs par défaut */ }
  }
  cache = sanitize(raw ? raw.settings || raw : {}); cacheAt = Date.now();
  return cache;
}

export async function saveSettings(s) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw Object.assign(new Error('BLOB_READ_WRITE_TOKEN manque dans Vercel'), { status: 503 });
  const clean = sanitize(s);
  await put(PATH, JSON.stringify({ settings: clean, updatedAt: Date.now() }), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
  cache = clean; cacheAt = Date.now();
  return clean;
}
