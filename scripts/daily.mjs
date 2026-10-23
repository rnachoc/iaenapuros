// Pipeline diario (npm run daily). Requiere episodes/<fecha>/episode.json escrito por la tarea programada.
//   npm run daily                     → voz, render, QA, pie, copia TikTok. Queda listo para revisión visual.
//   npm run daily -- --publish        → además publica (según el modo de config: dry-run o live)
//   flags: --date YYYY-MM-DD  --dry-run  --draft  --local-tts  --review "nota"  --force (rehacer un día ya hecho en dry-run)
import path from 'node:path';
import { arg, todayMadrid, readLog, upsertLog, ROOT } from './lib/common.mjs';
import { loadEpisode, produce } from './produce.mjs';
import { writeCaptions } from './caption.mjs';
import { publish } from './publish.mjs';

const MAX_ATTEMPTS = 7; // QA: 1 + 2 reintentos por cada una de las 3 rondas del jurado (con margen)
const date = arg('date', todayMadrid());
const done = (code, o) => {
  console.log('RESULTADO ' + JSON.stringify({ fecha: date, ...o }));
  process.exit(code);
};
const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');

const entry = readLog().episodes.find((e) => e.date === date) || {};
if (entry.status === 'published' || (entry.status === 'dry-run' && !arg('force')))
  done(0, { ok: true, estado: entry.status === 'published' ? 'ya_publicado' : 'ya_hecho_dry_run', enlace: entry.publish && entry.publish.permalink });

const ep = loadEpisode(date);
if (!ep) done(2, { ok: false, estado: 'falta_episodio', siguiente: `escribe episodes/${date}/episode.json (ver npm run context y docs/EPISODE.md)` });
if (ep.date !== date) done(2, { ok: false, estado: 'fecha_incorrecta', detalle: `episode.json dice ${ep.date}` });

const others = readLog().episodes.filter((e) => e.date !== date && e.status !== 'failed');
const dup = others.find((e) => e.topicKey === ep.topic.key || norm(e.title) === norm(ep.title));
if (dup) done(3, { ok: false, estado: 'tema_repetido', coincide_con: dup.date });

const attempts = (entry.attempts || 0) + 1;
if (attempts > MAX_ATTEMPTS) {
  upsertLog(date, { status: 'failed', error: 'reintentos agotados' });
  done(1, { ok: false, estado: 'reintentos_agotados', publicado: false });
}
upsertLog(date, {
  attempts,
  status: 'producing',
  series: ep.series,
  title: ep.title,
  topicKey: ep.topic.key,
  summary: ep.topic.summary || null,
  sources: ep.topic.sources || [],
});

let r;
for (let tech = 0; tech < 2; tech++) {
  try {
    r = produce(ep, { draft: !!arg('draft'), localTts: !!arg('local-tts') || tech > 0 && /tts|edge/i.test(String(r && r.error)) });
    break;
  } catch (e) {
    r = { ok: false, stage: 'render', errors: [e.message.slice(0, 400)], error: e.message };
  }
}

if (!r.ok) {
  const last = attempts >= MAX_ATTEMPTS;
  upsertLog(date, { status: last ? 'failed' : 'qa_failed', error: r.errors || (r.qa && r.qa.checks.filter((c) => !c.ok)) });
  done(1, {
    ok: false,
    estado: r.stage,
    errores: r.errors || r.qa.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`),
    reintentos_restantes: MAX_ATTEMPTS - attempts,
    publicado: false,
  });
}

const cap = writeCaptions(ep, r.mp4);
upsertLog(date, {
  status: 'ready',
  error: null,
  qa: { duration: r.qa.duration, lufs: r.qa.lufs, tts: r.qa.tts, renderSecs: r.qa.renderSecs },
  // rutas relativas al proyecto (el log no guarda rutas del equipo)
  files: Object.fromEntries(Object.entries({ mp4: r.mp4, contact: r.qa.contact, tiktok: cap.tiktok }).map(([k, v]) => [k, path.relative(ROOT, v).split(path.sep).join('/')])),
});

if (!arg('publish'))
  done(0, {
    ok: true,
    estado: 'listo_para_revision',
    duracion: r.qa.duration,
    hoja_de_contactos: r.qa.contact,
    siguiente: 'revisa la hoja de contactos y ejecuta: npm run publish -- --review "ok: <nota>"',
  });

const p = await publish(date, { dryRun: !!arg('dry-run'), review: typeof arg('review') === 'string' ? arg('review') : null }).catch((e) => ({ ok: false, error: e.message }));
if (!p.ok) upsertLog(date, { status: 'publish_failed', error: p.error });
done(p.ok ? 0 : 1, { ok: p.ok, estado: p.ok ? (p.mode === 'live' ? 'publicado' : 'dry-run') : 'fallo_publicacion', enlace: p.permalink, error: p.error });
