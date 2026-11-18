// Pont entre l'app et 360inspek (réseau Shopicar) : création du dossier, offres validées en direct, acceptation, rappel, cueillette.
// Le secret partagé (SHOPICAR_LEAD_SECRET) reste côté serveur; la fonction 360inspek « shopicar-lead » le vérifie.
// Les offres sont envoyées par l'équipe Shopicar depuis la fiche du véhicule dans 360inspek (agent.shopicar.com).
const FN = 'https://mffgahqikvvqdhblfrfn.supabase.co/functions/v1/shopicar-lead';
const ACTIONS = new Set(['create', 'status', 'accept', 'callback', 'pickup']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non permise' });
  const secret = process.env.SHOPICAR_LEAD_SECRET;
  if (!secret) return res.status(503).json({ error: 'SHOPICAR_LEAD_SECRET manque dans Vercel' });
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  if (!ACTIONS.has(b.action)) return res.status(400).json({ error: 'Action inconnue' });
  if (b.action !== 'create' && !/^[0-9a-f]{36}$/.test(String(b.token || ''))) return res.status(404).json({ error: 'not_found' });
  try {
    const r = await fetch(FN, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-lead-secret': secret },
      body: JSON.stringify(b),
      signal: AbortSignal.timeout(b.action === 'create' ? 55000 : 15000),
    });
    const j = await r.json().catch(() => ({ error: 'Réponse invalide' }));
    res.setHeader('cache-control', 'no-store');
    return res.status(r.status).json(j);
  } catch (e) {
    return res.status(502).json({ error: 'Service indisponible' });
  }
}
