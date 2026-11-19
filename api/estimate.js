// Estimation du particulier, calculée sur le serveur.
// Au client : l'offre, l'offre avant ajustements et les ajustements d'état déclarés. Jamais la marge, la valeur wholesale, les frais ni les comparables.
// Super Admin (en-tête x-admin-key) : en plus, le détail interne (internal).
import { isAdmin } from './_lib/market.js';
import { valuate, clientView, internalView } from './_lib/valuation.js';
import { fastTrack } from './_lib/eligibility.js';
import { loadSettings } from './_lib/settings.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST seulement' });
  const { vin, vehicle = {}, answers = {} } = req.body || {};
  try {
    const v = await valuate({ vin, vehicle, answers });
    const ft = fastTrack({ vehicle, answers, calc: v.calc, market: v.market, settings: await loadSettings() });
    const out = { ok: true, ...clientView(v), fastTrack: { ok: ft.ok, raison: ft.raison || null } };
    if (isAdmin(req)) out.fastTrackDetail = ft.detail || null;
    if (isAdmin(req)) out.internal = internalView(v);
    res.setHeader('cache-control', 'no-store');
    return res.status(200).json(out);
  } catch (e) {
    console.error('[estimate]', e?.message || e);
    const s = e.status === 429 ? 429 : e.status === 400 || e.status === 422 ? e.status : /ANTHROPIC_API_KEY/.test(e?.message || '') ? 500 : 502;
    return res.status(s).json({ error: e?.message || 'erreur' });
  }
}
