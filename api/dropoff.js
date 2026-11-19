// Agents de dépôt les plus proches du code postal du client (distance à vol d'oiseau).
// Coordonnées : centre de chaque région postale du Québec (api/_lib/fsa-qc.js, tiré des données publiques de Postes Canada).
// GET /api/dropoff?postal=H2X1Y4[&demo=1]  →  { agents: [{ ...agent, km }], source: 'reseau'|'demo'|'aucun' }
import { DROPOFF_AGENTS, DEMO_AGENTS } from './_lib/dropoff-agents.js';
import FSA from './_lib/fsa-qc.js';

const fsaOf = (p) => String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
const coords = (a) => (Number.isFinite(a.lat) && Number.isFinite(a.lng) ? [a.lat, a.lng] : FSA[fsaOf(a.postal)] || null);
const km = ([la1, lo1], [la2, lo2]) => {
  const r = Math.PI / 180, dLa = (la2 - la1) * r, dLo = (lo2 - lo1) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

export default function handler(req, res) {
  const here = FSA[fsaOf(req.query.postal)];
  const list = DROPOFF_AGENTS.length ? DROPOFF_AGENTS : req.query.demo === '1' ? DEMO_AGENTS : [];
  const source = DROPOFF_AGENTS.length ? 'reseau' : list.length ? 'demo' : 'aucun';
  res.setHeader('cache-control', 'no-store');
  if (!here) return res.status(200).json({ agents: [], source, error: 'code_postal' });
  const agents = list
    .map((a) => { const c = coords(a); return c ? { ...a, lat: undefined, lng: undefined, km: Math.round(km(here, c)) } : null; })
    .filter(Boolean)
    .sort((a, b) => a.km - b.km)
    .slice(0, 3);
  return res.status(200).json({ agents, source });
}
