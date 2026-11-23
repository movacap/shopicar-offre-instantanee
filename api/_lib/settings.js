// Réglages du parcours rapide (« Cette offre me convient »), modifiables par le Super Admin dans l'app.
// Gardés dans Vercel Blob privé (settings/fast-track.json). Sans fichier ou sans Blob : valeurs par défaut ci-dessous.
import { get, put } from '@vercel/blob';
import { PRICING } from './pricing.js';

const PATH = 'settings/fast-track.json';
const TTL_MS = 20 * 1000; // une modification est prise en compte en moins de 20 secondes

export const DEFAULTS = {
  maxAge: 10,            // années modèle maximum (ex. 10 → 2016 et plus en 2026)
  maxKm: 200000,
  minOffer: 3000,
  maxOffer: 60000,
  useComfortList: false, // nov. 2026 : liste désactivée par défaut, toutes les marques passent (sauf luxe et camionnettes) si âge/km/prix conviennent
  listV2: true,          // marqueur : les réglages enregistrés avant nov. 2026 (liste activée) ne sont plus repris pour cette case
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
  // Marge Shopicar (Super Admin) : frais Shopicar et écart détail → wholesale. Valeurs par défaut = PRICING (api/_lib/pricing.js)
  feeMin: PRICING.FEE_MIN, feeMax: PRICING.FEE_MAX, feeLowAt: PRICING.FEE_LOW_AT, feeHighAt: PRICING.FEE_HIGH_AT,
  spreadMin: PRICING.SPREAD_MIN,
  spreadForte: PRICING.SPREAD_PCT.forte, spreadNormale: PRICING.SPREAD_PCT.normale, spreadFaible: PRICING.SPREAD_PCT.faible,
  fewCompsN: PRICING.FEW_COMPS_N, fewCompsPts: PRICING.FEW_COMPS_PTS, spreadModelTxt: PRICING.SPREAD_MODEL_TXT, spreadPriceTxt: PRICING.SPREAD_PRICE_TXT,
  carfaxPct: PRICING.CARFAX_PCT, carfaxCapPct: PRICING.CARFAX_CAP_PCT, vgaPct: PRICING.VGA_PCT,
  spreadRecentForte: PRICING.SPREAD_PCT_RECENT.forte, spreadRecentNormale: PRICING.SPREAD_PCT_RECENT.normale, spreadRecentFaible: PRICING.SPREAD_PCT_RECENT.faible,
};
const PRICE_KEYS = [['feeMin', 0, 20000], ['feeMax', 0, 20000], ['feeLowAt', 0, 500000], ['feeHighAt', 0, 1000000], ['spreadMin', 0, 50000],
  ['spreadForte', 0, 60], ['spreadNormale', 0, 60], ['spreadFaible', 0, 60], ['spreadRecentForte', 0, 60], ['spreadRecentNormale', 0, 60], ['spreadRecentFaible', 0, 60], ['carfaxPct', 0, 100], ['carfaxCapPct', 0, 100], ['vgaPct', 0, 100], ['fewCompsN', 0, 50], ['fewCompsPts', 0, 50]];

const num = (v, d, lo, hi) => { if (v === undefined || v === null || String(v).trim() === '') return d; const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n) : d; };
const words = (a) => (Array.isArray(a) ? a : String(a || '').split(',')).map((s) => String(s).trim().toLowerCase()).filter(Boolean).slice(0, 80);

/* Nettoie ce qui arrive de l'écran Super Admin (ou du fichier) : jamais de valeur invalide dans le calcul. */
export function sanitize(s = {}) {
  const D = DEFAULTS; const out = {
    maxAge: num(s.maxAge, D.maxAge, 0, 40),
    maxKm: num(s.maxKm, D.maxKm, 0, 1000000),
    minOffer: num(s.minOffer, D.minOffer, 0, 500000),
    maxOffer: num(s.maxOffer, D.maxOffer, 0, 1000000),
    useComfortList: s.listV2 && s.useComfortList !== undefined ? !!s.useComfortList : D.useComfortList,
    listV2: true,
    luxury: s.luxury === undefined ? D.luxury : words(s.luxury),
    pickupsToJulia: s.pickupsToJulia === undefined ? D.pickupsToJulia : !!s.pickupsToJulia,
    requireKnownTrim: s.requireKnownTrim === undefined ? D.requireKnownTrim : !!s.requireKnownTrim,
    comfort: {},
  };
  const src = s.comfort && typeof s.comfort === 'object' ? s.comfort : D.comfort;
  for (const [make, models] of Object.entries(src).slice(0, 80)) { const k = String(make).trim().toLowerCase(); const m = words(models); if (k && m.length) out.comfort[k] = m; }
  if (out.maxOffer < out.minOffer) out.maxOffer = out.minOffer;
  for (const [k, lo, hi] of PRICE_KEYS) out[k] = num(s[k], D[k], lo, hi);
  for (const k of ['spreadModelTxt', 'spreadPriceTxt']) out[k] = s[k] === undefined ? D[k] : String(s[k] || '').slice(0, 6000);
  if (out.feeMax < out.feeMin) out.feeMax = out.feeMin;
  if (out.feeHighAt <= out.feeLowAt) out.feeHighAt = out.feeLowAt + 1000;
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

/* Paramètres de prix (PRICING) avec la marge réglée par le Super Admin. */
export function pricingFrom(s) {
  const x = sanitize(s || {});
  return { ...PRICING, FEE_MIN: x.feeMin, FEE_MAX: x.feeMax, FEE_LOW_AT: x.feeLowAt, FEE_HIGH_AT: x.feeHighAt, SPREAD_MIN: x.spreadMin, CARFAX_PCT: x.carfaxPct, CARFAX_CAP_PCT: x.carfaxCapPct, VGA_PCT: x.vgaPct, FEW_COMPS_N: x.fewCompsN, FEW_COMPS_PTS: x.fewCompsPts, SPREAD_MODEL_TXT: x.spreadModelTxt, SPREAD_PRICE_TXT: x.spreadPriceTxt,
    SPREAD_PCT: { forte: x.spreadForte, normale: x.spreadNormale, faible: x.spreadFaible },
    SPREAD_PCT_RECENT: { forte: x.spreadRecentForte, normale: x.spreadRecentNormale, faible: x.spreadRecentFaible } };
}
