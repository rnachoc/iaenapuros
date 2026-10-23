// Jurado simulado (docs/PANEL.md): paquete de visionado, recuento de votos, mejor ronda y aprendizaje.
//   npm run panel:prep     -- [--date D]   → crea out/<fecha>/panel/ronda-N/ con hojas, guion y copia del reel
//   npm run panel:score    -- [--date D]   → lee ronda-N/votos/*.json y decide publicar | reescribir
//   npm run panel:finalize -- [--date D]   → restaura la mejor ronda, actualiza el aprendizaje
import fs from 'node:fs';
import path from 'node:path';
import { P, arg, todayMadrid, outDir, epDir, readJSON, writeJSON, ffmpeg, durationOf, upsertLog } from './lib/common.mjs';
import { writeCaptions } from './caption.mjs';

export const JUDGES = ['lucia', 'javi', 'marta', 'dani', 'carla'];
export const TAGS = {
  gancho_lento: 'Los 2 primeros segundos tienen que plantear ya el conflicto o la frase absurda; nada de saludos ni contexto.',
  titulo_flojo: 'El título de portada es una frase concreta y con tensión (¿qué le piden a la IA?), no un tema genérico.',
  ritmo_lento: 'Algo nuevo cada 2-4 s: cambio de pose, cámara, efecto o golpe de texto. Ningún tramo de más de 4 s plano.',
  chiste_previsible: 'El remate tiene que girar hacia algo que no se ve venir; evita la consecuencia obvia del planteamiento.',
  remate_flojo: 'La última línea es el golpe más fuerte y más corto del guion; nada después de él.',
  poco_relatable: 'Parte de situaciones que le pasan a cualquiera con la IA (trabajo, clase, móvil), no de casos de nicho.',
  demasiado_tecnico: 'Si hay jerga (tokens, contexto, API), el chiste se tiene que entender sin conocerla.',
  confuso: 'Quién habla y qué pasa tiene que entenderse en silencio, solo con la imagen y los subtítulos.',
  texto_dificil: 'Frases de subtítulo cortas; título de 2 líneas como máximo; nada de texto sobre la cara de Lía.',
  visual_estatico: 'Al menos 4 cambios de pose y 1-2 efectos (fx) repartidos; usa cam "cara" en las reacciones.',
  personaje_plano: 'Lía exagera sus reacciones: usa react a mitad de línea y poses extremas en el clímax.',
  demasiado_largo: 'Apunta a 30-35 s: corta frases de transición y deja solo los golpes.',
  cta_floja: 'La pregunta del pie es personal y fácil de contestar en una palabra o con una anécdota.',
};
const PASS_COMPLETE = 3;
const PASS_HOOK = 6;
const MAX_ROUNDS = 3;
const LEARN_FILE = P('state', 'aprendizaje.json');
const fmt = (n) => Math.round(n * 10) / 10;

const panelDir = (date) => path.join(outDir(date), 'panel');
const rounds = (date) =>
  fs.existsSync(panelDir(date))
    ? fs.readdirSync(panelDir(date)).filter((d) => /^ronda-\d+$/.test(d)).map((d) => +d.split('-')[1]).sort((a, b) => a - b)
    : [];

export function prep(date) {
  const out = outDir(date);
  const mp4 = path.join(out, 'reel.mp4');
  const tl = readJSON(path.join(out, 'timeline.json'));
  if (!fs.existsSync(mp4) || !tl) throw new Error('falta reel.mp4 o timeline.json: ejecuta antes npm run daily');
  const n = (rounds(date).at(-1) || 0) + 1;
  const dir = path.join(panelDir(date), 'ronda-' + n);
  fs.mkdirSync(path.join(dir, 'votos'), { recursive: true });
  for (const f of ['reel.mp4', 'caption.txt', 'comment.txt', 'qa.json', 'timeline.json']) if (fs.existsSync(path.join(out, f))) fs.copyFileSync(path.join(out, f), path.join(dir, f));
  fs.copyFileSync(path.join(epDir(date), 'episode.json'), path.join(dir, 'episode.json'));

  // un fotograma por segundo, 5×2 por hoja, con el segundo marcado
  const font = 'C\\:/Windows/Fonts/arialbd.ttf';
  ffmpeg([
    '-i', mp4,
    '-vf', `fps=1,scale=216:384,drawtext=fontfile='${font}':text='%{eif\\:t\\:d}s':x=8:y=8:fontsize=26:fontcolor=yellow:box=1:boxcolor=black@0.7:boxborderw=4,tile=5x2:padding=4:color=white`,
    '-q:v', '3', '-fps_mode', 'passthrough', path.join(dir, 'hoja_%02d.jpg'),
  ]);
  const sheets = fs.readdirSync(dir).filter((f) => f.startsWith('hoja_')).map((f) => path.join(dir, f));

  const dur = durationOf(mp4);
  const who = { lia: 'LÍA (la IA, voz femenina)', user: 'TÚ (el usuario, voz masculina)', narrador: 'NARRADORA (noticia)' };
  const lines = tl.lines.map((l) => `[${l.start.toFixed(1)}-${l.end.toFixed(1)} s] ${who[l.speaker] || l.speaker}: ${l.text}${l.pose ? `   (Lía: ${l.pose})` : ''}`);
  const ep = readJSON(path.join(epDir(date), 'episode.json'));
  const caption = fs.existsSync(path.join(out, 'caption.txt')) ? fs.readFileSync(path.join(out, 'caption.txt'), 'utf8').trim() : '';
  fs.writeFileSync(
    path.join(dir, 'guion.txt'),
    [`Reel de @iaenapuros · ${dur.toFixed(1)} s · título en portada: «${ep.title}»`, '', 'LO QUE SE OYE:', ...lines, '', 'PIE DEL POST:', caption, ''].join('\n'),
    'utf8'
  );
  return { ronda: n, dir, sheets, guion: path.join(dir, 'guion.txt'), duracion: +dur.toFixed(1), jurados: JUDGES };
}

function loadVotes(dir) {
  const vd = path.join(dir, 'votos');
  const votes = [];
  const errors = [];
  for (const id of JUDGES) {
    const f = path.join(vd, id + '.json');
    if (!fs.existsSync(f)) continue;
    try {
      const raw = fs.readFileSync(f, 'utf8');
      const v = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
      v.jurado = id;
      v.problemas = (v.problemas || []).map((p) => ({ ...p, tag: TAGS[p.tag] ? p.tag : 'otro' }));
      votes.push(v);
    } catch (e) {
      errors.push(`${id}: JSON inválido`);
    }
  }
  return { votes, errors };
}

export function scoreRound(date, n) {
  const dir = path.join(panelDir(date), 'ronda-' + n);
  const tl = readJSON(path.join(dir, 'timeline.json'));
  const dur = tl.duration;
  const { votes, errors } = loadVotes(dir);
  if (votes.length < 3) return { ok: false, ronda: n, error: `solo ${votes.length} votos válidos (mínimo 3)`, errors };
  const avg = (k) => fmt(votes.reduce((a, v) => a + (+v[k] || 0), 0) / votes.length);
  const watched = votes.map((v) => (v.visto_entero || v.scroll_en_seg == null ? dur : Math.min(dur, +v.scroll_en_seg)));
  const completos = votes.filter((v) => v.visto_entero || v.scroll_en_seg == null).length;
  const retencion = fmt((watched.reduce((a, w) => a + w / dur, 0) / votes.length) * 100);
  const curva = [];
  for (let s = 0; s < dur; s += 3) curva.push(`${s}s ${Math.round((watched.filter((w) => w > s).length / votes.length) * 100)}%`);

  // fallos comunes: tags marcados por 2 o más jurados
  const byTag = {};
  for (const v of votes)
    for (const p of v.problemas) {
      const t = (byTag[p.tag] = byTag[p.tag] || { tag: p.tag, jurados: new Set(), detalles: [] });
      t.jurados.add(v.jurado);
      t.detalles.push(`${v.jurado}${p.seg != null ? ` (${p.seg}s)` : ''}: ${p.detalle}`);
    }
  const comunes = Object.values(byTag)
    .filter((t) => t.jurados.size >= 2)
    .sort((a, b) => b.jurados.size - a.jurados.size)
    .map((t) => ({ tag: t.tag, jurados: t.jurados.size, regla: TAGS[t.tag] || null, detalles: t.detalles }));

  const res = {
    ronda: n,
    votos: votes.length,
    completos,
    retencion_media: retencion,
    curva: curva.join(' · '),
    gancho: avg('gancho'),
    humor: avg('humor'),
    remate: avg('remate'),
    claridad: avg('claridad'),
    compartirian: votes.filter((v) => v.compartiria).length,
    abandonos: votes.filter((v) => !(v.visto_entero || v.scroll_en_seg == null)).map((v) => `${v.jurado} en ${v.scroll_en_seg}s: ${v.motivo_scroll || ''}`),
    fallos_comunes: comunes,
    propuestas: votes.map((v) => `${v.jurado}: ${v.propuesta}`),
    mejores_momentos: votes.filter((v) => v.mejor_momento).map((v) => `${v.jurado} (${v.mejor_momento.seg}s): ${v.mejor_momento.por_que}`),
    errores: errors,
  };
  res.puntuacion = fmt(retencion / 10 * 0.5 + res.gancho * 0.3 + res.remate * 0.2);
  res.aprobado = completos >= PASS_COMPLETE && res.gancho >= PASS_HOOK;
  res.decision = res.aprobado ? 'publicar' : n < MAX_ROUNDS ? 'reescribir' : 'publicar_mejor';
  writeJSON(path.join(dir, 'veredicto.json'), res);
  return { ok: true, ...res };
}

function updateLearning(date, scored) {
  const L = readJSON(LEARN_FILE, { dias: {} });
  const tags = {};
  for (const r of scored) for (const c of r.fallos_comunes) tags[c.tag] = Math.max(tags[c.tag] || 0, c.jurados);
  const best = scored.reduce((a, b) => (b.puntuacion > a.puntuacion ? b : a));
  const ep = readJSON(path.join(panelDir(date), 'ronda-' + best.ronda, 'episode.json'));
  L.dias[date] = {
    titulo: ep.title,
    serie: ep.series,
    rondas: scored.length,
    puntuacion: best.puntuacion,
    retencion: best.retencion_media,
    gancho: best.gancho,
    fallos: tags,
    mejores_momentos: best.mejores_momentos.slice(0, 3),
  };
  writeJSON(LEARN_FILE, L);

  // reglas activas: fallos comunes en 3 o más de los últimos 10 días
  const days = Object.keys(L.dias).sort().slice(-10);
  const count = {};
  for (const d of days) for (const t of Object.keys(L.dias[d].fallos)) count[t] = (count[t] || 0) + 1;
  const active = Object.entries(count).filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1]);
  const watch = Object.entries(count).filter(([, c]) => c === 2);
  const top = Object.entries(L.dias).sort((a, b) => b[1].puntuacion - a[1].puntuacion).slice(0, 5);
  const md = [
    '# Aprendizaje del jurado',
    '',
    'Se genera solo con `npm run panel:finalize`. No editar a mano.',
    '',
    '## Reglas activas (fallos repetidos en 3 o más de los últimos 10 días)',
    ...(active.length ? active.map(([t, c]) => `- **${t}** (${c} días): ${TAGS[t] || 'ver detalles en state/aprendizaje.json'}`) : ['- (todavía ninguna)']),
    '',
    '## En observación (2 días)',
    ...(watch.length ? watch.map(([t]) => `- ${t}: ${TAGS[t] || ''}`) : ['- (nada)']),
    '',
    '## Los reels mejor valorados (referencia de lo que funciona)',
    ...top.map(([d, x]) => `- ${d} · ${x.puntuacion} · «${x.titulo}» (${x.serie}). ${x.mejores_momentos[0] || ''}`),
    '',
  ].join('\n');
  fs.writeFileSync(P('docs', 'APRENDIZAJE.md'), md, 'utf8');
  return { activas: active.map(([t]) => t) };
}

export function finalize(date) {
  const scored = rounds(date)
    .map((n) => readJSON(path.join(panelDir(date), 'ronda-' + n, 'veredicto.json')))
    .filter(Boolean);
  if (!scored.length) throw new Error('no hay ninguna ronda puntuada: ejecuta npm run panel:score');
  const best = scored.reduce((a, b) => (b.puntuacion > a.puntuacion ? b : a));
  const src = path.join(panelDir(date), 'ronda-' + best.ronda);
  const out = outDir(date);
  // la mejor ronda pasa a ser el reel del día
  for (const f of ['reel.mp4', 'caption.txt', 'comment.txt', 'qa.json', 'timeline.json']) if (fs.existsSync(path.join(src, f))) fs.copyFileSync(path.join(src, f), path.join(out, f));
  fs.copyFileSync(path.join(src, 'episode.json'), path.join(epDir(date), 'episode.json'));
  const ep = readJSON(path.join(src, 'episode.json'));
  writeCaptions(ep, path.join(out, 'reel.mp4'));
  const learn = updateLearning(date, scored);
  const final = { ronda: best.ronda, rondas: scored.length, puntuacion: best.puntuacion, aprobado: best.aprobado, completos: best.completos, gancho: best.gancho, reglas_activas: learn.activas };
  writeJSON(path.join(panelDir(date), 'final.json'), final);
  upsertLog(date, { title: ep.title, topicKey: ep.topic.key, panel: final });
  return final;
}

if (process.argv[1] && process.argv[1].endsWith('panel.mjs')) {
  const date = arg('date', todayMadrid());
  const cmd = process.argv[2];
  try {
    let r;
    if (cmd === 'prep') r = prep(date);
    else if (cmd === 'score') {
      const n = rounds(date).at(-1);
      if (!n) throw new Error('no hay rondas: ejecuta npm run panel:prep');
      r = scoreRound(date, n);
    } else if (cmd === 'finalize') r = finalize(date);
    else throw new Error('uso: node scripts/panel.mjs prep|score|finalize [--date D]');
    console.log('PANEL ' + JSON.stringify(r, null, 1));
    process.exit(r.ok === false ? 1 : 0);
  } catch (e) {
    console.log('PANEL ' + JSON.stringify({ ok: false, error: e.message }));
    process.exit(1);
  }
}
