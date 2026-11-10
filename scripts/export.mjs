// Deja el reel del día listo para programarlo a mano en Instagram: para-publicar/<fecha>/
//   reel.mp4 · portada.jpg · descripcion.txt · comentario.txt
// Uso: node scripts/export.mjs [--date YYYY-MM-DD] [--portada segundos]
import fs from 'node:fs';
import path from 'node:path';
import { P, arg, readJSON, ffmpeg, outDir, todayMadrid } from './lib/common.mjs';

export function exportDay(date, portada) {
  const out = outDir(date);
  const mp4 = path.join(out, 'reel.mp4');
  if (!fs.existsSync(mp4)) return { ok: false, error: `falta ${mp4}` };
  const dest = P('para-publicar', date);
  fs.mkdirSync(dest, { recursive: true });
  fs.copyFileSync(mp4, path.join(dest, 'reel.mp4'));
  fs.copyFileSync(path.join(out, 'caption.txt'), path.join(dest, 'descripcion.txt'));
  fs.copyFileSync(path.join(out, 'comment.txt'), path.join(dest, 'comentario.txt'));

  // portada: final del gancho (título, popup y fx ya asentados); --portada <s> la fija a mano
  const tl = readJSON(path.join(out, 'timeline.json'), { lines: [] });
  const at = portada != null ? Number(portada) : tl.lines[0] ? Math.max(0.1, tl.lines[0].end - 0.05) : 0.1;
  ffmpeg(['-ss', at.toFixed(2), '-i', mp4, '-frames:v', '1', '-q:v', '2', path.join(dest, 'portada.jpg')]);
  return { ok: true, carpeta: dest };
}

if (process.argv[1] && process.argv[1].endsWith('export.mjs')) {
  const r = exportDay(arg('date', todayMadrid()), arg('portada'));
  try {
    (await import('./brain-status.mjs')).writeBrainStatus();
  } catch {}
  console.log(JSON.stringify(r));
}
