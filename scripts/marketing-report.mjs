// Informe de marketing (npm run marketing:report [-- --semanal]). Determinista: cuentas y texto fijo, sin modelo.
// Lee state/insights.json, state/log.json y state/aprendizaje.json. Escribe marketing/informes/<fecha>[-semanal].md.
import fs from 'node:fs';
import { P, arg, readJSON, readLog, todayMadrid } from './lib/common.mjs';
import { INSIGHTS_FILE } from './insights.mjs';

const MIN_MUESTRA = 8;
const addDays = (date, n) => new Date(Date.parse(date + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const fmt = (n) => (n == null || Number.isNaN(n) ? '—' : Math.round(n).toLocaleString('es-ES'));
const pct = (n) => (n == null || Number.isNaN(n) ? '—' : `${Math.round(n)} %`);
const delta = (a, b) => (a == null || b == null ? 's/d' : `${a - b >= 0 ? '+' : ''}${a - b}`);
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const DOW = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const short = (s, n = 42) => (s.length > n ? s.slice(0, n - 1) + '…' : s).replace(/\|/g, '/');

// orden de rangos (Spearman, sin empates corregidos: basta para ver si el jurado acierta)
function spearman(a, b) {
  const rank = (xs) => {
    const o = xs.map((v, i) => [v, i]).sort((x, y) => y[0] - x[0]);
    const r = [];
    o.forEach(([, i], k) => (r[i] = k + 1));
    return r;
  };
  const ra = rank(a);
  const rb = rank(b);
  const n = a.length;
  const d2 = ra.reduce((s, r, i) => s + (r - rb[i]) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
}

export function buildReport({ semanal = false } = {}) {
  const date = todayMadrid();
  const ins = readJSON(INSIGHTS_FILE, null);
  if (!ins) return { ok: false, error: 'no hay datos: ejecuta npm run insights' };
  const log = new Map(readLog().episodes.map((e) => [e.date, e]));
  const jurado = (readJSON(P('state', 'aprendizaje.json'), {}) || {}).dias || {};
  const datosHoy = readJSON(P('marketing', 'datos', `${date}.json`), null);

  const reels = Object.values(ins.reels)
    .filter((r) => r.tipo === 'REELS')
    .sort((a, b) => b.publicado.localeCompare(a.publicado))
    .map((r) => {
      const ep = r.episodio && log.get(r.episodio);
      const u = r.ultima || {};
      const dur = ep && ep.qa && ep.qa.duration;
      const watch = u.ig_reels_avg_watch_time != null ? u.ig_reels_avg_watch_time / 1000 : null;
      return {
        ...r,
        serie: (ep && ep.series) || '—',
        vistas: u.views ?? null,
        alcance: u.reach ?? null,
        interacciones: u.total_interactions ?? (u.likes ?? 0) + (u.comments ?? 0),
        guardados: u.saved ?? null,
        compartidos: u.shares ?? null,
        tMedio: watch,
        retencion: watch != null && dur ? (100 * watch) / dur : null,
        jurado: r.episodio && jurado[r.episodio],
        likes: u.likes ?? 0,
      };
    });
  const medidos = reels.filter((r) => r.vistas != null);
  // con métricas se ordena por vistas; sin ellas, por me gusta + comentarios (y se dice)
  const clave = medidos.length ? 'vistas' : 'interacciones';
  const claveTxt = medidos.length ? 'vistas' : 'me gusta + comentarios';

  // 1. titular
  const seg = ins.seguidores || {};
  const segHoy = seg[date] ?? Object.values(seg).pop();
  const sum = (from, to, m) => {
    let s = 0;
    let n = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) if (ins.cuentaDia[d] && ins.cuentaDia[d][m] != null) (s += ins.cuentaDia[d][m]), n++;
    return n ? s : null;
  };
  const ayer = addDays(date, -1);
  const v7 = sum(addDays(ayer, -6), ayer, 'views');
  const v7p = sum(addDays(ayer, -13), addDays(ayer, -7), 'views');
  const a7 = sum(addDays(ayer, -6), ayer, 'reach');
  const a7p = sum(addDays(ayer, -13), addDays(ayer, -7), 'reach');
  const cmp = (a, b) => (a == null ? 'sin datos' : `${fmt(a)}${b ? ` (${a >= b ? '+' : ''}${Math.round((100 * (a - b)) / b)} % frente a los 7 anteriores)` : ''}`);

  const L = [];
  L.push(`# Marketing @${(ins.cuenta || {}).username || 'iaenapuros'} · ${semanal ? 'informe semanal' : 'informe diario'} · ${date}`, '');
  L.push('## Titular', '');
  L.push(`- **Seguidores:** ${fmt(segHoy)} (día: ${delta(segHoy, seg[ayer])}, 7 días: ${delta(segHoy, seg[addDays(date, -7)])})`);
  L.push(`- **Vistas de la cuenta, últimos 7 días:** ${cmp(v7, v7p)}`);
  L.push(`- **Alcance, últimos 7 días:** ${cmp(a7, a7p)}`);
  L.push(`- **Reels publicados:** ${reels.length} · con métricas: ${medidos.length}`, '');

  // 2. tabla
  L.push('## Reels (últimos 14)', '');
  L.push('| Publicado | Título | Serie | Vistas | Alcance | Interacc. | Guard. | Compart. | T. medio | Retención |');
  L.push('|---|---|---|--:|--:|--:|--:|--:|--:|--:|');
  for (const r of reels.slice(0, 14))
    L.push(
      `| ${r.fechaPublicacion} | [${short(r.titulo.replace(/\s*🧯$/, ''))}](${r.permalink}) | ${r.serie} | ${fmt(r.vistas)} | ${fmt(r.alcance)} | ${fmt(r.interacciones)} | ${fmt(r.guardados)} | ${fmt(r.compartidos)} | ${r.tMedio == null ? '—' : r.tMedio.toFixed(1) + ' s'} | ${pct(r.retencion)} |`,
    );
  L.push('');

  // 3. qué funciona
  L.push('## Qué funciona', '');
  if (!medidos.length) L.push(`_Sin métricas de vistas: se compara por ${claveTxt}, que con pocos seguidores dice poco._`, '');
  // solo reels con 48 h o más: uno recién publicado aún no ha tenido su recorrido
  const base = (medidos.length ? medidos : reels).filter((r) => Date.now() - Date.parse(r.publicado) >= 48 * 36e5);
  const grupo = (fn) => {
    const g = {};
    for (const r of base) (g[fn(r)] ||= []).push(r[clave] ?? 0);
    return Object.entries(g)
      .sort((a, b) => avg(b[1]) - avg(a[1]))
      .map(([k, xs]) => `${k}: ${fmt(avg(xs))} de media (${xs.length})`)
      .join(' · ');
  };
  L.push(`- **Por serie (${claveTxt}):** ${grupo((r) => r.serie)}`);
  L.push(`- **Por día de publicación:** ${grupo((r) => DOW[new Date(r.fechaPublicacion + 'T12:00:00Z').getUTCDay()])}`);
  const orden = [...base].sort((a, b) => (b[clave] ?? 0) - (a[clave] ?? 0));
  const linea = (r) =>
    `  - ${r.fechaPublicacion} · ${short(r.titulo.replace(/\s*🧯$/, ''), 50)}: ${fmt(r[clave])} ${claveTxt}` +
    (r.retencion != null ? `, retención ${pct(r.retencion)}` : '') +
    (r.compartidos != null ? `, ${fmt(r.compartidos)} compartidos` : '') +
    (r.jurado ? `, jurado ${r.jurado.puntuacion}` : '');
  if (base.length >= 6) {
    L.push('- **Los 3 mejores:**', ...orden.slice(0, 3).map(linea));
    L.push('- **Los 3 peores:**', ...orden.slice(-3).reverse().map(linea));
  } else L.push('- Menos de 6 reels: todavía no hay mejores ni peores.');
  L.push('');

  // 4. jurado frente a la realidad
  L.push('## ¿Acierta el jurado?', '');
  const conJurado = medidos.filter((r) => r.jurado && r.retencion != null);
  if (conJurado.length < MIN_MUESTRA) {
    L.push(`Aún no hay muestra suficiente: ${conJurado.length} reels con nota del jurado y retención medida (hacen falta ${MIN_MUESTRA}).`);
  } else {
    const rhoP = spearman(conJurado.map((r) => r.jurado.puntuacion), conJurado.map((r) => r.retencion));
    const rhoG = spearman(conJurado.map((r) => r.jurado.gancho), conJurado.map((r) => r.retencion));
    const rhoS = spearman(conJurado.map((r) => r.jurado.puntuacion), conJurado.map((r) => r.compartidos ?? 0));
    const lect = (x) => (x >= 0.5 ? 'acierta' : x >= 0.2 ? 'acierta a medias' : x > -0.2 ? 'no acierta' : 'acierta al revés');
    L.push(`- Nota del jurado frente a retención real: ρ = ${rhoP.toFixed(2)} (${lect(rhoP)}).`);
    L.push(`- Gancho del jurado frente a retención real: ρ = ${rhoG.toFixed(2)} (${lect(rhoG)}).`);
    L.push(`- Nota del jurado frente a compartidos: ρ = ${rhoS.toFixed(2)} (${lect(rhoS)}).`);
    const pos = (xs) => new Map([...xs].sort((a, b) => b[1] - a[1]).map(([id], i) => [id, i + 1]));
    const pj = pos(conJurado.map((r) => [r.id, r.jurado.puntuacion]));
    const pr = pos(conJurado.map((r) => [r.id, r.retencion]));
    const disc = conJurado.map((r) => ({ r, d: pj.get(r.id) - pr.get(r.id) })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 3);
    L.push('- **Mayores discrepancias** (puesto según el jurado → puesto real):');
    for (const { r } of disc) L.push(`  - ${short(r.titulo.replace(/\s*🧯$/, ''), 50)}: ${pj.get(r.id)}.º → ${pr.get(r.id)}.º (nota ${r.jurado.puntuacion}, retención ${pct(r.retencion)})`);
  }
  L.push('');

  // 5. comunidad
  L.push('## Comunidad', '');
  const nuevos = (datosHoy && datosHoy.comentariosNuevos) || [];
  const todos = ins.comentarios || [];
  L.push(`- Comentarios nuevos desde la última medición: ${nuevos.length} · guardados en total: ${todos.length}`);
  const titulo = (id) => short(((ins.reels[id] || {}).titulo || '').replace(/\s*🧯$/, ''), 40);
  const top = [...(semanal ? todos.filter((c) => c.fecha.slice(0, 10) >= addDays(date, -7)) : nuevos.length ? nuevos : todos)]
    .sort((a, b) => b.likes - a.likes || b.texto.length - a.texto.length)
    .slice(0, 5);
  for (const c of top) L.push(`  - @${c.usuario} en «${titulo(c.media)}»: "${short(c.texto.replace(/\s+/g, ' '), 140)}"${c.likes ? ` (${c.likes} ❤)` : ''}`);
  L.push('');

  // 6. lo que falta
  const faltan = [];
  if (ins.faltaPermiso) faltan.push(`Permiso \`${ins.faltaPermiso}\`: sin él no hay vistas, alcance, guardados, compartidos ni retención (docs/MANUAL.md, paso 3).`);
  if ((ins.sinEmparejar || []).length) faltan.push(`Publicaciones sin episodio emparejado: ${ins.sinEmparejar.join(' · ')}`);
  const rech = Object.entries(ins.metricas || {}).flatMap(([k, v]) => Object.entries(v.rechazadas || {}).map(([m, why]) => `${k}.${m} (${why})`));
  if (rech.length) faltan.push('Métricas que la API no da: ' + rech.join('; '));
  if (Object.keys(seg).length < 8) faltan.push(`Serie de seguidores corta: ${Object.keys(seg).length} días medidos.`);
  L.push('## Datos que faltan', '');
  L.push(...(faltan.length ? faltan.map((f) => '- ' + f) : ['- Nada.']));
  L.push('', `_Datos de Instagram del ${(ins.updatedAt || '').slice(0, 16).replace('T', ' ')} UTC._`);

  const rel = `marketing/informes/${date}${semanal ? '-semanal' : ''}.md`;
  fs.mkdirSync(P('marketing', 'informes'), { recursive: true });
  fs.writeFileSync(P(...rel.split('/')), L.join('\n') + '\n', 'utf8');
  return { ok: true, informe: rel, reels: reels.length, medidos: medidos.length, faltaPermiso: ins.faltaPermiso || null };
}

if (process.argv[1] && process.argv[1].endsWith('marketing-report.mjs')) {
  const r = buildReport({ semanal: !!arg('semanal') });
  try {
    if (r.ok) (await import('./brain-status.mjs')).writeBrainStatus();
  } catch {}
  console.log('RESULTADO ' + JSON.stringify(r));
  process.exit(r.ok ? 0 : 1);
}
