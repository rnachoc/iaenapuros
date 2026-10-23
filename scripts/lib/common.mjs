// Utilidades compartidas por los scripts del pipeline.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const P = (...a) => path.join(ROOT, ...a);
export const FFMPEG = require('ffmpeg-static');
export const FFPROBE = require('ffprobe-static').path;
export const PYTHON = process.platform === 'win32' ? P('.venv', 'Scripts', 'python.exe') : P('.venv', 'bin', 'python');
// entorno aparte para la voz clonada local (Chatterbox + PyTorch CUDA)
export const PYTHON_TTS = process.platform === 'win32' ? P('.venv-tts', 'Scripts', 'python.exe') : P('.venv-tts', 'bin', 'python');
// CLI de HyperFrames lanzado con node (evita el .cmd en Windows)
export const hf = (args, opts) => run(process.execPath, [P('node_modules', 'hyperframes', 'bin', 'hyperframes.mjs'), ...args], opts);

export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd || ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...hfEnv(), ...(opts.env || {}) },
    input: opts.input,
    shell: opts.shell || false,
    timeout: opts.timeout,
  });
  const res = { code: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '', error: r.error };
  if (opts.check !== false && res.code !== 0) {
    const tail = (res.stderr || res.stdout).split('\n').slice(-15).join('\n');
    throw new Error(`${path.basename(cmd)} falló (${res.code}): ${tail || res.error}`);
  }
  return res;
}

export function hfEnv() {
  return {
    HYPERFRAMES_FFMPEG_PATH: FFMPEG,
    HYPERFRAMES_FFPROBE_PATH: FFPROBE,
    HYPERFRAMES_SKIP_SKILLS: '1',
  };
}

export const ffmpeg = (args, opts) => run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], opts);

export function probe(file) {
  const r = run(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]);
  return JSON.parse(r.stdout);
}
export const durationOf = (file) => parseFloat(probe(file).format.duration);

export const readJSON = (f, def) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : def);
export function writeJSON(f, data) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export function todayMadrid(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function arg(name, def = undefined) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return !v || v.startsWith('--') ? true : v;
}

// .env: se lee sin imprimir nunca su contenido
export function loadEnv() {
  const f = P('.env');
  const env = {};
  if (!fs.existsSync(f)) return env;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}
export function setEnvVar(key, value) {
  const f = P('.env');
  const lines = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split(/\r?\n/) : [];
  const i = lines.findIndex((l) => l.startsWith(key + '='));
  if (i >= 0) lines[i] = `${key}=${value}`;
  else lines.push(`${key}=${value}`);
  fs.writeFileSync(f, lines.join('\n').replace(/\n+$/, '') + '\n', 'utf8');
}

export const CONFIG_FILE = P('state', 'config.json');
export const LOG_FILE = P('state', 'log.json');
export const config = () => readJSON(CONFIG_FILE, {});
export const readLog = () => readJSON(LOG_FILE, { episodes: [] });

export function upsertLog(date, patch) {
  const log = readLog();
  let e = log.episodes.find((x) => x.date === date);
  if (!e) {
    e = { date };
    log.episodes.push(e);
    log.episodes.sort((a, b) => a.date.localeCompare(b.date));
  }
  Object.assign(e, patch, { updatedAt: new Date().toISOString() });
  writeJSON(LOG_FILE, log);
  return e;
}

export const epDir = (date) => P('episodes', date);
export const outDir = (date) => P('out', date);
export const buildDir = (date) => P('build', date);
