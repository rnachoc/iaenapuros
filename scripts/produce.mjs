// Producción determinista de un episodio: validar → voz → mezcla → proyecto → render → QA.
// Uso directo: node scripts/produce.mjs --date YYYY-MM-DD [--episode ruta] [--draft] [--local-tts]
import fs from 'node:fs';
import path from 'node:path';
import { P, readJSON, writeJSON, arg, todayMadrid, hf, buildDir, outDir, epDir } from './lib/common.mjs';
import { validateEpisode } from './lib/episode.mjs';
import { synthVoice, layoutTimeline, mixAudio } from './voice.mjs';
import { buildProject } from './build.mjs';
import { qaReel, layoutCheck } from './qa.mjs';

export function loadEpisode(date, file) {
  const f = file || path.join(epDir(date), 'episode.json');
  if (!fs.existsSync(f)) return null;
  return readJSON(f);
}

export function produce(ep, { draft = false, localTts = false, log = console.log } = {}) {
  const date = ep.date;
  const v = validateEpisode(ep);
  if (!v.ok) return { ok: false, stage: 'validate', errors: v.errors };

  const work = buildDir(date) + '-work';
  fs.mkdirSync(work, { recursive: true });
  const out = outDir(date);
  fs.mkdirSync(out, { recursive: true });

  // voz con autoajuste de duración (30-45 s)
  let boost = 0;
  let synth;
  let tl;
  for (let i = 0; i < 3; i++) {
    log(`· voz (ritmo ${boost >= 0 ? '+' : ''}${boost}%)`);
    synth = synthVoice(ep, work, { rateBoost: boost, local: localTts });
    tl = layoutTimeline(ep, synth);
    if (tl.duration > 45 && boost < 24) boost += Math.ceil(((tl.duration - 43.5) / tl.duration) * 100) + 2;
    else break;
  }
  if (tl.duration < 30) tl = layoutTimeline(ep, synth, { gap: 0.22 + (30.5 - tl.duration) / ep.lines.length, outro: 1.6 });
  if (tl.duration < 30 || tl.duration > 45.5) return { ok: false, stage: 'duration', errors: [`duración ${tl.duration}s fuera de 30-45 s; ajusta el guion`] };

  log(`· mezcla de audio (${tl.duration}s, voz ${synth.engine})`);
  const audio = path.join(work, 'audio.wav');
  const mix = mixAudio(tl, audio);

  log('· proyecto HyperFrames');
  const proj = buildProject(ep, tl, audio, buildDir(date));
  writeJSON(path.join(out, 'timeline.json'), { duration: tl.duration, tts: synth.engine, lines: tl.lines.map(({ audio: a, ...l }) => l) });

  log('· render');
  const mp4 = path.join(out, 'reel.mp4');
  fs.rmSync(mp4, { force: true });
  const t0 = Date.now();
  hf(['render', '--quality', draft ? 'draft' : 'high', '--output', mp4, '--quiet'], { cwd: proj, timeout: 1800000 });
  const renderSecs = Math.round((Date.now() - t0) / 1000);

  log('· control de calidad');
  const qa = qaReel(mp4, tl, path.join(out, 'qa'));
  const lc = layoutCheck(proj);
  const layoutErrors = ['lint', 'runtime', 'layout', 'contrast']
    .flatMap((k) => (lc[k] && lc[k].findings) || [])
    .filter((f) => f.severity === 'error');
  qa.checks.push({ name: 'layout HyperFrames (texto cortado/desbordes)', ok: layoutErrors.length === 0 && !lc.raw, detail: layoutErrors.slice(0, 5).map((f) => f.message || f.code || JSON.stringify(f).slice(0, 120)).join(' | ') || 'ok', severity: 'error' });
  qa.passed = qa.checks.every((c) => c.ok || c.severity === 'warning');
  qa.renderSecs = renderSecs;
  qa.tts = synth.engine;
  qa.sfx = mix.sfx;
  writeJSON(path.join(out, 'qa.json'), qa);
  return { ok: qa.passed, stage: qa.passed ? 'qa_ok' : 'qa', mp4, qa, tl };
}

if (process.argv[1] && process.argv[1].endsWith('produce.mjs')) {
  const date = arg('date', todayMadrid());
  const ep = loadEpisode(date, arg('episode'));
  if (!ep) {
    console.error('No existe episodes/' + date + '/episode.json');
    process.exit(2);
  }
  const r = produce(ep, { draft: !!arg('draft'), localTts: !!arg('local-tts') });
  console.log(JSON.stringify({ ok: r.ok, stage: r.stage, errors: r.errors, mp4: r.mp4, failed: r.qa && r.qa.checks.filter((c) => !c.ok) }, null, 2));
  process.exit(r.ok ? 0 : 1);
}
