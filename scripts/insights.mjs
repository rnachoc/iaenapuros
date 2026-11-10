// Analíticas de Instagram (npm run insights). Determinista, solo lecturas, nunca imprime tokens.
// Sin el permiso instagram_manage_insights funciona en modo reducido (seguidores, me gusta, comentarios)
// y lo deja escrito en "faltaPermiso".
// Salidas: marketing/datos/<fecha>.json (foto del día) y state/insights.json (acumulado por reel y por día).
// Métricas según la referencia vigente de Instagram Insights (10/11/2026): las que la API rechace
// se quitan solas de la lista y se anota el motivo en state/insights.json → metricas.rechazadas.
import fs from 'node:fs';
import path from 'node:path';
import { P, readJSON, writeJSON, readLog, outDir, todayMadrid } from './lib/common.mjs';
import { graph, ensureToken } from './lib/meta.mjs';

const MEDIA_METRICS = ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions', 'ig_reels_avg_watch_time', 'ig_reels_video_view_total_time'];
const ACCOUNT_METRICS = ['reach', 'views', 'accounts_engaged', 'total_interactions', 'follows_and_unfollows'];
export const INSIGHTS_FILE = P('state', 'insights.json');
const PERMISSION = 'instagram_manage_insights';
const isPermissionError = (m) => /permission|\(#10\)|\(#200\)|→ 403/i.test(m);
const title = (s) => (s || '').split('\n')[0].trim().normalize('NFC');
const madridMidnight = (date) => {
  // medianoche de Madrid en segundos unix (sirve para since/until)
  const utc = new Date(date + 'T00:00:00Z');
  const off = new Date(utc.toLocaleString('en-US', { timeZone: 'Europe/Madrid' })) - new Date(utc.toLocaleString('en-US', { timeZone: 'UTC' }));
  return Math.floor((utc.getTime() - off) / 1000);
};
const addDays = (date, n) => new Date(Date.parse(date + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

// título del pie → fecha del episodio (los títulos no se repiten)
function episodeIndex() {
  const idx = new Map();
  for (const e of readLog().episodes) {
    const f = path.join(outDir(e.date), 'caption.txt');
    const t = fs.existsSync(f) ? title(fs.readFileSync(f, 'utf8')) : e.title && title(e.title + ' 🧯');
    if (t) idx.set(t, e.date);
  }
  return idx;
}

// métricas válidas: se prueban de una en una la primera vez (o cuando aparece el permiso) y se revisan cada 7 días,
// porque algunas (follows_and_unfollows) solo existen a partir de 100 seguidores
async function validMetrics(kind, all, probe, state) {
  const known = state.metricas[kind];
  if (known && known.at && Date.now() - Date.parse(known.at) < 7 * 864e5) return known.validas;
  const res = { at: new Date().toISOString(), validas: [], rechazadas: {} };
  for (const m of all) {
    try {
      await probe(m);
      res.validas.push(m);
    } catch (e) {
      if (isPermissionError(e.message)) throw e;
      res.rechazadas[m] = e.message.replace(/^Graph \w+ \S+ → /, '').slice(0, 160);
    }
  }
  state.metricas[kind] = res;
  return res.validas;
}

const valueOf = (d) => (d.total_value ? d.total_value.value : d.values && d.values.length ? d.values[d.values.length - 1].value : null);

export async function runInsights() {
  const date = todayMadrid();
  const { token, igUserId } = await ensureToken();
  const prev = readJSON(INSIGHTS_FILE, null) || {};
  const state = { metricas: {}, seguidores: {}, cuentaDia: {}, reels: {}, comentarios: [], ...prev, faltaPermiso: null };
  const avisos = [];

  // cuenta
  const acc = await graph.get(`/${igUserId}`, { token, query: { fields: 'username,followers_count,media_count' } });
  state.cuenta = { username: acc.username, publicaciones: acc.media_count };
  state.seguidores[date] = acc.followers_count;

  // medios recientes (funciona con los permisos actuales)
  const media = (await graph.get(`/${igUserId}/media`, { token, query: { fields: 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count', limit: '60' } })).data || [];
  const idx = episodeIndex();
  const sinEmparejar = [];
  for (const m of media) {
    const r = state.reels[m.id] || { id: m.id, vistasPorDia: {} };
    Object.assign(r, {
      titulo: title(m.caption),
      tipo: m.media_product_type || m.media_type,
      permalink: m.permalink,
      publicado: m.timestamp,
      fechaPublicacion: todayMadrid(new Date(m.timestamp)),
      episodio: idx.get(title(m.caption)) || null,
      ultima: { ...(r.ultima || {}), at: new Date().toISOString(), likes: m.like_count, comments: m.comments_count },
    });
    if (!r.episodio) sinEmparejar.push(r.titulo.slice(0, 60));
    state.reels[m.id] = r;
  }

  // métricas por reel y de cuenta (requieren instagram_manage_insights)
  const reels = media.filter((m) => (m.media_product_type || '') === 'REELS');
  try {
    if (reels.length) {
      const probeId = reels[0].id;
      const metrics = await validMetrics('media', MEDIA_METRICS, (m) => graph.get(`/${probeId}/insights`, { token, query: { metric: m } }), state);
      for (const m of reels) {
        if (!metrics.length) break;
        try {
          const ins = (await graph.get(`/${m.id}/insights`, { token, query: { metric: metrics.join(',') } })).data || [];
          const r = state.reels[m.id];
          for (const d of ins) r.ultima[d.name] = valueOf(d);
          if (r.ultima.views != null) r.vistasPorDia[date] = r.ultima.views;
        } catch (e) {
          if (isPermissionError(e.message)) throw e;
          avisos.push(`insights de ${m.id}: ${e.message.slice(0, 120)}`);
        }
      }
    }
    // cuenta: valores de ayer (día completo en hora de Madrid)
    const ayer = addDays(date, -1);
    const q = { period: 'day', metric_type: 'total_value', since: String(madridMidnight(ayer)), until: String(madridMidnight(date)) };
    const am = await validMetrics('cuenta', ACCOUNT_METRICS, (m) => graph.get(`/${igUserId}/insights`, { token, query: { ...q, metric: m } }), state);
    if (am.length) {
      const ins = (await graph.get(`/${igUserId}/insights`, { token, query: { ...q, metric: am.join(',') } })).data || [];
      state.cuentaDia[ayer] = Object.fromEntries(ins.map((d) => [d.name, valueOf(d)]));
    }
  } catch (e) {
    if (!isPermissionError(e.message)) throw e;
    state.faltaPermiso = PERMISSION;
  }

  // comentarios de los últimos 10 reels (los de la propia cuenta no cuentan)
  const desde = prev.updatedAt || '1970-01-01';
  const vistos = new Set(state.comentarios.map((c) => c.id));
  for (const m of reels.slice(0, 10)) {
    try {
      const cs = (await graph.get(`/${m.id}/comments`, { token, query: { fields: 'id,text,username,timestamp,like_count', limit: '50' } })).data || [];
      for (const c of cs) {
        if (c.username === acc.username || vistos.has(c.id)) continue;
        state.comentarios.push({ id: c.id, media: m.id, usuario: c.username, texto: c.text, fecha: c.timestamp, likes: c.like_count || 0 });
      }
    } catch (e) {
      avisos.push(`comentarios de ${m.id}: ${e.message.slice(0, 120)}`);
    }
  }
  state.comentarios = state.comentarios.sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 300);
  const nuevos = state.comentarios.filter((c) => new Date(c.fecha) > new Date(desde));

  state.updatedAt = new Date().toISOString();
  state.sinEmparejar = sinEmparejar;
  writeJSON(INSIGHTS_FILE, state);
  writeJSON(P('marketing', 'datos', `${date}.json`), {
    fecha: date,
    cuenta: { ...state.cuenta, seguidores: acc.followers_count },
    medios: media.map((m) => state.reels[m.id]),
    cuentaAyer: state.cuentaDia[addDays(date, -1)] || null,
    comentariosNuevos: nuevos,
    faltaPermiso: state.faltaPermiso,
    avisos,
  });
  return {
    ok: true,
    seguidores: acc.followers_count,
    medios: media.length,
    conMetricas: reels.filter((m) => state.reels[m.id].ultima.views != null).length,
    comentariosNuevos: nuevos.length,
    sinEmparejar: sinEmparejar.length,
    faltaPermiso: state.faltaPermiso,
    avisos,
  };
}

if (process.argv[1] && process.argv[1].endsWith('insights.mjs')) {
  runInsights()
    .then(async (r) => {
      try {
        (await import('./brain-status.mjs')).writeBrainStatus();
      } catch {}
      if (r.faltaPermiso) console.log(`Modo reducido: falta el permiso ${r.faltaPermiso} (docs/MANUAL.md, paso 3). Sin vistas, alcance ni retención.`);
      console.log('RESULTADO ' + JSON.stringify(r));
    })
    .catch((e) => {
      console.log('RESULTADO ' + JSON.stringify({ ok: false, error: e.message }));
      process.exit(1);
    });
}
