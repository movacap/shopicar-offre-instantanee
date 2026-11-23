// Sauvegarde des dossiers de l'app dans la base Shopicar (Supabase djvaddbeeascwteetdeq, fonction offer-dossier).
// Le secret partagé (OFFER_DB_SECRET) reste côté serveur. Chaque dossier a en plus sa propre clé, gardée sur l'appareil du client.
const FN = 'https://djvaddbeeascwteetdeq.supabase.co/functions/v1/offer-dossier';
import { isAdmin } from './_lib/market.js';
const ACTIONS = new Set(['save', 'file', 'file-rm', 'garage', 'admin-cancels', 'admin-cancel-set']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non permise' });
  const secret = process.env.OFFER_DB_SECRET;
  if (!secret) return res.status(503).json({ error: 'OFFER_DB_SECRET manque dans Vercel' });
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  if (!ACTIONS.has(b.action)) return res.status(400).json({ error: 'Action inconnue' });
  if (b.action.startsWith('admin-') && !isAdmin(req)) return res.status(403).json({ error: 'Super Admin seulement' });
  try {
    const r = await fetch(FN, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-db-secret': secret },
      body: JSON.stringify(b),
      signal: AbortSignal.timeout(30000),
    });
    const j = await r.json().catch(() => ({ error: 'Réponse invalide' }));
    res.setHeader('cache-control', 'no-store');
    return res.status(r.status).json(j);
  } catch (e) {
    return res.status(502).json({ error: 'Service indisponible' });
  }
}
