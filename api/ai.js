// Fonction serverless Vercel : relaie les demandes AI de l'app vers l'API Anthropic.
// Variable d'environnement requise : ANTHROPIC_API_KEY
const MODELS = {
  quick: 'claude-haiku-5-5',     // Julia (texto)
  default: 'claude-sonnet-5-5',  // décodage du NIV, lecture de photo
  complex: 'claude-opus-5-5',    // évaluation wholesale
};
const MAX_IMAGES = 6;
const MAX_CHARS = 20000;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST seulement' });
  const key = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!key) return res.status(500).json({ error: 'ANTHROPIC_API_KEY manquante ou vide sur le serveur' });
  if (!key.startsWith('sk-ant-')) return res.status(500).json({ error: `ANTHROPIC_API_KEY mal formée (${key.length} caractères, doit commencer par sk-ant-)` });

  const { input, images = [], modelTier = 'default', web = false } = req.body || {};
  const model = MODELS[modelTier] || MODELS.default;
  const t0 = Date.now();
  console.log('[ai] demande', { modelTier, model, web: !!web, images: (images || []).length });

  let messages = typeof input === 'string' ? [{ role: 'user', content: input }] : Array.isArray(input) ? input : null;
  if (!messages || !messages.length) return res.status(400).json({ error: 'input manquant' });
  messages = messages
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  if (!messages.length || messages[messages.length - 1].role !== 'user') return res.status(400).json({ error: 'le dernier message doit venir du client' });

  const imgs = (Array.isArray(images) ? images : []).slice(0, MAX_IMAGES).filter(s => typeof s === 'string');
  if (imgs.length) {
    const last = messages[messages.length - 1];
    last.content = [
      ...imgs.map(data => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } })),
      { type: 'text', text: last.content },
    ];
  }

  // Recherche web (annonces comparables) : seulement pour l'évaluation.
  const tools = web && modelTier === 'complex'
    ? [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6, user_location: { type: 'approximate', country: 'CA', region: 'Quebec', city: 'Montreal' } }]
    : undefined;

  try {
    let convo = messages;
    let j;
    for (let turn = 0; turn < 4; turn++) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: tools ? 6000 : 2000, messages: convo, ...(tools ? { tools } : {}) }),
      });
      j = await r.json();
      if (!r.ok) { console.error('[ai] erreur Anthropic', r.status, JSON.stringify(j?.error || j).slice(0, 500)); return res.status(r.status === 429 ? 429 : 502).json({ error: `Anthropic ${r.status} : ${j?.error?.message || 'erreur'}` }); }
      console.log('[ai] réponse', { turn, stop: j.stop_reason, ms: Date.now() - t0 });
      if (j.stop_reason !== 'pause_turn') break;
      convo = [...convo, { role: 'assistant', content: j.content }];
    }
    const blocks = j.content || [];
    // Garder le texte écrit après la dernière recherche (là où se trouve le JSON final).
    let start = 0;
    blocks.forEach((b, i) => { if (b.type === 'web_search_tool_result') start = i + 1; });
    let text = blocks.slice(start).filter(b => b.type === 'text').map(b => b.text).join('');
    if (!text.trim()) text = blocks.filter(b => b.type === 'text').map(b => b.text).join('');
    console.log('[ai] ok', { ms: Date.now() - t0, chars: text.length, debut: text.slice(-300) });
    return res.status(200).json({ text });
  } catch (e) {
    console.error('[ai] exception', e?.message || e);
    return res.status(502).json({ error: 'Appel AI impossible : ' + (e?.message || e) });
  }
}
