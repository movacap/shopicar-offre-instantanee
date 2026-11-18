// Annonces comparables brutes : réservé au Super Admin (en-tête x-admin-key).
// L'app du client passe par api/estimate.js, qui ne renvoie jamais les comparables, marges ni frais.
import { getMarket, isAdmin } from './_lib/market.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST seulement' });
  if (!isAdmin(req)) return res.status(403).json({ error: 'Accès refusé' });
  try { return res.status(200).json(await getMarket(req.body || {})); }
  catch (e) { return res.status(e.status === 429 ? 429 : e.status || 502).json({ error: 'Recherche du marché impossible : ' + (e?.message || e) }); }
}
