// Réglages du parcours rapide — Super Admin seulement (en-tête x-admin-key).
// GET : réglages actuels + valeurs par défaut. POST { settings } : enregistre (Vercel Blob privé).
import { isAdmin } from './_lib/market.js';
import { DEFAULTS, loadSettings, saveSettings } from './_lib/settings.js';

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (!isAdmin(req)) return res.status(403).json({ error: 'Super Admin seulement' });
  try {
    if (req.method === 'GET') return res.status(200).json({ ok: true, settings: await loadSettings(), defaults: DEFAULTS });
    if (req.method === 'POST') {
      const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      return res.status(200).json({ ok: true, settings: await saveSettings(b.settings || {}) });
    }
    return res.status(405).json({ error: 'GET ou POST seulement' });
  } catch (e) {
    console.error('[settings]', e?.message || e);
    return res.status(e.status || 500).json({ error: e?.message || 'erreur' });
  }
}
