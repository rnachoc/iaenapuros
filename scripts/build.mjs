// Convierte episode.json (+ timeline de voz) en un proyecto HyperFrames listo para renderizar.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { P } from './lib/common.mjs';
import { SERIES } from './lib/episode.mjs';

const require = createRequire(import.meta.url);

const FONTS = [
  '@fontsource/archivo-black/files/archivo-black-latin-400-normal.woff2',
  '@fontsource/archivo-black/files/archivo-black-latin-ext-400-normal.woff2',
  '@fontsource/inter/files/inter-latin-600-normal.woff2',
  '@fontsource/inter/files/inter-latin-800-normal.woff2',
  '@fontsource/inter/files/inter-latin-900-normal.woff2',
];

// Empaqueta el motor (Three.js incluido) en un IIFE. Se recompila solo si cambian las fuentes.
export function bundleEngine() {
  const out = P('engine', 'dist', 'engine.js');
  const srcDir = P('engine', 'src');
  const newest = Math.max(...fs.readdirSync(srcDir).map((f) => fs.statSync(path.join(srcDir, f)).mtimeMs));
  if (fs.existsSync(out) && fs.statSync(out).mtimeMs > newest) return out;
  require('esbuild').buildSync({
    entryPoints: [path.join(srcDir, 'main.js')],
    bundle: true,
    format: 'iife',
    minify: true,
    target: 'chrome120',
    outfile: out,
    nodePaths: [P('node_modules')],
  });
  return out;
}

function fmtDate(d) {
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}/${y}`;
}

export function buildProject(ep, tl, audioWav, dir) {
  // se vacía el contenido (no la carpeta: en Windows puede estar abierta por otro proceso)
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { recursive: true, force: true, maxRetries: 5 });
  fs.mkdirSync(path.join(dir, 'assets', 'fonts'), { recursive: true });
  const engine = bundleEngine();
  fs.copyFileSync(engine, path.join(dir, 'assets', 'engine.js'));
  fs.copyFileSync(P('node_modules', 'gsap', 'dist', 'gsap.min.js'), path.join(dir, 'assets', 'gsap.min.js'));
  for (const f of FONTS) fs.copyFileSync(P('node_modules', f), path.join(dir, 'assets', 'fonts', path.basename(f)));
  fs.copyFileSync(audioWav, path.join(dir, 'assets', 'audio.wav'));

  const src = ep.topic && ep.topic.sources && ep.topic.sources[0];
  const data = {
    id: ep.date,
    title: ep.title,
    series: ep.series,
    seriesLabel: SERIES[ep.series],
    background: ep.background || (ep.series === 'actualidad' ? 'plato' : 'terminal'),
    duration: tl.duration,
    seed: [...ep.date].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0,
    source: src ? `${src.name} · ${fmtDate(src.date)}` : null,
    topic: { ticker: ((ep.topic && ep.topic.ticker) || ep.title).toUpperCase() + '  ·  ' },
    lines: tl.lines.map(({ audio, say, ...ln }) => ln),
  };
  fs.writeFileSync(path.join(dir, 'assets', 'episode-data.js'), 'window.EPISODE = ' + JSON.stringify(data) + ';\n', 'utf8');
  const html = fs.readFileSync(P('engine', 'template', 'index.html'), 'utf8').replaceAll('{{DURATION}}', String(tl.duration));
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
  return dir;
}
