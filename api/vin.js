// Décodage du NIV par la base officielle NHTSA vPIC (gratuite, sans clé).
// Source de vérité pour l'année, la marque, le modèle et la version : l'AI ne devine plus le véhicule.
const DRIVE = {
  'AWD/All-Wheel Drive': 'Traction intégrale', '4WD/4-Wheel Drive/4x4': '4x4', '4x2': 'Traction avant',
  'FWD/Front-Wheel Drive': 'Traction avant', 'RWD/Rear-Wheel Drive': 'Propulsion',
};
const BODY = [
  [/sport utility|SUV|MPV/i, 'VUS'], [/sedan|saloon/i, 'Berline'], [/pickup/i, 'Camionnette'],
  [/hatchback/i, 'Hatchback'], [/coupe/i, 'Coupé'], [/convertible/i, 'Décapotable'], [/minivan/i, 'Fourgonnette'], [/van/i, 'Fourgon'], [/wagon/i, 'Familiale'],
];
import { get, put } from '@vercel/blob';

/* Version exacte : la NHTSA ne distingue pas toujours les éditions spéciales (ex. une MINI JCW GP sort « Hardtop JCW »).
   On cherche le début du NIV (positions 1-8 + année) sur le web, sans jamais changer la marque, le modèle ni l'année.
   On ne garde la version que si une source la confirme. Résultat gardé 30 jours par début de NIV (Vercel Blob privé). */
const REFINE_TTL = 30 * 24 * 3600 * 1000;
async function refineVersion(vin, v) {
  const key = (process.env.ANTHROPIC_API_KEY || '').trim(); if (!key) return null;
  const path = `vin-version/v2/${vin.slice(0, 8)}${vin[9]}.json`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try { const r = await get(path, { access: 'private', useCache: false }); if (r && r.stream) { const hit = await new Response(r.stream).json(); if (Date.now() - hit.at < REFINE_TTL) return hit.v; } } catch (e) { /* pas en cache */ }
  }
  const prompt = `NIV : ${vin}. Décodage officiel NHTSA : ${v.year} ${v.make} ${v.model} ${v.trim || ''}.
Cherche sur le web les 8 premiers caractères « ${vin.slice(0, 8)} » avec l'année ${v.year} pour trouver la VERSION EXACTE : édition spéciale ou limitée (ex. John Cooper Works GP, Type R, Raptor, TRD Pro, Shelby, GT3), ou version courante.
Ne change jamais la marque, le modèle ni l'année. N'invente rien : si aucune source ne confirme, réponds avec la version donnée et "confirme": false.
Liste aussi les versions offertes AU CANADA pour ce ${v.year} ${v.make} ${v.model} avec la même motorisation et la même traction, avec les NOMS CANADIENS (souvent différents des noms américains de la NHTSA, ex. Hyundai Essential/Preferred/Luxury/Ultimate au lieu de SE/SEL/Limited). Seulement des versions confirmées par une source, sinon une liste vide.
Termine par UN SEUL objet JSON : {"version":"nom court de la version, en français si possible","edition_speciale":true|false,"confirme":true|false,"source":"url","versions_canada":["..."]}`;
  try {
    let convo = [{ role: 'user', content: prompt }], j;
    for (let t = 0; t < 3; t++) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: AbortSignal.timeout(35000),
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 1500, messages: convo, tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }] }),
      });
      j = await r.json(); if (!r.ok) throw new Error(j?.error?.message || r.status);
      if (j.stop_reason !== 'pause_turn') break;
      convo = [...convo, { role: 'assistant', content: j.content }];
    }
    const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    const a = text.lastIndexOf('{'), b = text.lastIndexOf('}');
    const out = JSON.parse(text.slice(a, b + 1));
    const ok = out.confirme === true && out.version && /^https?:\/\//.test(out.source || '');
    const trims = (Array.isArray(out.versions_canada) ? out.versions_canada : []).map((t) => String(t || '').replace(/\s*\(.*\)\s*$/, '').trim().slice(0, 40)).filter(Boolean).filter((t, i, a) => a.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i).slice(0, 8);
    const res = ok ? { version: String(out.version).slice(0, 60), special: out.edition_speciale === true, source: out.source, trims } : { version: null, trims };
    if (process.env.BLOB_READ_WRITE_TOKEN) { try { await put(path, JSON.stringify({ at: Date.now(), v: res }), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' }); } catch (e) { /* cache facultatif */ } }
    return res;
  } catch (e) { console.warn('[vin] version', e?.message || e); return null; }
}

/* Tesla : la NHTSA ne donne souvent pas la version. Le 8e caractère du NIV identifie les moteurs (code Tesla public) :
   A/D = 1 moteur arrière (RWD), B/E = 2 moteurs (Long Range / AWD), C/F = 2 moteurs Performance. Model S/X exclus (codes différents). */
function teslaVersion(vin, model) {
  if (!/model\s*[3y]/i.test(model || '')) return null;
  const c = vin[7];
  if ('AD'.includes(c)) return { trim: 'RWD', drivetrain: 'Propulsion' };
  if ('BE'.includes(c)) return { trim: 'Long Range AWD', drivetrain: 'Traction intégrale' };
  if ('CF'.includes(c)) return { trim: 'Performance AWD', drivetrain: 'Traction intégrale' };
  return null;
}

// La NHTSA renvoie parfois plusieurs versions pour un même début de NIV (ex. « SEL, SEL Plus ») : on les sépare.
const splitTrims = (s) => String(s || '').split(/\s*[,;]\s*|\s+\/\s+|\s+or\s+/i).map((t) => t.trim()).filter(Boolean);
const clean = (s) => { const t = String(s ?? '').trim(); return !t || /^(not applicable|null|0)$/i.test(t) ? '' : t; };

export default async function handler(req, res) {
  const vin = String((req.query && req.query.vin) || (req.body && req.body.vin) || '').toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
  if (vin.length !== 17) return res.status(400).json({ error: 'NIV de 17 caractères requis' });
  try {
    const r = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${vin}?format=json`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`vPIC ${r.status}`);
    const x = ((await r.json()).Results || [])[0] || {};
    const make = clean(x.Make), model = clean(x.Model), year = +clean(x.ModelYear) || null;
    if (!make || !model || !year) {
      console.warn('[vin] incomplet', { vin, make, model, year, err: x.ErrorText });
      return res.status(200).json({ found: false, partial: { year, make: make ? make[0] + make.slice(1).toLowerCase() : '' } });
    }
    const tOpts = splitTrims(clean(x.Trim)), sOpts = splitTrims(clean(x.Series));
    const nhtsaOpts = tOpts.length > 1 ? tOpts : sOpts.length > 1 ? sOpts : [];
    const trim = nhtsaOpts.length ? '' : [clean(x.Trim), clean(x.Series)].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' ');
    const disp = +clean(x.DisplacementL); const cyl = clean(x.EngineCylinders);
    const elec = clean(x.ElectrificationLevel);
    const fuel = /plug-in|PHEV/i.test(elec) ? 'hybride rechargeable' : /BEV|battery electric/i.test(elec) ? 'électrique' : /hybrid|HEV/i.test(elec) ? 'hybride' : '';
    const engine = [disp ? `${disp.toFixed(1)} L` : '', cyl ? `${cyl} cyl.` : '', /turbo/i.test(clean(x.Turbo)) || /yes/i.test(clean(x.Turbo)) ? 'turbo' : '', fuel].filter(Boolean).join(' ');
    const bodyRaw = clean(x.BodyClass);
    const body = (BODY.find(([re]) => re.test(bodyRaw)) || [null, bodyRaw])[1];
    const tr = clean(x.TransmissionStyle);
    const vehicle = {
      year, make: make.split(/[\s-]/).map((w) => w[0] + w.slice(1).toLowerCase()).join(make.includes('-') ? '-' : ' '),
      model, trim, body, engine, drivetrain: DRIVE[clean(x.DriveType)] || clean(x.DriveType),
      transmission: tr ? (/manual/i.test(tr) ? 'Manuelle' : 'Automatique') : '',
      confiance: trim ? 'haute' : 'moyenne', notes: trim ? '' : 'Version non précisée par le NIV : confirme-la ci-dessous.', source: 'nhtsa',
    };
    if (nhtsaOpts.length) vehicle.trims = nhtsaOpts;
    if (/tesla/i.test(make) && !vehicle.trim) { const t = teslaVersion(vin, model); if (t) { vehicle.trim = t.trim; vehicle.drivetrain = t.drivetrain; vehicle.confiance = 'haute'; vehicle.notes = ''; } }
    // Édition spéciale confirmée par une source : elle remplace la version NHTSA (le client peut encore corriger)
    const ref = await refineVersion(vin, vehicle);
    if (ref && ref.version && ref.special) { ref.version = ref.version.replace(/\s*\(.*\)\s*$/, '').trim(); vehicle.trim = ref.version; vehicle.confiance = 'haute'; vehicle.notes = `Édition spéciale identifiée avec ton NIV : ${ref.version}.`; vehicle.edition_speciale = true; }
    // Version courante confirmée par une source : seulement si la NHTSA n'en donne aucune
    else if (ref && ref.version && !vehicle.trim) { vehicle.trim = ref.version.replace(/\s*\(.*\)\s*$/, '').trim(); vehicle.confiance = 'haute'; vehicle.notes = ''; }
    // Versions canadiennes : liste à choisir. Si la version NHTSA (souvent un nom américain) n'y figure pas, le client doit choisir.
    if (!vehicle.edition_speciale && ref && ref.trims && ref.trims.length) {
      vehicle.trims = ref.trims;
      if (vehicle.trim && !ref.trims.some((t) => t.toLowerCase() === vehicle.trim.toLowerCase())) vehicle.trim = '';
    }
    if (vehicle.trims && vehicle.trims.length && !vehicle.trim) { vehicle.trim_a_choisir = true; vehicle.confiance = 'moyenne'; vehicle.notes = 'Ton NIV ne précise pas la version exacte : choisis la tienne ci-dessous.'; }
    console.log('[vin] ok', { vin, v: `${year} ${vehicle.make} ${model} ${vehicle.trim}`, ref });
    return res.status(200).json({ found: true, vehicle });
  } catch (e) {
    console.error('[vin] erreur', e?.message || e);
    return res.status(502).json({ error: 'Décodage NHTSA impossible : ' + (e?.message || e) });
  }
}
