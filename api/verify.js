// Confirmation du cellulaire par code texto.
// Le code est créé et vérifié dans la base Shopicar (fonction offer-dossier) et texté depuis la ligne Shopicar de 360inspek (fonction shopicar-lead).
// Le code ne revient jamais au navigateur : seulement { ok } à l'envoi et { ok, token } quand il est bon.
const DB = 'https://djvaddbeeascwteetdeq.supabase.co/functions/v1/offer-dossier';
const LEAD = 'https://mffgahqikvvqdhblfrfn.supabase.co/functions/v1/shopicar-lead';

const post = async (url, headers, body) => {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  const j = await r.json().catch(() => ({ error: 'Réponse invalide' }));
  return { status: r.status, j };
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non permise' });
  const dbSecret = process.env.OFFER_DB_SECRET; const leadSecret = process.env.SHOPICAR_LEAD_SECRET;
  if (!dbSecret || !leadSecret) return res.status(503).json({ error: 'config' });
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  res.setHeader('cache-control', 'no-store');
  try {
    if (b.action === 'send') {
      const c = await post(DB, { 'x-db-secret': dbSecret }, { action: 'otp-create', phone: b.phone });
      if (c.status !== 200) return res.status(c.status).json({ error: c.j.error || 'erreur' });
      const s = await post(LEAD, { 'x-lead-secret': leadSecret }, { action: 'sms-code', phone: c.j.phone, code: c.j.code });
      if (s.status !== 200) { console.warn('[verify] texto', s.status, s.j.error); return res.status(502).json({ error: 'sms' }); }
      return res.status(200).json({ ok: true });
    }
    if (b.action === 'check') {
      const c = await post(DB, { 'x-db-secret': dbSecret }, { action: 'otp-check', phone: b.phone, code: b.code });
      return res.status(c.status).json(c.j);
    }
    return res.status(400).json({ error: 'Action inconnue' });
  } catch (e) {
    return res.status(502).json({ error: 'Service indisponible' });
  }
}
