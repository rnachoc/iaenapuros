// TikTok Content Posting API (gratis): sube el vídeo como BORRADOR a la bandeja de entrada del creador.
// TikTok envía una notificación y el creador lo publica desde la app con un toque.
// La publicación directa en público exige una auditoría que TikTok no concede a herramientas personales.
// Credenciales en .env (las escribe npm run tiktok:setup); nunca se imprimen.
import fs from 'node:fs';
import { loadEnv, setEnvVar } from './common.mjs';

// TIKTOK_API_BASE solo para pruebas contra un simulador local
const API = (process.env.TIKTOK_API_BASE || 'https://open.tiktokapis.com') + '/v2';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const tiktokConfigured = () => {
  const e = loadEnv();
  return !!(e.TIKTOK_CLIENT_KEY && e.TIKTOK_CLIENT_SECRET && e.TIKTOK_REFRESH_TOKEN);
};

export async function tokenRequest(params) {
  const r = await fetch(`${API}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
    body: new URLSearchParams(params),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error || !j.access_token) throw new Error(`TikTok token → ${r.status}: ${j.error_description || j.error || 'respuesta inesperada'}`);
  return j;
}

export function saveTokens(t) {
  const now = Math.floor(Date.now() / 1000);
  setEnvVar('TIKTOK_ACCESS_TOKEN', t.access_token);
  setEnvVar('TIKTOK_REFRESH_TOKEN', t.refresh_token);
  setEnvVar('TIKTOK_EXPIRES_AT', String(now + Number(t.expires_in || 86400)));
  setEnvVar('TIKTOK_REFRESH_EXPIRES_AT', String(now + Number(t.refresh_expires_in || 31536000)));
  if (t.open_id) setEnvVar('TIKTOK_OPEN_ID', t.open_id);
}

/** Token de acceso válido; lo renueva si caduca en menos de 1 h (el de refresco dura 365 días). */
export async function ensureTiktokToken() {
  const e = loadEnv();
  if (!tiktokConfigured()) throw new Error('TikTok sin configurar: ejecuta npm run tiktok:setup (docs/MANUAL.md)');
  const now = Date.now() / 1000;
  const warnings = [];
  if (+e.TIKTOK_REFRESH_EXPIRES_AT && +e.TIKTOK_REFRESH_EXPIRES_AT - now < 0) throw new Error('El acceso a TikTok ha caducado: repite npm run tiktok:setup');
  if (+e.TIKTOK_REFRESH_EXPIRES_AT && +e.TIKTOK_REFRESH_EXPIRES_AT - now < 15 * 86400) warnings.push('El acceso a TikTok caduca en menos de 15 días: repite npm run tiktok:setup');
  if (e.TIKTOK_ACCESS_TOKEN && +e.TIKTOK_EXPIRES_AT - now > 3600) return { token: e.TIKTOK_ACCESS_TOKEN, warnings };
  const t = await tokenRequest({ client_key: e.TIKTOK_CLIENT_KEY, client_secret: e.TIKTOK_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: e.TIKTOK_REFRESH_TOKEN });
  saveTokens(t);
  return { token: t.access_token, warnings };
}

async function api(token, path, body) {
  const r = await fetch(API + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || (j.error && j.error.code && j.error.code !== 'ok'))
    throw new Error(`TikTok ${path} → ${r.status} ${(j.error && j.error.code) || ''}: ${(j.error && j.error.message) || ''}`.trim());
  return j.data;
}

/** Sube el MP4 a la bandeja de borradores y espera a que TikTok avise al creador. */
export async function uploadDraft(mp4, opts = {}) {
  const { token, warnings } = await ensureTiktokToken();
  return { ...(await uploadWithToken(token, mp4, opts)), warnings };
}

export async function uploadWithToken(token, mp4, { log = () => {} } = {}) {
  const size = fs.statSync(mp4).size;
  if (size > 64 * 1024 * 1024) throw new Error('vídeo > 64 MB: habría que trocearlo');
  // un solo trozo: chunk_size = tamaño del archivo (permitido hasta 64 MB)
  const init = await api(token, '/post/publish/inbox/video/init/', {
    source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: size, total_chunk_count: 1 },
  });
  log(`TikTok: subida iniciada (${(size / 1e6).toFixed(1)} MB)`);
  const put = await fetch(init.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(size), 'Content-Range': `bytes 0-${size - 1}/${size}` },
    body: fs.readFileSync(mp4),
  });
  if (!put.ok) throw new Error(`TikTok: la subida del vídeo falló (HTTP ${put.status})`);
  let st = {};
  for (let i = 0; i < 40; i++) {
    await sleep(6000);
    st = await api(token, '/post/publish/status/fetch/', { publish_id: init.publish_id });
    if (['SEND_TO_USER_INBOX', 'PUBLISH_COMPLETE', 'FAILED'].includes(st.status)) break;
  }
  return { publishId: init.publish_id, status: st.status, failReason: st.fail_reason || null };
}
