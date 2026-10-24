// Esquema y validación de episode.json (ver docs/EPISODE.md).
import { POSE_NAMES } from '../../engine/src/poses.js';
import { SFX } from '../sfx.mjs';

export const SPEAKERS = ['lia', 'user', 'narrador'];
export const BACKGROUNDS = ['terminal', 'oficina', 'servidor', 'plato'];
export const CAMS = ['general', 'medio', 'cara'];
export const FX = ['shake', 'zoom', 'alarma', 'flash', 'glitch', 'humo', 'confeti', 'sudor'];
export const SFX_NAMES = Object.keys(SFX);
export const SERIES = { actualidad: 'APUROS DEL DÍA', 'dia-a-dia': 'IA EN APUROS' };
export const HASHTAGS = ['#iaenapuros', '#ia', '#inteligenciaartificial', '#claude', '#humor'];

export function validateEpisode(ep) {
  const err = [];
  const need = (c, m) => !c && err.push(m);
  need(/^\d{4}-\d{2}-\d{2}$/.test(ep.date || ''), 'date debe ser YYYY-MM-DD');
  need(SERIES[ep.series], `series debe ser ${Object.keys(SERIES).join('|')}`);
  need(typeof ep.title === 'string' && ep.title.length >= 8 && ep.title.length <= 90, 'title: 8-90 caracteres');
  need(!ep.background || BACKGROUNDS.includes(ep.background), `background: ${BACKGROUNDS.join('|')}`);
  need(ep.topic && typeof ep.topic.key === 'string' && ep.topic.key.length > 2, 'topic.key obligatorio (slug único del tema)');
  if (ep.series === 'actualidad') {
    const s = (ep.topic && ep.topic.sources) || [];
    need(s.length > 0 && s.every((x) => /^https?:\/\//.test(x.url || '') && x.name && x.date), 'actualidad: topic.sources[{name,url,date}] obligatorio');
  }
  need(Array.isArray(ep.lines) && ep.lines.length >= 4 && ep.lines.length <= 14, 'lines: entre 4 y 14');
  let words = 0;
  (ep.lines || []).forEach((ln, i) => {
    const at = `lines[${i}]`;
    need(SPEAKERS.includes(ln.speaker), `${at}.speaker: ${SPEAKERS.join('|')}`);
    need(typeof ln.text === 'string' && ln.text.length > 0 && ln.text.length <= 160, `${at}.text: 1-160 caracteres`);
    words += (ln.text || '').split(/\s+/).filter(Boolean).length;
    if (ln.pose) need(POSE_NAMES.includes(ln.pose), `${at}.pose: ${POSE_NAMES.join('|')}`);
    if (ln.react) need(POSE_NAMES.includes(ln.react.pose), `${at}.react.pose inválida`);
    if (ln.cam) need(CAMS.includes(ln.cam), `${at}.cam: ${CAMS.join('|')}`);
    if (ln.bg) need(BACKGROUNDS.includes(ln.bg), `${at}.bg: ${BACKGROUNDS.join('|')}`);
    (ln.fx || []).forEach((f) => need(FX.includes(f), `${at}.fx "${f}": ${FX.join('|')}`));
    (ln.sfx || []).forEach((s) => {
      const n = typeof s === 'string' ? s : s.name;
      need(SFX_NAMES.includes(n), `${at}.sfx "${n}": ${SFX_NAMES.join('|')}`);
    });
    if (ln.hud) need(typeof ln.hud.label === 'string' && ln.hud.value >= 0 && ln.hud.value <= 1, `${at}.hud {label, value 0-1}`);
    if (ln.popup) need(ln.popup.text && ln.popup.text.length <= 60, `${at}.popup.text ≤ 60`);
    if (ln.sticker) need(ln.sticker.length <= 12, `${at}.sticker ≤ 12 caracteres`);
  });
  need(words >= 60 && words <= 125, `guion: ${words} palabras; objetivo 70-110 para 30-45 s`);
  const c = ep.caption || {};
  need(typeof c.body === 'string' && c.body.length > 10, 'caption.body obligatorio');
  need(typeof c.cta === 'string' && (/\?\s*$/.test(c.cta) || /comenta\s+[A-ZÁÉÍÓÚÑ]{3,}/i.test(c.cta)), 'caption.cta: pregunta o "Comenta PALABRA"');
  need(typeof ep.comment === 'string' && ep.comment.length > 5, 'comment obligatorio (comentario a fijar)');
  return { ok: err.length === 0, errors: err, words };
}
