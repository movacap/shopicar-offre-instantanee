// Pont entre l'app et 360inspek (réseau Shopicar) : création du dossier, offres validées en direct, acceptation, rappel, rendez-vous, cueillette.
// Le secret partagé (SHOPICAR_LEAD_SECRET) reste côté serveur; la fonction 360inspek « shopicar-lead » le vérifie.
// Les offres sont envoyées par l'équipe Shopicar depuis la fiche du véhicule dans 360inspek (agent.shopicar.com).
import { valuate, internalView } from './_lib/valuation.js';

const FN = 'https://mffgahqikvvqdhblfrfn.supabase.co/functions/v1/shopicar-lead';
const ACTIONS = new Set(['create', 'status', 'accept', 'callback', 'pickup', 'rdv']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non permise' });
  const secret = process.env.SHOPICAR_LEAD_SECRET;
  if (!secret) return res.status(503).json({ error: 'SHOPICAR_LEAD_SECRET manque dans Vercel' });
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  if (!ACTIONS.has(b.action)) return res.status(400).json({ error: 'Action inconnue' });
  if (b.action !== 'create' && !/^[0-9a-f]{36}$/.test(String(b.token || ''))) return res.status(404).json({ error: 'not_found' });
  // Création : l'estimation et le détail interne (comparables, marge, wholesale, frais) sont recalculés ici,
  // jamais pris du navigateur (même cache de comparables, donc même prix).
  if (b.action === 'create' && b.lead) {
    try {
      const v = await valuate({ vin: b.lead.vin, vehicle: b.lead.vehicle || {}, answers: b.lead.answers || {} });
      const iv = internalView(v);
      b.lead = { ...b.lead, estimate: v.calc.offer, fee: v.calc.fee,
        valuation: { detail_comparable: iv.detail_comparable, wholesale_final: iv.wholesale_final, comparables: iv.comparables, drapeaux: (b.lead.valuation || {}).drapeaux || [] } };
    } catch (e) { console.warn('[lead] évaluation serveur impossible', e?.message || e); b.lead = { ...b.lead, valuation: { drapeaux: (b.lead.valuation || {}).drapeaux || [] } }; }
  }
  try {
    const r = await fetch(FN, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-lead-secret': secret },
      body: JSON.stringify(b),
      signal: AbortSignal.timeout(b.action === 'create' ? 45000 : 15000),
    });
    const j = await r.json().catch(() => ({ error: 'Réponse invalide' }));
    if (j && j.payload) delete j.payload.fee; // donnée interne : jamais renvoyée au téléphone du client
    res.setHeader('cache-control', 'no-store');
    return res.status(r.status).json(j);
  } catch (e) {
    return res.status(502).json({ error: 'Service indisponible' });
  }
}
