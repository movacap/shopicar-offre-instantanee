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
    const trim = [clean(x.Trim), clean(x.Series)].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' ');
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
    console.log('[vin] ok', { vin, v: `${year} ${vehicle.make} ${model} ${trim}` });
    return res.status(200).json({ found: true, vehicle });
  } catch (e) {
    console.error('[vin] erreur', e?.message || e);
    return res.status(502).json({ error: 'Décodage NHTSA impossible : ' + (e?.message || e) });
  }
}
