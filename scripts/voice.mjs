// Voz (Edge TTS → fallback SAPI), temporización por palabra y mezcla final de audio.
import fs from 'node:fs';
import path from 'node:path';
import { P, PYTHON, PYTHON_TTS, FFMPEG, run, ffmpeg, durationOf, config, writeJSON } from './lib/common.mjs';

const DEFAULT_VOICES = {
  lia: { voice: 'es-ES-ElviraNeural', rate: '+8%', pitch: '+0Hz' },
  user: { voice: 'es-ES-AlvaroNeural', rate: '+4%', pitch: '+0Hz' },
  narrador: { voice: 'es-ES-XimenaNeural', rate: '+6%', pitch: '+0Hz' },
};

const addPct = (rate, boost) => {
  const n = parseInt(rate, 10) + boost;
  return (n >= 0 ? '+' : '') + n + '%';
};

// Une signos sueltos a la palabra anterior: "hola —" → "hola—"
function displayTokens(text) {
  const out = [];
  for (const tok of text.split(/\s+/).filter(Boolean)) {
    if (/^[^\p{L}\p{N}]+$/u.test(tok) && out.length) out[out.length - 1] += tok;
    else out.push(tok);
  }
  return out;
}

function alignWords(text, bw, dur) {
  const toks = displayTokens(text);
  if (bw.length === toks.length) return toks.map((w, i) => ({ w, s: bw[i].s, e: bw[i].e }));
  // reparto proporcional por longitud dentro del tramo hablado
  const s0 = bw.length ? bw[0].s : 0.08;
  const e0 = bw.length ? bw[bw.length - 1].e : dur - 0.08;
  const total = toks.reduce((a, w) => a + w.length + 1, 0);
  let acc = s0;
  return toks.map((w) => {
    const d = ((w.length + 1) / total) * (e0 - s0);
    const r = { w, s: acc, e: acc + d * 0.92 };
    acc += d;
    return r;
  });
}

// Arranque y final de la voz (sin los silencios de los extremos)
function speechBounds(wav, dur) {
  const log = run(FFMPEG, ['-hide_banner', '-nostats', '-i', wav, '-af', 'silencedetect=noise=-40dB:d=0.08', '-f', 'null', '-'], { check: false }).stderr;
  const starts = [...log.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => parseFloat(m[1]));
  const ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) => parseFloat(m[1]));
  const onset = starts.length && starts[0] <= 0.02 && ends.length ? ends[0] : 0;
  // el último silencio llega hasta el final del archivo (con o sin silence_end)
  const lastStart = starts.length ? starts[starts.length - 1] : dur;
  const toEof = ends.length < starts.length || ends[ends.length - 1] >= dur - 0.05;
  const offset = lastStart > onset + 0.2 && toEof ? lastStart : dur;
  // silencios internos [inicio, fin] para ajustar palabras que empiezan dentro de una pausa
  const gaps = starts.map((st, i) => [st, ends[i] ?? dur]).filter(([a, b]) => a > onset && b < offset);
  return { onset, offset, gaps };
}

// Primera grabación de referencia que exista (rutas sin extensión aceptan wav/m4a/mp3/ogg/webm).
// Se normaliza a WAV mono 24 kHz, sin silencios en los extremos y con volumen estándar.
const refCache = new Map();
function refAudio(candidates, work) {
  for (const c of candidates.filter(Boolean)) {
    const opts = path.extname(c) ? [c] : ['.wav', '.m4a', '.mp3', '.ogg', '.webm'].map((e) => c + e);
    const src = opts.map((o) => P(o)).find((o) => fs.existsSync(o));
    if (!src) continue;
    if (refCache.has(src)) return refCache.get(src);
    const out = path.join(work, 'ref-' + path.basename(src).replace(/\.[^.]+$/, '') + '.wav');
    ffmpeg(['-i', src, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB:stop_periods=-1:stop_duration=0.6:stop_threshold=-45dB,loudnorm=I=-18', '-ac', '1', '-ar', '24000', '-t', '20', out]);
    refCache.set(src, out);
    return out;
  }
  return null;
}

export function synthVoice(ep, work, { rateBoost = 0, local = false } = {}) {
  const voices = { ...DEFAULT_VOICES, ...(config().voices || {}) };
  const ttsDir = path.join(work, 'tts');
  fs.rmSync(ttsDir, { recursive: true, force: true });
  fs.mkdirSync(ttsDir, { recursive: true });
  const jobs = ep.lines.map((ln, i) => {
    let v = voices[ln.speaker] || voices.user;
    // voz clonada local (Chatterbox): solo si existe alguna grabación de referencia
    const ref = v.engine === 'chatterbox' && !local ? refAudio(v.refs || [v.ref], work) : null;
    if (v.engine === 'chatterbox' && !ref) v = v.fallback || DEFAULT_VOICES.user;
    const id = 'l' + String(i).padStart(2, '0');
    if (v.engine === 'chatterbox')
      return { id, text: ln.say || ln.text, engine: 'chatterbox', ref, exaggeration: v.exaggeration ?? 0.5, cfg: v.cfg ?? 0.5, seed: i + 1, speaker: ln.speaker, fallback: v.fallback };
    return { id, text: ln.say || ln.text, voice: v.voice, rate: addPct(v.rate, rateBoost), pitch: v.pitch, speaker: ln.speaker };
  });
  let edgeJobs = jobs.filter((j) => j.engine !== 'chatterbox');
  const cbJobs = jobs.filter((j) => j.engine === 'chatterbox');
  if (cbJobs.length) {
    const cbFile = path.join(work, 'tts-cb-jobs.json');
    writeJSON(cbFile, cbJobs);
    const r = run(PYTHON_TTS, [P('scripts', 'tts_chatterbox.py'), cbFile, ttsDir], { check: false, timeout: 900000, env: { TQDM_DISABLE: '1', PYTHONIOENCODING: 'utf-8' } });
    const missing = cbJobs.filter((j) => !fs.existsSync(path.join(ttsDir, j.id + '.json')));
    if (r.code !== 0 || missing.length) {
      // si falla la voz local, esas líneas pasan a Edge con la voz de respaldo
      const fb = missing.length ? missing : cbJobs;
      edgeJobs = edgeJobs.concat(fb.map((j) => ({ id: j.id, text: j.text, speaker: j.speaker, ...(j.fallback || DEFAULT_VOICES.user), rate: addPct((j.fallback || DEFAULT_VOICES.user).rate, rateBoost) })));
    }
  }
  const jobsFile = path.join(work, 'tts-jobs.json');
  writeJSON(jobsFile, edgeJobs);
  if (edgeJobs.length) run(PYTHON, [P('scripts', 'tts.py'), jobsFile, ttsDir, ...(local ? ['--local'] : [])], { timeout: 300000 });
  const engines = new Set();
  const lines = jobs.map((j, i) => {
    const meta = JSON.parse(fs.readFileSync(path.join(ttsDir, j.id + '.json'), 'utf8'));
    engines.add(meta.engine);
    const wav = path.join(ttsDir, j.id + '.wav');
    // la voz clonada no tiene control de ritmo: se acelera con atempo si hace falta encajar la duración
    const tempo = meta.engine === 'chatterbox' && rateBoost > 0 ? 1 + rateBoost / 100 : 1;
    const af = ['-ar', '48000', '-ac', '1', ...(tempo !== 1 ? ['-af', `atempo=${tempo}`] : [])];
    if (meta.file !== j.id + '.wav') ffmpeg(['-i', path.join(ttsDir, meta.file), ...af, wav]);
    else ffmpeg(['-i', wav, ...af, wav + '.tmp.wav']), fs.renameSync(wav + '.tmp.wav', wav);
    if (tempo !== 1) meta.words = meta.words.map((w) => ({ ...w, s: w.s / tempo, e: w.e / tempo }));
    const dur = durationOf(wav);
    // calibración: las marcas de Edge llegan ~80-100 ms antes que la voz real.
    // Se mide el arranque y el final reales de la voz en la forma de onda.
    const { onset, offset: speechEnd, gaps } = speechBounds(wav, dur);
    // Whisper (voz clonada) ya da tiempos reales, salvo la 1.ª palabra, que pega a 0: se lleva al arranque
    const shift = meta.words.length && meta.engine !== 'chatterbox' ? Math.min(0.25, Math.max(-0.05, onset - meta.words[0].s)) : 0;
    const bw = meta.words.map((w) => ({ ...w, s: w.s + shift, e: w.e + shift }));
    if (meta.engine === 'chatterbox' && bw.length) bw[0].s = Math.min(Math.max(bw[0].s, onset), bw[0].e - 0.05);
    // una palabra no puede empezar en mitad de un silencio: se lleva al final de la pausa
    for (const w of bw)
      for (const [a, b] of gaps)
        if (w.s >= a - 0.02 && w.s < b) {
          w.s = b;
          w.e = Math.max(w.e, b + 0.08);
        }
    const words = alignWords(ep.lines[i].text, bw, dur);
    const lead = Math.max(0, onset - 0.04);
    const tail = Math.min(dur, Math.max(speechEnd + 0.06, bw.length ? bw[bw.length - 1].e + 0.06 : 0));
    return { wav, dur, lead, tail, words };
  });
  return { lines, engine: [...engines].join('+') };
}

// Coloca las líneas en el tiempo. Devuelve el timeline del episodio.
export function layoutTimeline(ep, synth, { gap = 0.22, startAt = 0.35, outro = 1.4 } = {}) {
  let t = startAt;
  const lines = ep.lines.map((ln, i) => {
    const s = synth.lines[i];
    const start = t + (ln.pause || 0);
    const len = s.tail - s.lead;
    const words = s.words.map((w) => ({ w: w.w, s: +(w.s - s.lead + start).toFixed(3), e: +(w.e - s.lead + start).toFixed(3) }));
    t = start + len + gap;
    return { ...ln, i, start: +start.toFixed(3), end: +(start + len).toFixed(3), words, audio: { file: s.wav, from: s.lead, len } };
  });
  const duration = +(lines[lines.length - 1].end + outro).toFixed(2);
  return { duration, lines };
}

const AUTO_SFX = { alarma: 'alarma', glitch: 'glitch', zoom: 'whoosh', confeti: 'ding', flash: 'pop', shake: 'boing' };

export function sfxEvents(tl) {
  const ev = [];
  for (const ln of tl.lines) {
    const named = new Set();
    for (const s of ln.sfx || []) {
      const o = typeof s === 'string' ? { name: s, at: 0 } : s;
      named.add(o.name);
      ev.push({ name: o.name, t: ln.start + (o.at || 0) });
    }
    for (const f of ln.fx || []) if (AUTO_SFX[f] && !named.has(AUTO_SFX[f]) && !(ln.sfx || []).length) ev.push({ name: AUTO_SFX[f], t: ln.start });
    if (ln.sticker && !named.has('pop')) ev.push({ name: 'pop', t: ln.start + (ln.stickerAt || 0.2) });
    if (ln.popup && !(ln.sfx || []).length) ev.push({ name: 'error', t: ln.start + 0.15 });
  }
  return ev.filter((e) => e.t < tl.duration - 0.2);
}

// Cama musical sintetizada: acordes suaves + pulso pizzicato
const BED =
  "aevalsrc='(0.10*(sin(2*PI*R*t)+0.6*sin(2*PI*1.5*R*t)+0.35*sin(2*PI*2*R*t))*min(1,min(mod(t,4)*5,(4-mod(t,4))*5))" +
  "+0.10*sin(2*PI*2*R*t)*exp(-14*mod(t,0.5))*(1-0.5*gte(mod(t,1),0.5)))'";
const ROOT_EXPR = 'if(lt(mod(t,16),4),220,if(lt(mod(t,16),8),174.61,if(lt(mod(t,16),12),261.63,196)))';

export function mixAudio(tl, outWav, { bedVolume = 0.16 } = {}) {
  const args = [];
  const filters = [];
  let n = 0;
  const vLabels = [];
  for (const ln of tl.lines) {
    args.push('-i', ln.audio.file);
    const d = Math.round(ln.start * 1000);
    filters.push(`[${n}:a]atrim=start=${ln.audio.from.toFixed(3)}:duration=${ln.audio.len.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=out:st=${Math.max(0, ln.audio.len - 0.05).toFixed(3)}:d=0.05,adelay=${d}|${d}[v${n}]`);
    vLabels.push(`[v${n}]`);
    n++;
  }
  filters.push(`${vLabels.join('')}amix=inputs=${vLabels.length}:normalize=0,apad=whole_dur=${tl.duration},asplit=2[voice][key]`);
  const ev = sfxEvents(tl);
  const sLabels = [];
  for (const e of ev) {
    args.push('-i', P('engine', 'sfx', e.name + '.wav'));
    const d = Math.round(e.t * 1000);
    filters.push(`[${n}:a]volume=0.55,adelay=${d}|${d}[s${n}]`);
    sLabels.push(`[s${n}]`);
    n++;
  }
  args.push('-f', 'lavfi', '-i', BED.replace(/R/g, ROOT_EXPR) + `:s=48000:d=${tl.duration}`);
  filters.push(`[${n}:a]lowpass=f=1400,volume=${bedVolume},afade=t=in:d=0.6,afade=t=out:st=${Math.max(0, tl.duration - 1)}:d=1[bed]`);
  filters.push(`[bed][key]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=350[bedd]`);
  const mixIn = ['[voice]', '[bedd]', ...sLabels];
  filters.push(`${mixIn.join('')}amix=inputs=${mixIn.length}:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000,aformat=channel_layouts=stereo[out]`);
  const fgFile = outWav + '.filter.txt';
  fs.writeFileSync(fgFile, filters.join(';\n'));
  ffmpeg([...args, '-filter_complex_script', fgFile, '-map', '[out]', '-t', String(tl.duration), '-ar', '48000', '-c:a', 'pcm_s16le', outWav]);
  return { sfx: ev.length };
}
