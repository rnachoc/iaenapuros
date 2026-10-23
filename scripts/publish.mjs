// Publicación del reel en Instagram (API oficial, subida reanudable desde archivo local).
// Uso: node scripts/publish.mjs [--date D] [--dry-run] [--review "nota"]
//      node scripts/publish.mjs --set-mode live|dry-run
import fs from 'node:fs';
import path from 'node:path';
import { arg, todayMadrid, outDir, readJSON, writeJSON, config, CONFIG_FILE, readLog, upsertLog, loadEnv } from './lib/common.mjs';
import { graph, ensureToken, graphVersion } from './lib/meta.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function publish(date, { dryRun, review } = {}) {
  const out = outDir(date);
  const mp4 = path.join(out, 'reel.mp4');
  const qa = readJSON(path.join(out, 'qa.json'));
  const entry = readLog().episodes.find((e) => e.date === date) || {};
  if (entry.status === 'published') return { ok: true, skipped: 'ya publicado', permalink: entry.publish && entry.publish.permalink };
  if (!qa || !qa.passed) return { ok: false, error: 'QA no superado: no se publica' };
  if (fs.existsSync(path.join(out, 'panel')) && !fs.existsSync(path.join(out, 'panel', 'final.json')))
    return { ok: false, error: 'el jurado no ha cerrado: ejecuta npm run panel:finalize' };
  if (!fs.existsSync(mp4)) return { ok: false, error: 'falta reel.mp4' };
  const caption = fs.readFileSync(path.join(out, 'caption.txt'), 'utf8').trim();
  const comment = fs.readFileSync(path.join(out, 'comment.txt'), 'utf8').trim();
  const size = fs.statSync(mp4).size;
  const mode = dryRun || (config().publish || {}).mode !== 'live' ? 'dry-run' : 'live';

  if (mode === 'dry-run') {
    const env = loadEnv();
    const plan = {
      mode,
      date,
      graphVersion: graphVersion(),
      credentials: env.IG_USER_ID && (env.META_PAGE_TOKEN || env.META_USER_TOKEN) ? 'presentes' : 'pendientes (npm run ig:setup)',
      steps: [
        'POST graph.facebook.com/{v}/{IG_USER_ID}/media {media_type: REELS, upload_type: resumable, caption, thumb_offset: 0, is_ai_generated: true}',
        `POST rupload.facebook.com/ig-api-upload/{v}/{container} (archivo local, ${(size / 1e6).toFixed(1)} MB)`,
        'GET /{container}?fields=status_code hasta FINISHED',
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
  const container = await graph.post(`/${igUserId}/media`, {
    token,
    json: { media_type: 'REELS', upload_type: 'resumable', caption, thumb_offset: 0, is_ai_generated: true },
  });
  const uploadUri = container.uri || `https://rupload.facebook.com/ig-api-upload/${graphVersion()}/${container.id}`;
  const up = await fetch(uploadUri, {
    method: 'POST',
    headers: { Authorization: `OAuth ${token}`, offset: '0', file_size: String(size) },
    body: fs.readFileSync(mp4),
  });
  const upRes = await up.json().catch(() => ({}));
  if (!up.ok || upRes.success === false || upRes.debug_info) throw new Error('Subida fallida: ' + JSON.stringify(upRes.debug_info || upRes).slice(0, 300));

  let status = 'IN_PROGRESS';
  for (let i = 0; i < 20 && status !== 'FINISHED'; i++) {
    await sleep(30000);
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
    warnings.push('Comentario no publicado: ' + e.message);
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
