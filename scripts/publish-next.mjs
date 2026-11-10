// Cola de publicación (npm run publish:next): publica UN reel, el pendiente más antiguo.
// Pendiente = posterior al último episodio que ya está en Instagram, con la QA superada, sin fallo y sin publicar.
// Se ejecuta a las 12:30 y a las 20:30: con atrasos salen 2 al día; al día, el de 20:30 no encuentra nada.
// Antes de nada sincroniza el log con Instagram (los reels subidos a mano cuentan como publicados).
// Uso: node scripts/publish-next.mjs [--dry-run]   (en dry-run solo dice qué publicaría)
import fs from 'node:fs';
import path from 'node:path';
import { arg, readJSON, readLog, upsertLog, outDir, config, todayMadrid, P } from './lib/common.mjs';
import { graph, ensureToken } from './lib/meta.mjs';
import { publish } from './publish.mjs';

// bloqueo: si dos ejecuciones coinciden (p. ej. una atrasada y la siguiente), solo una publica
const LOCK = P('state', 'publish.lock');
let locked = false;
const done = (code, o) => {
  if (locked) fs.rmSync(LOCK, { force: true });
  console.log('RESULTADO ' + JSON.stringify(o));
  process.exit(code);
};
try {
  fs.writeFileSync(LOCK, new Date().toISOString(), { flag: 'wx' });
  locked = true;
} catch {
  // un bloqueo de más de 30 min es de una ejecución que murió: se ignora
  if (Date.now() - fs.statSync(LOCK).mtimeMs < 30 * 60 * 1000) done(0, { ok: true, estado: 'ocupado', detalle: 'otra publicación en curso' });
  fs.writeFileSync(LOCK, new Date().toISOString());
  locked = true;
}
const title = (s) => (s || '').split('\n')[0].trim().normalize('NFC');
const captionOf = (date) => {
  const f = path.join(outDir(date), 'caption.txt');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
};

try {
  const { token, igUserId } = await ensureToken();
  const media = (await graph.get(`/${igUserId}/media`, { token, query: { fields: 'id,caption,permalink,timestamp', limit: '50' } })).data || [];
  const eps = readLog().episodes.filter((e) => e.date <= todayMadrid());

  let lastOnIg = '';
  for (const e of eps) {
    const cap = captionOf(e.date);
    const m = cap && media.find((x) => title(x.caption) === title(cap));
    if (!m) continue;
    lastOnIg = e.date;
    if (e.status !== 'published')
      upsertLog(e.date, { status: 'published', error: null, publish: { mode: 'manual', mediaId: m.id, permalink: m.permalink, at: m.timestamp, nota: 'ya estaba en Instagram' } });
  }

  const pending = eps.filter(
    (e) => e.date > lastOnIg && !['published', 'failed'].includes(e.status) && captionOf(e.date) && (readJSON(path.join(outDir(e.date), 'qa.json'), {}) || {}).passed,
  );
  if (!pending.length) done(0, { ok: true, estado: 'al_dia', ultimo_en_instagram: lastOnIg || null });

  const next = pending[0];
  const live = (config().publish || {}).mode === 'live' && !arg('dry-run');
  if (!live) done(0, { ok: true, estado: 'dry-run', publicaria: next.date, titulo: next.title, pendientes: pending.map((e) => e.date) });

  const r = await publish(next.date, { review: 'auto: cola de publicación' }).catch((e) => ({ ok: false, error: e.message }));
  if (!r.ok) upsertLog(next.date, { status: 'publish_failed', error: r.error });
  done(r.ok ? 0 : 1, { ok: r.ok, fecha: next.date, titulo: next.title, enlace: r.permalink, error: r.error, pendientes: pending.slice(1).map((e) => e.date) });
} catch (e) {
  done(1, { ok: false, error: e.message });
}
