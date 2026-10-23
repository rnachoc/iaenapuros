// Control de calidad técnico del reel + hoja de contactos para revisión visual.
import fs from 'node:fs';
import path from 'node:path';
import { FFMPEG, run, ffmpeg, probe, hf } from './lib/common.mjs';

function filterLog(file, af, vf) {
  const args = ['-hide_banner', '-nostats', '-i', file];
  if (af) args.push('-af', af);
  if (vf) args.push('-vf', vf);
  args.push('-f', 'null', '-');
  return run(FFMPEG, args, { check: false }).stderr;
}

// Auditoría de layout/contraste de HyperFrames sobre el proyecto (texto cortado, desbordes...)
export function layoutCheck(projectDir) {
  const r = hf(['check', '--json'], { cwd: projectDir, check: false, timeout: 600000 });
  const txt = r.stdout.slice(r.stdout.indexOf('{'));
  try {
    const j = JSON.parse(txt);
    return j;
  } catch {
    return { ok: r.code === 0, raw: (r.stdout + r.stderr).slice(-2000) };
  }
}

export function qaReel(file, tl, outDir) {
  const checks = [];
  const add = (name, ok, detail, severity = 'error') => checks.push({ name, ok, detail, severity });

  if (!fs.existsSync(file) || fs.statSync(file).size < 200000) {
    add('archivo', false, 'MP4 inexistente o vacío');
    return { passed: false, checks };
  }
  const pr = probe(file);
  const v = pr.streams.find((s) => s.codec_type === 'video');
  const a = pr.streams.find((s) => s.codec_type === 'audio');
  const dur = parseFloat(pr.format.duration);
  add('vídeo 1080x1920 h264', !!v && v.width === 1080 && v.height === 1920 && v.codec_name === 'h264', v ? `${v.width}x${v.height} ${v.codec_name}` : 'sin vídeo');
  add('30 fps', !!v && /^30(\/1)?$/.test(v.r_frame_rate), v && v.r_frame_rate);
  add('pista de audio', !!a, a ? `${a.codec_name} ${a.sample_rate} Hz` : 'sin audio');
  add('duración 30-45 s', dur >= 29.8 && dur <= 45.5, dur.toFixed(2) + ' s');
  add('duración = guion', Math.abs(dur - tl.duration) < 0.4, `${dur.toFixed(2)} vs ${tl.duration}`);

  const loud = filterLog(file, 'ebur128=framelog=quiet');
  const m = loud.match(/I:\s+(-?[\d.]+) LUFS/);
  const lufs = m ? parseFloat(m[1]) : NaN;
  add('sonoridad -17..-11 LUFS', lufs >= -17 && lufs <= -11, isNaN(lufs) ? 'no medible' : lufs + ' LUFS');

  const sil = filterLog(file, 'silencedetect=noise=-42dB:d=1.6');
  const silences = [...sil.matchAll(/silence_start: ([\d.]+)/g)].map((x) => parseFloat(x[1])).filter((s) => s > 0.6 && s < dur - 1.8);
  add('sin silencios largos', silences.length === 0, silences.length ? 'silencio en ' + silences.map((s) => s.toFixed(1)).join(', ') : 'ok');

  const blk = filterLog(file, null, 'blackdetect=d=0.2:pix_th=0.06');
  const blacks = [...blk.matchAll(/black_start:([\d.]+)/g)].map((x) => parseFloat(x[1]));
  add('sin fotogramas negros', blacks.length === 0, blacks.length ? 'negro en ' + blacks.join(', ') : 'ok');

  const frz = filterLog(file, null, 'freezedetect=n=0.0005:d=3.5');
  const freezes = [...frz.matchAll(/freeze_start: ([\d.]+)/g)].map((x) => parseFloat(x[1]));
  add('sin congelados > 3,5 s', freezes.length === 0, freezes.length ? 'congelado en ' + freezes.join(', ') : 'ok', 'warning');

  // legibilidad de subtítulos: cada palabra visible al menos 0,12 s y velocidad < 4,2 palabras/s
  const words = tl.lines.flatMap((l) => l.words);
  const fast = words.filter((w) => w.e - w.s < 0.08).length;
  const speechTime = tl.lines.reduce((acc, l) => acc + (l.end - l.start), 0);
  const wps = words.length / speechTime;
  add('ritmo de subtítulos legible', wps < 4.2 && fast < words.length * 0.2, `${wps.toFixed(2)} palabras/s`);

  // fotogramas: portada, mitad de cada línea y final
  fs.mkdirSync(outDir, { recursive: true });
  const times = [0, ...tl.lines.map((l) => (l.start + l.end) / 2), dur - 0.4];
  const frames = [];
  times.forEach((t, i) => {
    const f = path.join(outDir, `frame_${String(i).padStart(2, '0')}.jpg`);
    ffmpeg(['-ss', t.toFixed(2), '-i', file, '-frames:v', '1', '-q:v', '3', '-vf', 'scale=360:640', f]);
    frames.push(f);
  });
  fs.copyFileSync(frames[0], path.join(outDir, 'portada.jpg'));
  const cols = 4;
  const rows = Math.ceil(frames.length / cols);
  ffmpeg(['-i', path.join(outDir, 'frame_%02d.jpg'), '-vf', `tile=${cols}x${rows}:padding=6:color=white`, '-frames:v', '1', '-q:v', '3', path.join(outDir, 'contact.jpg')]);
  frames.slice(1).forEach((f) => fs.rmSync(f));

  const passed = checks.every((c) => c.ok || c.severity === 'warning');
  return { passed, checks, contact: path.join(outDir, 'contact.jpg'), lufs, duration: dur };
}
