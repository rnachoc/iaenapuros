// Cliente mínimo de la Graph API de Meta (Facebook Login for Business).
// Nunca imprime tokens: los errores se devuelven sin la URL completa.
import { loadEnv, setEnvVar, config } from './common.mjs';

export const graphVersion = () => (config().publish && config().publish.graphVersion) || 'v26.0';
const BASE = () => `https://graph.facebook.com/${graphVersion()}`;

async function call(method, url, { token, query = {}, json, headers = {}, body } = {}) {
  const u = new URL(url.startsWith('http') ? url : BASE() + url);
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let payload = body;
  if (json) {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(json);
  }
  const r = await fetch(u, { method, headers: h, body: payload });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 300) };
  }
  if (!r.ok || data.error) {
    const e = data.error || data.debug_info || data;
    throw new Error(`Graph ${method} ${u.pathname} → ${r.status}: ${e.message || JSON.stringify(e).slice(0, 300)}`);
  }
  return data;
}
export const graph = { get: (u, o) => call('GET', u, o), post: (u, o) => call('POST', u, o) };

/**
 * Comprueba el token de publicación y lo renueva si hace falta.
 * Devuelve { token, warnings[] }.
 */
export async function ensureToken() {
  const env = loadEnv();
  const warnings = [];
  const token = env.META_PAGE_TOKEN || env.META_USER_TOKEN;
  if (!token || !env.IG_USER_ID) throw new Error('Faltan credenciales en .env (ejecuta npm run ig:setup)');
  if (!env.META_APP_ID || !env.META_APP_SECRET) {
    warnings.push('Sin META_APP_ID/SECRET: no se puede verificar ni renovar el token');
    return { token, igUserId: env.IG_USER_ID, warnings };
  }
  const appToken = `${env.META_APP_ID}|${env.META_APP_SECRET}`;
  const dbg = (await graph.get('/debug_token', { query: { input_token: token, access_token: appToken } })).data;
  if (!dbg.is_valid) throw new Error('El token de Meta no es válido: repite npm run ig:setup');
  const now = Date.now() / 1000;
  const days = (ts) => (ts ? (ts - now) / 86400 : Infinity);

  // token de usuario de larga duración (60 días): se renueva con 15 días de margen
  if (env.META_USER_TOKEN) {
    const u = (await graph.get('/debug_token', { query: { input_token: env.META_USER_TOKEN, access_token: appToken } })).data;
    if (u.is_valid && days(u.expires_at) < 15) {
      try {
        const r = await graph.get('/oauth/access_token', {
          query: { grant_type: 'fb_exchange_token', client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET, fb_exchange_token: env.META_USER_TOKEN },
        });
        setEnvVar('META_USER_TOKEN', r.access_token);
        if (env.META_PAGE_ID) {
          const pg = await graph.get(`/${env.META_PAGE_ID}`, { token: r.access_token, query: { fields: 'access_token' } });
          setEnvVar('META_PAGE_TOKEN', pg.access_token);
        }
        warnings.push('Token de usuario renovado automáticamente');
      } catch (e) {
        warnings.push('No se pudo renovar el token de usuario (el de Página sigue siendo válido): ' + e.message);
      }
    }
  }
  if (days(dbg.expires_at) < 3) throw new Error('El token caduca en menos de 3 días y no se pudo renovar');
  if (days(dbg.data_access_expires_at) < 10) warnings.push(`El acceso a datos caduca en ${Math.floor(days(dbg.data_access_expires_at))} días: repite npm run ig:setup`);
  return { token, igUserId: env.IG_USER_ID, warnings };
}
