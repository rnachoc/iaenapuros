// Fotogramas rápidos sin render completo.
//   node scripts/snap.mjs --date YYYY-MM-DD [--at 0,5,10]   → reutiliza voz y timeline ya generados
//   node scripts/snap.mjs --poses                            → hoja de identidad: todas las poses y fondos
import fs from 'node:fs';
import path from 'node:path';
import { P, arg, readJSON, ffmpeg, hf, buildDir, outDir, todayMadrid } from './lib/common.mjs';
import { buildProject } from './build.mjs';
import { POSE_NAMES } from '../engine/src/poses.js';
import { BACKGROUNDS } from './lib/episode.mjs';
import { loadEpisode } from './produce.mjs';

function snapshot(proj, times, outPng) {
  const dir = path.join(proj, 'snaps');
  fs.rmSync(dir, { recursive: true, force: true });
  hf(['snapshot', '--at', times.map((t) => t.toFixed(2)).join(','), '--no-end', '--output', dir, '--timeout', '20000'], { cwd: proj, timeout: 600000 });
  const pngs = fs.readdirSync(dir).filter((f) => f.endsWith('.png') && f.startsWith('frame-'));
  pngs.sort();
  const list = path.join(dir, 'list.txt');
  fs.writeFileSync(list, pngs.map((f) => `file '${path.join(dir, f).replace(/\\/g, '/')}'`).join('\n'));
  const cols = Math.min(5, pngs.length);
  const rows = Math.ceil(pngs.length / cols);
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-vf', `scale=360:640,tile=${cols}x${rows}:padding=6:color=white`, '-frames:v', '1', '-q:v', '3', outPng]);
  return outPng;
}

if (arg('poses')) {
  const lines = [];
  let t = 0.2;
  const all = [...POSE_NAMES];
  all.forEach((pose, i) => {
    const bg = BACKGROUNDS[Math.floor(i / 4) % BACKGROUNDS.length];
    lines.push({ speaker: 'lia', text: pose, pose, bg, cam: i % 3 === 2 ? 'general' : 'medio', i, start: t, end: t + 1.2, words: [{ w: pose, s: t, e: t + 1 }] });
    t += 1.5;
  });
  const tl = { duration: +(t + 0.5).toFixed(2), lines };
  const ep = { date: 'identidad', title: 'Claude: hoja de identidad (poses y fondos)', series: 'dia-a-dia', topic: { key: 'identidad' } };
  const silent = P('build', 'silence.wav');
  fs.mkdirSync(path.dirname(silent), { recursive: true });
  ffmpeg(['-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo`, '-t', String(tl.duration), silent]);
  const proj = buildProject(ep, tl, silent, buildDir('identidad'));
  const out = snapshot(proj, lines.map((l) => l.start + 0.95), P('brand', 'identidad-poses.jpg'));
  console.log(out);
} else {
  const date = arg('date', todayMadrid());
  const ep = loadEpisode(date);
  const tl = readJSON(path.join(outDir(date), 'timeline.json'));
  const audio = path.join(buildDir(date) + '-work', 'audio.wav');
  const proj = buildProject(ep, tl, audio, buildDir(date));
  const at = arg('at') ? String(arg('at')).split(',').map(Number) : [0, ...tl.lines.map((l) => (l.start + l.end) / 2)];
  console.log(snapshot(proj, at, path.join(outDir(date), 'snap.jpg')));
}
