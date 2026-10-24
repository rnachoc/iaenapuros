// Configuración única de TikTok (Login Kit for Desktop con PKCE).
// Requiere en .env: TIKTOK_CLIENT_KEY y TIKTOK_CLIENT_SECRET de tu app de developers.tiktok.com,
// con la redirect URI http://127.0.0.1:3455/callback/ registrada y el permiso video.upload.
// Abre el navegador, recoge el código en un servidor local y guarda los tokens en .env. Nunca los imprime.
import crypto from 'node:crypto';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { loadEnv } from './lib/common.mjs';
import { tokenRequest, saveTokens } from './lib/tiktok.mjs';

const REDIRECT = 'http://127.0.0.1:3455/callback/';
const env = loadEnv();
if (!env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET) {
  console.error('Falta TIKTOK_CLIENT_KEY o TIKTOK_CLIENT_SECRET en .env (docs/MANUAL.md, TikTok)');
  process.exit(1);
}

// PKCE: TikTok Desktop pide el challenge como SHA-256 en hexadecimal
const verifier = crypto.randomBytes(48).toString('base64url').slice(0, 64);
const challenge = crypto.createHash('sha256').update(verifier).digest('hex');
const state = crypto.randomBytes(16).toString('hex');
const auth = new URL('https://www.tiktok.com/v2/auth/authorize/');
auth.search = new URLSearchParams({
  client_key: env.TIKTOK_CLIENT_KEY,
  response_type: 'code',
  scope: 'user.info.basic,video.upload',
  redirect_uri: REDIRECT,
  state,
  code_challenge: challenge,
  code_challenge_method: 'S256',
}).toString();

const code = await new Promise((resolve, reject) => {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1:3455');
    if (u.pathname !== '/callback/') return res.writeHead(404).end();
    const fail = u.searchParams.get('error');
    const ok = !fail && u.searchParams.get('state') === state && u.searchParams.get('code');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(ok ? '<h2>TikTok conectado. Ya puedes cerrar esta pestaña.</h2>' : `<h2>Error: ${fail || 'estado no válido'}</h2>`);
    server.close();
    ok ? resolve(decodeURIComponent(u.searchParams.get('code'))) : reject(new Error(u.searchParams.get('error_description') || fail || 'estado no válido'));
  });
  server.listen(3455, '127.0.0.1', () => {
    console.log('Abriendo TikTok en el navegador para autorizar la app…');
    if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', auth.toString()], { stdio: 'ignore' });
    else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [auth.toString()], { stdio: 'ignore' });
  });
  setTimeout(() => reject(new Error('no se completó la autorización en 5 minutos')), 300000);
});

const t = await tokenRequest({
  client_key: env.TIKTOK_CLIENT_KEY,
  client_secret: env.TIKTOK_CLIENT_SECRET,
  code,
  grant_type: 'authorization_code',
  redirect_uri: REDIRECT,
  code_verifier: verifier,
});
if (!String(t.scope || '').includes('video.upload')) {
  console.error('La autorización no incluye video.upload: revisa los productos y permisos de la app en developers.tiktok.com');
  process.exit(1);
}
saveTokens(t);
console.log('OK: TikTok conectado (permisos: ' + t.scope + '). Tokens guardados en .env.');
process.exit(0);
