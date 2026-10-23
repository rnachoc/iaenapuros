// Configuración única de Instagram. Lee de .env: META_APP_ID, META_APP_SECRET y META_SHORT_TOKEN
// (token corto copiado del Explorador de la Graph API). Escribe en .env los tokens de larga
// duración y los IDs, y borra el token corto. Nunca imprime tokens.
import { loadEnv, setEnvVar, P } from './lib/common.mjs';
import { graph } from './lib/meta.mjs';
import fs from 'node:fs';

const env = loadEnv();
for (const k of ['META_APP_ID', 'META_APP_SECRET', 'META_SHORT_TOKEN'])
  if (!env[k]) {
    console.error(`Falta ${k} en .env (mira docs/MANUAL.md, paso 3)`);
    process.exit(1);
  }

const long = await graph.get('/oauth/access_token', {
  query: { grant_type: 'fb_exchange_token', client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET, fb_exchange_token: env.META_SHORT_TOKEN },
});
const pages = await graph.get('/me/accounts', {
  token: long.access_token,
  query: { fields: 'id,name,access_token,instagram_business_account{id,username}' },
});
const withIg = (pages.data || []).filter((p) => p.instagram_business_account);
if (!withIg.length) {
  console.error('Ninguna Página de Facebook tiene una cuenta profesional de Instagram vinculada (MANUAL.md, paso 1).');
  process.exit(1);
}
const wanted = (env.IG_USERNAME || 'iaenapuros').toLowerCase();
const page = withIg.find((p) => p.instagram_business_account.username.toLowerCase() === wanted) || withIg[0];

setEnvVar('META_USER_TOKEN', long.access_token);
setEnvVar('META_PAGE_ID', page.id);
setEnvVar('META_PAGE_TOKEN', page.access_token);
setEnvVar('IG_USER_ID', page.instagram_business_account.id);
const lines = fs.readFileSync(P('.env'), 'utf8').split(/\r?\n/).filter((l) => !l.startsWith('META_SHORT_TOKEN='));
fs.writeFileSync(P('.env'), lines.join('\n'), 'utf8');

console.log(`OK: Página "${page.name}" → Instagram @${page.instagram_business_account.username}. Credenciales guardadas en .env.`);
