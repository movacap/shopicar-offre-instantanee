// Annonces comparables au Québec pour un véhicule, mises en cache 7 jours (Vercel Blob privé).
// Clé de cache : « squish VIN » (positions 1-8 + 10 : même modèle, version, moteur, année) + tranche de 50 000 km.
// Deux autos identiques reçoivent donc les mêmes comparables; le prix est ensuite calculé par api/_lib/pricing.js (sur le serveur seulement).
// Variables : ANTHROPIC_API_KEY, BLOB_READ_WRITE_TOKEN (store shopicar-market-cache).
import { get, put } from '@vercel/blob';
import { createHash } from 'node:crypto';

const TTL_MS = 7 * 24 * 3600 * 1000;
const MODEL = 'claude-opus-5-5';

const squishVin = (vin) => { const v = String(vin || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return v.length === 17 ? v.slice(0, 8) + v[9] : ''; };

async function readCache(path) {
  try {
    const r = await get(path, { access: 'private', useCache: false });
    if (!r || !r.stream) return null;
    return await new Response(r.stream).json();
  } catch (e) { console.warn('[market] lecture cache', e?.message || e); return null; }
}

function parseJSON(text) {
  const s = String(text || ''); const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('réponse sans JSON');
  return JSON.parse(s.slice(a, b + 1));
}

async function searchComparables(key, v, km) {
  const car = [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ');
  const today = new Date().toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' });
  const prompt = `Date : ${today}. Trouve des annonces ACTUELLES de véhicules d'occasion à vendre au Québec (Canada) comparables à :
${car} | ${v.body || ''} | ${v.engine || ''} | ${v.drivetrain || ''} | environ ${km} km

RÈGLES
- Même marque, même modèle, même génération et MÊME ANNÉE (${v.year}). Seulement s'il y en a moins de 4, ajoute l'année ${+v.year - 1} ou ${+v.year + 1}.
- Version (trim), motorisation et traction identiques ou les plus proches possible.
- Kilométrage le plus proche possible de ${km} km.
- Sources : concessionnaires, AutoHebdo, CarGurus, Kijiji Autos, AutoTrader. Prix affichés en dollars canadiens, avant taxes.
- Rapporte les annonces telles qu'elles sont : n'invente rien, ne calcule aucun prix, ne fais aucune moyenne. Retiens 5 à 10 annonces.
- "demande" : vitesse de revente de ce modèle au Québec (forte = se revend très vite, ex. RAV4, Civic, Tacoma; faible = lent, luxe qui se déprécie vite, VE).

Termine par UN SEUL objet JSON valide, rien après :
{"comparables":[{"titre":"","annee":0,"version":"","prix":0,"km":0,"ville":"","source":"","url":""}],"demande":"forte|normale|faible"}`;

  let convo = [{ role: 'user', content: prompt }]; let j;
  for (let turn = 0; turn < 4; turn++) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 6000, messages: convo,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6, user_location: { type: 'approximate', country: 'CA', region: 'Quebec', city: 'Montreal' } }] }),
    });
    j = await r.json();
    if (!r.ok) { const e = new Error(`Anthropic ${r.status} : ${j?.error?.message || 'erreur'}`); e.status = r.status; throw e; }
    if (j.stop_reason !== 'pause_turn') break;
    convo = [...convo, { role: 'assistant', content: j.content }];
  }
  const blocks = j.content || []; let start = 0;
  blocks.forEach((b, i) => { if (b.type === 'web_search_tool_result') start = i + 1; });
  let text = blocks.slice(start).filter((b) => b.type === 'text').map((b) => b.text).join('');
  if (!text.trim()) text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const out = parseJSON(text);
  const comps = (out.comparables || [])
    .filter((x) => x && x.titre && +x.prix > 1000)
    .map((x) => ({ titre: String(x.titre).slice(0, 120), annee: Math.round(+x.annee || 0), version: String(x.version || '').slice(0, 60),
      prix: Math.round(+x.prix), km: Math.round(+x.km || 0), ville: String(x.ville || '').slice(0, 40), source: String(x.source || '').slice(0, 40),
      url: /^https?:\/\//.test(x.url || '') ? String(x.url) : '' }))
    .slice(0, 10);
  const demande = ['forte', 'normale', 'faible'].includes(out.demande) ? out.demande : 'normale';
  return { comps, demande };
}

/** Comparables (cache 7 jours ou recherche). Lève une erreur avec .status en cas d'échec. */
export async function getMarket({ vin, vehicle = {}, km }) {
  const key = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!key) { const e = new Error('ANTHROPIC_API_KEY manquante ou vide sur le serveur'); e.status = 500; throw e; }
  const sq = squishVin(vin);
  const kmN = Math.max(0, Math.round(+String(km ?? '').replace(/[^\d]/g, '') || 0));
  if (!vehicle.year || !vehicle.make || !vehicle.model) { const e = new Error('année, marque et modèle requis'); e.status = 400; throw e; }
  const cacheKey = sq ? `market/${sq}-${Math.floor(kmN / 50000)}.json` : null;
  const label = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ');
  const t0 = Date.now();
  if (cacheKey && process.env.BLOB_READ_WRITE_TOKEN) {
    const hit = await readCache(cacheKey);
    // Le cache n'est valide que pour le même véhicule décodé : un ancien mauvais décodage ne doit pas resservir.
    if (hit && Date.now() - hit.fetchedAt < TTL_MS && Array.isArray(hit.comps) && String(hit.vehicle || '').toLowerCase() === label.toLowerCase()) {
      console.log('[market] cache', { cacheKey, comps: hit.comps.length });
      return { ...hit, cached: true };
    }
  }
  const m = await searchComparables(key, vehicle, kmN);
  const payload = { comps: m.comps, demande: m.demande, fetchedAt: Date.now(), vehicle: label };
  // On ne met en cache qu'un résultat exploitable : sinon le prochain essai refait la recherche.
  if (cacheKey && process.env.BLOB_READ_WRITE_TOKEN && m.comps.length >= 3) {
    try { await put(cacheKey, JSON.stringify(payload), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' }); }
    catch (e) { console.warn('[market] écriture cache', e?.message || e); }
  }
  console.log('[market] recherche', { cacheKey, comps: m.comps.length, ms: Date.now() - t0 });
  return { ...payload, cached: false };
}

/* Super Admin : clé envoyée dans l'en-tête x-admin-key, comparée par son hash SHA-256. */
export const ADMIN_HASH = 'e0ac910f1d6830f6ffd95ad74b286386e4b12f6c4f63fabd4d61fbfdb1e7f6d4';
export const isAdmin = (req) => { const k = String(req.headers['x-admin-key'] || ''); return !!k && createHash('sha256').update(k).digest('hex') === ADMIN_HASH; };
