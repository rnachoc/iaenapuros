// Pie de Instagram, comentario a fijar y copia lista para TikTok.
import fs from 'node:fs';
import path from 'node:path';
import { P, outDir } from './lib/common.mjs';
import { HASHTAGS } from './lib/episode.mjs';

const fmt = (d) => d.split('-').reverse().join('/');

export function captionText(ep) {
  const parts = [`${ep.title} 🧯`, ep.caption.body];
  const src = (ep.topic && ep.topic.sources) || [];
  if (src.length) parts.push('Fuente: ' + src.map((s) => `${s.name} (${fmt(s.date)})`).join(' · '));
  // el texto termina con la pregunta o el "Comenta PALABRA"; los hashtags van en bloque aparte
  parts.push(ep.caption.cta);
  parts.push(HASHTAGS.join(' '));
  return parts.join('\n\n');
}

export function tiktokText(ep) {
  const t = ep.tiktok && ep.tiktok.caption ? ep.tiktok.caption : `${ep.title} 🧯 ${ep.caption.cta}`;
  return `${t}\n\n${HASHTAGS.join(' ')}`;
}

export function writeCaptions(ep, mp4) {
  const out = outDir(ep.date);
  const caption = captionText(ep);
  if (caption.length > 2200) throw new Error('pie > 2200 caracteres');
  fs.writeFileSync(path.join(out, 'caption.txt'), caption + '\n', 'utf8');
  fs.writeFileSync(path.join(out, 'comment.txt'), ep.comment + '\n', 'utf8');
  const tk = P('out', 'tiktok');
  fs.mkdirSync(tk, { recursive: true });
  const base = `${ep.date}_iaenapuros`;
  fs.copyFileSync(mp4, path.join(tk, base + '.mp4'));
  fs.writeFileSync(path.join(tk, base + '_pie.txt'), tiktokText(ep) + '\n', 'utf8');
  return { caption, tiktok: path.join(tk, base + '.mp4') };
}
