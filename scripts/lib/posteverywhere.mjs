// Cliente mínimo de la API v1 de PostEverywhere (el mismo que usa su servidor MCP,
// github.com/posteverywhere/mcp, licencia MIT). Ellos publican en Instagram y TikTok
// con sus apps ya aprobadas; aquí solo se suben el vídeo y la orden de publicación.
// La clave se lee de .env (POSTEVERYWHERE_API_KEY) y nunca se imprime.
import fs from 'node:fs';
import { loadEnv } from './common.mjs';

// POSTEVERYWHERE_BASE_URL solo para pruebas contra un simulador local
const BASE = (process.env.POSTEVERYWHERE_BASE_URL || 'https://app.posteverywhere.ai') + '/api/v1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function peKey() {
  return loadEnv().POSTEVERYWHERE_API_KEY || process.env.POSTEVERYWHERE_API_KEY || null;
}

async function request(method, path, body) {
  const key = peKey();
  if (!key) throw new Error('Falta POSTEVERYWHERE_API_KEY en .env (docs/MANUAL.md)');
  const r = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'User-Agent': 'iaenapuros-pipeline',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`PostEverywhere HTTP ${r.status} sin JSON (problema temporal del servidor)`);
  }
  if (json.error) {
    const e = json.error;
    const hint = r.status === 402 ? ' (plan o créditos insuficientes)' : r.status === 429 ? ` (límite de peticiones; espera ${r.headers.get('retry-after') || 'un rato'} s)` : '';
    const details = e.details ? ' · ' + (typeof e.details === 'string' ? e.details : JSON.stringify(e.details)).slice(0, 400) : '';
    const err = new Error(`PostEverywhere ${method} ${path} → ${r.status}${e.code ? ' ' + e.code : ''}: ${e.message}${hint}${details}`);
    err.retryable = e.retryable === true || r.status >= 500;
    throw err;
  }
  return json.data;
}

export const pe = {
  me: () => request('GET', '/me'),
  accounts: () => request('GET', '/accounts'),
  health: (id) => request('GET', `/accounts/${id}/health`),
  platformRules: () => request('GET', '/platform-rules'),
  createPost: (body) => request('POST', '/posts', body),
  results: (id) => request('GET', `/posts/${id}/results`),
  retry: (id) => request('POST', `/posts/${id}/retry`),
  media: (id) => request('GET', `/media/${id}`),

  /** Subida directa de un archivo local: pedir URL → PUT de los bytes → confirmar → esperar a "ready". */
  async uploadVideo(file, { width, height, duration, platforms } = {}) {
    const size = fs.statSync(file).size;
    const up = await request('POST', '/media/upload', {
      filename: file.split(/[\\/]/).pop(),
      content_type: 'video/mp4',
      size,
      platforms,
      width,
      height,
      duration,
    });
    if (up.protocol !== 'put') throw new Error(`Protocolo de subida inesperado: ${up.protocol}`);
    const put = await fetch(up.upload_url, { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: fs.readFileSync(file) });
    if (!put.ok) throw new Error(`Subida del vídeo fallida: HTTP ${put.status}`);
    await request('POST', `/media/${encodeURIComponent(up.media_id)}/complete`, {});
    for (let i = 0; i < 40; i++) {
      const m = await request('GET', `/media/${up.media_id}`);
      const st = m.media_status || m.status;
      if (st === 'ready') return up.media_id;
      if (st === 'failed') throw new Error('PostEverywhere rechazó el vídeo: ' + (m.error_message || 'sin detalle'));
      await sleep(5000);
    }
    throw new Error('El vídeo no quedó listo en PostEverywhere en 200 s');
  },

  /** Espera a que cada destino quede publicado o fallido. */
  async waitResults(postId, { timeoutMs = 15 * 60 * 1000 } = {}) {
    const t0 = Date.now();
    let last;
    while (Date.now() - t0 < timeoutMs) {
      last = await request('GET', `/posts/${postId}/results`);
      const pending = (last.results || []).filter((d) => !['published', 'failed'].includes(d.status));
      if (!pending.length) return last;
      await sleep(20000);
    }
    return last;
  },
};

/** Cuentas de las plataformas pedidas que pueden publicar. */
export async function pickAccounts(platforms) {
  const { accounts } = await pe.accounts();
  const env = loadEnv();
  const forced = (env.POSTEVERYWHERE_ACCOUNT_IDS || '').split(',').map((s) => +s.trim()).filter(Boolean);
  const picked = [];
  const problems = [];
  for (const platform of platforms) {
    const cands = accounts.filter((a) => a.platform === platform && a.is_active && (!forced.length || forced.includes(a.id)));
    const ok = cands.find((a) => a.health && a.health.can_post);
    if (ok) picked.push({ id: ok.id, platform, name: ok.account_name });
    else problems.push(cands.length ? `${platform}: la cuenta necesita reconectarse` : `${platform}: no hay ninguna cuenta conectada`);
  }
  return { picked, problems };
}
