// Prueba de voz de ~10 s con las tres voces. Mide volumen para descartar voz susurrada.
import fs from 'node:fs';
import path from 'node:path';
import { P, run, FFMPEG, ffmpeg, durationOf, arg } from './lib/common.mjs';
import { synthVoice, layoutTimeline, mixAudio } from './voice.mjs';

const ep = {
  lines: [
    { speaker: 'narrador', text: 'Última hora: una inteligencia artificial pide vacaciones.' },
    { speaker: 'user', text: 'Lía, ¿me ayudas con un Excel de cuarenta pestañas?' },
    { speaker: 'lia', text: 'Claro que sí. Bueno… ¿cuarenta? Dame un segundo, que me estoy agobiando.' },
  ],
};
const work = P('build', 'tts-test');
fs.mkdirSync(work, { recursive: true });
const synth = synthVoice(ep, work, { local: !!arg('local') });
const tl = layoutTimeline(ep, synth, { outro: 0.4 });
const out = P('out', 'pruebas');
fs.mkdirSync(out, { recursive: true });
const wav = path.join(out, 'prueba-voz.wav');
mixAudio(tl, wav, { bedVolume: 0.12 });
const vol = run(FFMPEG, ['-hide_banner', '-i', wav, '-af', 'volumedetect', '-f', 'null', '-'], { check: false }).stderr;
const mean = parseFloat((vol.match(/mean_volume: (-?[\d.]+)/) || [])[1]);
const ok = mean > -26;
ffmpeg(['-i', wav, '-c:a', 'libmp3lame', '-q:a', '3', path.join(out, 'prueba-voz.mp3')]);
console.log(JSON.stringify({ ok, engine: synth.engine, duration: durationOf(wav), meanVolumeDb: mean, file: path.join(out, 'prueba-voz.mp3') }));
process.exit(ok ? 0 : 1);
