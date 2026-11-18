// Accès protégé par mot de passe (Vercel Routing Middleware) : toute l'app et ses API.
// Le mot de passe n'est pas dans le code : seulement son empreinte SHA-256. Après la bonne saisie, un témoin d'un an garde l'accès sur l'appareil.
// Pour retirer la protection : supprimer ce fichier ET vider DEMO_DEFAULT_HOSTS dans index.html (démo active par défaut sur ai.shopicar.com).
const COOKIE = 'sc_acces';

export const config = { matcher: ['/((?!favicon.png|logo-blanc.png).*)'] };

const enc = new TextEncoder();
const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
// Empreinte du mot de passe « shopi » (sha256 de « shopicar-acces:shopi »)
const EXPECTED = '8e439abf0ee31ea61eeea9f371791cfdab7df55089a668bd70d7bafcd1d54e1b';
// Valeur du témoin : dérivée de l'empreinte, jamais le mot de passe
const token = () => sha('cookie:' + EXPECTED);

const page = (err) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shopicar</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:Inter,-apple-system,system-ui,sans-serif;background:#000;color:#fff;min-height:100vh;display:grid;place-items:center;padding:24px}
form{width:100%;max-width:360px;display:flex;flex-direction:column;gap:14px}h1{font-size:28px;margin:0 0 4px;letter-spacing:-.03em}p{margin:0;color:#a3a3a3}
input{font-size:17px;padding:15px;border-radius:12px;border:1px solid #333;background:#111;color:#fff;width:100%}button{font-size:16px;font-weight:600;padding:15px;border:0;border-radius:12px;background:#006feb;color:#fff}
.e{color:#ff6b6b;font-size:14px}</style></head><body><form method="POST" action="/__acces"><img src="/logo-blanc.png" alt="Shopicar" style="height:30px;align-self:flex-start;margin-bottom:12px">
<h1>Accès privé</h1><p>Entre le mot de passe pour continuer.</p>${err ? '<div class="e">Mot de passe incorrect.</div>' : ''}
<input type="password" name="p" autocomplete="current-password" autofocus placeholder="Mot de passe"><input type="hidden" name="r" value=""><button>Entrer</button></form>
<script>document.querySelector('[name=r]').value=location.pathname+location.search</script></body></html>`;

export default async function middleware(req) {
  const url = new URL(req.url);
  const tok = await token();
  if (url.pathname === '/__acces' && req.method === 'POST') {
    const f = await req.formData().catch(() => null);
    const p = String(f?.get('p') || ''); let r = String(f?.get('r') || '/');
    if (!r.startsWith('/') || r.startsWith('//') || r.startsWith('/__acces')) r = '/';
    if ((await sha('shopicar-acces:' + p)) !== EXPECTED) return new Response(page(true), { status: 401, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    return new Response(null, { status: 303, headers: { location: r, 'set-cookie': `${COOKIE}=${tok}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`, 'cache-control': 'no-store' } });
  }
  const has = (req.headers.get('cookie') || '').split(/;\s*/).some((c) => c === `${COOKIE}=${tok}`);
  if (has) return; // accès accordé : la requête continue normalement
  if (url.pathname.startsWith('/api/')) return new Response(JSON.stringify({ error: 'Accès privé' }), { status: 401, headers: { 'content-type': 'application/json' } });
  return new Response(page(false), { status: 401, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
