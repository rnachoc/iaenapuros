// Publicación del reel. Dos vías (state/config.json → publish.provider):
//   "posteverywhere" (por defecto): Instagram Reels + TikTok a la vez vía la API de PostEverywhere
//   "meta": solo Instagram, directo con la Graph API (subida reanudable desde archivo local, firmada con el token de usuario)
// Uso: node scripts/publish.mjs [--date D] [--dry-run] [--review "nota"]
//      node scripts/publish.mjs --set-mode live|dry-run
//      node scripts/publish.mjs --check          (comprueba plan y cuentas sin publicar nada)
import fs from 'node:fs';
import path from 'node:path';
import { arg, todayMadrid, outDir, readJSON, writeJSON, config, CONFIG_FILE, readLog, upsertLog, loadEnv, durationOf } from './lib/common.mjs';
import { pe, peKey, pickAccounts } from './lib/posteverywhere.mjs';
import { graph, ensureToken, graphVersion } from './lib/meta.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- PostEverywhere: Instagram Reels + TikTok ----------
function tiktokCaption(date, caption) {
  const f = path.join(path.dirname(outDir(date)), 'tiktok', `${date}_iaenapuros_pie.txt`);
  return (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : caption).slice(0, 2200);
}

function postBody(date, caption, mediaId, accounts) {
  return {
    content: caption,
    account_ids: accounts.map((a) => a.id),
    media_ids: [mediaId],
    timezone: 'Europe/Madrid',
    platform_content: {
      instagram: { contentType: 'Reels' },
      tiktok: {
        content: tiktokCaption(date, caption),
        settings: { privacyLevel: 'PUBLIC_TO_EVERYONE', isAIGC: true, disableComment: false, disableDuet: false, disableStitch: false, videoCoverTimestamp: 0 },
      },
    },
  };
}

async function publishPE({ date, out, mp4, caption, comment, mode, review, entry }) {
  const platforms = (config().publish || {}).platforms || ['instagram', 'tiktok'];
  if (mode === 'dry-run') {
    const plan = {
      mode,
      provider: 'posteverywhere',
      date,
      platforms,
      steps: [
        'POST /api/v1/media/upload {video/mp4} → PUT de los bytes a upload_url → POST /media/{id}/complete → GET /media/{id} hasta "ready"',
        'POST /api/v1/posts {content, account_ids, media_ids, platform_content: instagram Reels + tiktok (público, etiqueta IA)}',
        'GET /api/v1/posts/{id}/results hasta que cada destino quede published/failed',
      ],
      body: postBody(date, caption, '<media_id>', platforms.map((p) => ({ id: `<${p}>`, platform: p }))),
      comment_manual: comment,
      review: review || null,
    };
    // con clave, se comprueba de verdad la conexión (solo lecturas: no publica nada)
    if (peKey()) {
      try {
        const { picked, problems } = await pickAccounts(platforms);
        plan.cuentas = picked;
        plan.problemas = problems;
      } catch (e) {
        plan.problemas = [e.message];
      }
    } else plan.problemas = ['falta POSTEVERYWHERE_API_KEY en .env'];
    writeJSON(path.join(out, 'publish.json'), plan);
    upsertLog(date, { status: 'dry-run', publish: { mode, provider: 'posteverywhere', at: new Date().toISOString(), review: review || null, problemas: plan.problemas } });
    return { ok: true, mode, plan: path.join(out, 'publish.json'), problemas: plan.problemas };
  }

  // idempotente: si el post ya se creó (p. ej. se cortó la espera), solo se reintenta y se espera
  let postId = entry.publish && entry.publish.pePostId;
  if (!postId) {
    const { picked, problems } = await pickAccounts(platforms);
    if (!picked.length) throw new Error('Ninguna cuenta puede publicar: ' + problems.join('; '));
    const mediaId = await pe.uploadVideo(mp4, { width: 1080, height: 1920, duration: Math.round(durationOf(mp4)), platforms });
    const created = await pe.createPost(postBody(date, caption, mediaId, picked));
    postId = created.post_id;
    upsertLog(date, { status: 'publishing', publish: { mode, provider: 'posteverywhere', pePostId: postId, cuentas: picked, problemas: problems, at: new Date().toISOString() } });
  } else {
    const prev = await pe.results(postId);
    if ((prev.results || []).some((d) => d.status === 'failed')) await pe.retry(postId);
  }

  const res = await pe.waitResults(postId);
  const dest = (res.results || []).map((d) => ({ platform: d.platform, status: d.status, url: d.platform_post_url, error: d.error }));
  const okList = dest.filter((d) => d.status === 'published');
  const record = {
    mode,
    provider: 'posteverywhere',
    pePostId: postId,
    destinos: dest,
    permalink: (okList.find((d) => d.platform === 'instagram') || okList[0] || {}).url || null,
    comment_manual: comment,
    at: new Date().toISOString(),
    review: review || null,
  };
  writeJSON(path.join(out, 'publish.json'), record);
  const allOk = dest.length > 0 && okList.length === dest.length;
  upsertLog(date, { status: allOk ? 'published' : okList.length ? 'partially_published' : 'publish_failed', publish: record });
  if (!allOk)
    return { ok: false, ...record, error: 'destinos sin publicar: ' + dest.filter((d) => d.status !== 'published').map((d) => `${d.platform} (${d.status})`).join(', ') };
  return { ok: true, ...record };
}

// Meta: token, permisos, cuota y token de usuario para la subida (solo lecturas)
const NEEDED_SCOPES = ['instagram_basic', 'instagram_content_publish', 'instagram_manage_comments', 'pages_show_list'];
async function checkMeta() {
  const env = loadEnv();
  const problemas = [];
  const { token, igUserId, warnings } = await ensureToken();
  if (!env.META_USER_TOKEN) problemas.push('falta META_USER_TOKEN: rupload solo acepta la subida firmada con el token de usuario');
  let permisos = null;
  if (env.META_APP_ID && env.META_APP_SECRET) {
    const d = (await graph.get('/debug_token', { query: { input_token: env.META_USER_TOKEN || token, access_token: `${env.META_APP_ID}|${env.META_APP_SECRET}` } })).data;
    permisos = d.scopes || [];
    const faltan = NEEDED_SCOPES.filter((s) => !permisos.includes(s));
    if (faltan.length) problemas.push('faltan permisos: ' + faltan.join(', '));
  }
  const q = (await graph.get(`/${igUserId}/content_publishing_limit`, { token, query: { fields: 'quota_usage,config' } })).data?.[0] || {};
  const total = q.config && q.config.quota_total;
  if (total && q.quota_usage >= total) problemas.push(`cuota agotada (${q.quota_usage}/${total} en 24 h)`);
  return {
    ok: problemas.length === 0,
    provider: 'meta',
    subida: 'rupload (firmada con token de usuario)',
    cuota: total ? `${q.quota_usage}/${total} en 24 h` : null,
    insights: permisos ? permisos.includes('instagram_manage_insights') : null,
    avisos: warnings,
    problemas,
  };
}

// guarda contra duplicados: Nacho también sube a mano, así que si ya hay un reel con el mismo título no se publica otro
// (los títulos no se repiten: daily.mjs lo impide)
async function alreadyPosted(token, igUserId, caption) {
  const title = caption.split('\n')[0].trim();
  const r = await graph.get(`/${igUserId}/media`, { token, query: { fields: 'id,caption,timestamp,permalink', limit: '25' } });
  return (r.data || []).find((m) => (m.caption || '').split('\n')[0].trim() === title) || null;
}

export async function check() {
  if (((config().publish || {}).provider || 'posteverywhere') === 'meta') return checkMeta();
  const platforms = (config().publish || {}).platforms || ['instagram', 'tiktok'];
  const me = await pe.me();
  const { picked, problems } = await pickAccounts(platforms);
  return {
    ok: problems.length === 0,
    plan: me.organization && { plan: me.organization.subscription_plan, estado: me.organization.subscription_status, activo: me.organization.entitled },
    cuentas: picked,
    problemas: problems,
  };
}

// ---------- Publicación ----------
export async function publish(date, { dryRun, review } = {}) {
  const out = outDir(date);
  const mp4 = path.join(out, 'reel.mp4');
  const qa = readJSON(path.join(out, 'qa.json'));
  const entry = readLog().episodes.find((e) => e.date === date) || {};
  if (entry.status === 'published') return { ok: true, skipped: 'ya publicado', permalink: entry.publish && entry.publish.permalink };
  if (entry.status === 'partially_published' && !(entry.publish && entry.publish.pePostId)) return { ok: false, error: 'publicado a medias sin id de PostEverywhere: revisar a mano' };
  if (!qa || !qa.passed) return { ok: false, error: 'QA no superado: no se publica' };
  if (fs.existsSync(path.join(out, 'panel')) && !fs.existsSync(path.join(out, 'panel', 'final.json')))
    return { ok: false, error: 'el jurado no ha cerrado: ejecuta npm run panel:finalize' };
  if (!fs.existsSync(mp4)) return { ok: false, error: 'falta reel.mp4' };
  const caption = fs.readFileSync(path.join(out, 'caption.txt'), 'utf8').trim();
  const comment = fs.readFileSync(path.join(out, 'comment.txt'), 'utf8').trim();
  const size = fs.statSync(mp4).size;
  const mode = dryRun || (config().publish || {}).mode !== 'live' ? 'dry-run' : 'live';
  // sin clave de PostEverywhere se sigue publicando solo en Instagram por Meta, como antes
  const provider = (config().publish || {}).provider || 'posteverywhere';
  if (provider === 'posteverywhere' && (peKey() || mode === 'dry-run')) return publishPE({ date, out, mp4, caption, comment, mode, review, entry });

  if (mode === 'dry-run') {
    const env = loadEnv();
    const plan = {
      mode,
      date,
      graphVersion: graphVersion(),
      credentials: env.IG_USER_ID && (env.META_PAGE_TOKEN || env.META_USER_TOKEN) ? 'presentes' : 'pendientes (npm run ig:setup)',
      steps: [
        'GET /{IG_USER_ID}/media: si ya hay un reel con el mismo título (subido a mano), no se publica y se marca como publicado',
        'POST graph.facebook.com/{v}/{IG_USER_ID}/media {media_type: REELS, upload_type: resumable, caption, thumb_offset: 0, is_ai_generated: true}',
        `POST {uri del contenedor} en rupload.facebook.com, firmado con META_USER_TOKEN (archivo local, ${(size / 1e6).toFixed(1)} MB); si falla, se para al momento`,
        'GET /{container}?fields=status_code cada 15 s hasta FINISHED (ERROR o EXPIRED paran al momento)',
        'POST /{IG_USER_ID}/media_publish {creation_id}',
        'POST /{media_id}/comments {message: comentario}',
      ],
      caption,
      comment,
      review: review || null,
    };
    writeJSON(path.join(out, 'publish.json'), plan);
    upsertLog(date, { status: 'dry-run', publish: { mode, at: new Date().toISOString(), review: review || null } });
    return { ok: true, mode, plan: path.join(out, 'publish.json') };
  }

  const { token, igUserId, warnings } = await ensureToken();
  const dup = await alreadyPosted(token, igUserId, caption);
  if (dup) {
    const res = { mode, mediaId: dup.id, permalink: dup.permalink, at: new Date().toISOString(), review: review || null, nota: 'ya estaba publicado (subida a mano): no se duplica' };
    writeJSON(path.join(out, 'publish.json'), res);
    upsertLog(date, { status: 'published', publish: res });
    return { ok: true, skipped: 'ya publicado hoy con el mismo título', permalink: dup.permalink };
  }
  const container = await graph.post(`/${igUserId}/media`, {
    token,
    json: { media_type: 'REELS', upload_type: 'resumable', caption, thumb_offset: 0, is_ai_generated: true },
  });
  const uploadUri = container.uri || `https://rupload.facebook.com/ig-api-upload/${graphVersion()}/${container.id}`;
  const up = await fetch(uploadUri, {
    method: 'POST',
    // rupload devuelve 500 ProcessingFailedError si se firma con el token de Página (probado el 10/11): va con el de usuario
    headers: { Authorization: `OAuth ${loadEnv().META_USER_TOKEN || token}`, offset: '0', file_size: String(size) },
    body: fs.readFileSync(mp4),
  });
  const upRes = await up.json().catch(() => ({}));
  if (!up.ok || upRes.success === false || upRes.debug_info) throw new Error(`Subida fallida (HTTP ${up.status}): ` + JSON.stringify(upRes.debug_info || upRes).slice(0, 300));

  let status = 'IN_PROGRESS';
  for (let i = 0; i < 40 && status !== 'FINISHED'; i++) {
    await sleep(15000);
    const st = await graph.get(`/${container.id}`, { token, query: { fields: 'status_code,status' } });
    status = st.status_code;
    if (status === 'ERROR' || status === 'EXPIRED') throw new Error(`Contenedor ${status}: ${st.status || ''}`);
  }
  if (status !== 'FINISHED') throw new Error('El vídeo no terminó de procesarse en 10 min');

  const media = await graph.post(`/${igUserId}/media_publish`, { token, json: { creation_id: container.id } });
  let permalink = null;
  try {
    permalink = (await graph.get(`/${media.id}`, { token, query: { fields: 'permalink' } })).permalink;
  } catch {}
  let commentId = null;
  try {
    commentId = (await graph.post(`/${media.id}/comments`, { token, query: { message: comment } })).id;
  } catch (e) {
    // Meta crea el comentario aunque responda 400 "does not support the requested response format" (10/11):
    // se comprueba si existe y NUNCA se reintenta, para no duplicarlo
    try {
      const cs = await graph.get(`/${media.id}/comments`, { token, query: { fields: 'id,text' } });
      commentId = ((cs.data || []).find((c) => c.text === comment) || {}).id || null;
    } catch {}
    if (!commentId) warnings.push('Comentario no publicado: ' + e.message);
  }
  const res = { mode, mediaId: media.id, permalink, commentId, warnings, at: new Date().toISOString(), review: review || null };
  writeJSON(path.join(out, 'publish.json'), res);
  upsertLog(date, { status: 'published', publish: res });
  return { ok: true, ...res };
}

if (process.argv[1] && process.argv[1].endsWith('publish.mjs')) {
  const setMode = arg('set-mode');
  if (setMode) {
    if (!['live', 'dry-run'].includes(setMode)) throw new Error('modo: live | dry-run');
    const c = config();
    c.publish = { ...(c.publish || {}), mode: setMode, changedAt: new Date().toISOString() };
    writeJSON(CONFIG_FILE, c);
    console.log('Modo de publicación: ' + setMode);
    process.exit(0);
  }
  if (arg('check')) {
    check()
      .then((r) => {
        console.log(JSON.stringify(r, null, 1));
        process.exit(r.ok ? 0 : 1);
      })
      .catch((e) => {
        console.log(JSON.stringify({ ok: false, error: e.message }));
        process.exit(1);
      });
  } else {
    const date = arg('date', todayMadrid());
    publish(date, { dryRun: !!arg('dry-run'), review: typeof arg('review') === 'string' ? arg('review') : null })
      .then((r) => {
        console.log(JSON.stringify(r));
        process.exit(r.ok ? 0 : 1);
      })
      .catch((e) => {
        upsertLog(date, { status: 'publish_failed', error: e.message });
        console.log(JSON.stringify({ ok: false, error: e.message }));
        process.exit(1);
      });
  }
}
