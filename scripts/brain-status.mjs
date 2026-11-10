// Señal para The Brain: .brain/status.json (contrato 9.1 de PLAN.md). The Brain solo la lee.
// La llaman daily, export, publish, publish:next, insights y marketing:report, siempre en try/catch:
// un fallo aquí nunca rompe el flujo del reel.
import fs from 'node:fs';
import path from 'node:path';
import { P, readJSON, writeJSON, readLog, config, todayMadrid } from './lib/common.mjs';

const fmt = (n) => (n == null ? '—' : Math.round(n).toLocaleString('es-ES'));

export function writeBrainStatus() {
  const date = todayMadrid();
  const eps = readLog().episodes;
  const hoy = eps.find((e) => e.date === date);
  const live = (config().publish || {}).mode === 'live';
  const lastPub = eps.filter((e) => e.status === 'published').map((e) => e.date).sort().pop() || '';
  const pendientes = eps.filter((e) => e.date > lastPub && e.date <= date && ['ready', 'dry-run', 'publish_failed'].includes(e.status)).length;

  let headline = 'Sin episodio todavía';
  let tone = 'warn';
  if (hoy) {
    const s = hoy.status;
    if (s === 'published') [headline, tone] = ['Reel de hoy publicado', 'ok'];
    else if (s === 'ready' || s === 'dry-run') [headline, tone] = [live ? 'Reel de hoy listo · se publica en la cola (12:30 / 20:30)' : 'Reel de hoy listo · esperando publicación', 'ok'];
    else if (s === 'producing') [headline, tone] = ['Reel de hoy en producción', 'ok'];
    else if (s === 'qa_failed' || s === 'failed') [headline, tone] = ['QA fallida', 'error'];
    else if (s === 'publish_failed') [headline, tone] = ['Fallo al publicar el reel de hoy', 'error'];
    else headline = `Reel de hoy: ${s}`;
  }

  const ins = readJSON(P('state', 'insights.json'), null);
  const items = [];
  if (ins) {
    const seg = ins.seguidores || {};
    const dias = Object.keys(seg).sort();
    const ult = seg[dias[dias.length - 1]];
    const ant = dias.length > 1 ? seg[dias[dias.length - 2]] : null;
    items.push({ label: 'Seguidores', value: fmt(ult), ...(ant != null ? { delta: `${ult - ant >= 0 ? '+' : ''}${ult - ant}` } : {}) });
    const semana = Object.values(ins.reels || {}).filter((r) => r.tipo === 'REELS' && Date.now() - Date.parse(r.publicado) < 7 * 864e5);
    const conVistas = semana.filter((r) => r.ultima && r.ultima.views != null);
    if (conVistas.length) {
      items.push({ label: 'Vistas de reels (7 d)', value: fmt(conVistas.reduce((s, r) => s + r.ultima.views, 0)) });
      const best = conVistas.sort((a, b) => b.ultima.views - a.ultima.views)[0];
      items.push({ label: 'Mejor reel (7 d)', value: `${fmt(best.ultima.views)} vistas` });
    } else if (semana.length) {
      const best = semana.sort((a, b) => (b.ultima.likes || 0) - (a.ultima.likes || 0))[0];
      items.push({ label: 'Mejor reel (7 d)', value: `${fmt(best.ultima.likes)} me gusta` });
    }
    if (ins.faltaPermiso) items.push({ label: 'Analíticas', value: 'falta permiso de insights' });
  }
  if (hoy && hoy.panel) items.push({ label: 'Jurado de hoy', value: `${hoy.panel.puntuacion} / 10 (ronda ${hoy.panel.ronda})` });
  items.push({ label: 'Pendientes de publicar', value: String(pendientes) });

  const informes = fs.existsSync(P('marketing', 'informes')) ? fs.readdirSync(P('marketing', 'informes')).filter((f) => f.endsWith('.md')).sort() : [];
  const portada = path.join('para-publicar', date, 'portada.jpg');
  const status = {
    updatedAt: new Date().toISOString(),
    headline,
    tone,
    items: items.slice(0, 6),
    ...(informes.length ? { report: 'marketing/informes/' + informes[informes.length - 1] } : {}),
    ...(fs.existsSync(P(portada)) ? { image: portada.split(path.sep).join('/') } : {}),
  };
  writeJSON(P('.brain', 'status.json'), status);
  return status;
}

if (process.argv[1] && process.argv[1].endsWith('brain-status.mjs')) console.log(JSON.stringify(writeBrainStatus(), null, 1));
