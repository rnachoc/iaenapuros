// Contexto compacto para escribir el episodio del día (pocos tokens).
import fs from 'node:fs';
import { todayMadrid, readLog, config, arg, P } from './lib/common.mjs';

const date = arg('date', todayMadrid());
const today = readLog().episodes.find((e) => e.date === date);
if (today) console.log(`HOY YA HAY EPISODIO: estado=${today.status} intentos=${today.attempts || 0} tema=${today.topicKey}`);
const eps = readLog().episodes.filter((e) => e.date < date && e.status !== 'failed');
const last = eps.slice(-3).map((e) => e.series);
const streak = last.length === 3 && last.every((s) => s === last[0]) ? last[0] : null;
const dow = new Intl.DateTimeFormat('es-ES', { weekday: 'long', timeZone: 'Europe/Madrid' }).format(new Date(date + 'T12:00:00'));

console.log(`Fecha: ${date} (${dow}) · publicación: ${(config().publish || {}).mode || 'dry-run'}`);
console.log(streak ? `Serie obligatoria hoy: ${streak === 'actualidad' ? 'dia-a-dia' : 'actualidad (si hay noticia con fuente; si no, dia-a-dia)'} (3 seguidas de ${streak})` : 'Serie: libre (actualidad si hay noticia de <48 h con fuente)');
console.log('Temas ya usados (no repetir):');
for (const e of eps.slice(-40)) console.log(`- ${e.date} [${e.series}] ${e.topicKey} — ${e.title}`);
if (!eps.length) console.log('- (ninguno)');

// lecciones del jurado: lo que hay que evitar al escribir el guion de hoy
const ap = P('docs', 'APRENDIZAJE.md');
if (fs.existsSync(ap)) {
  const txt = fs.readFileSync(ap, 'utf8');
  const sec = (h) =>
    (txt.split('## ' + h)[1] || '')
      .split('\n## ')[0]
      .split('\n')
      .filter((l) => l.startsWith('- ') && !l.includes('(todavía') && !l.includes('(nada)'));
  const rules = sec('Reglas activas');
  const top = sec('Los reels mejor valorados');
  if (rules.length) console.log('LECCIONES DEL JURADO (obligatorio aplicarlas):\n' + rules.join('\n'));
  if (top.length) console.log('Reels que mejor funcionaron:\n' + top.slice(0, 3).join('\n'));
}

// lecciones de la audiencia real: las propone el Estratega cada semana y solo se guardan tras aprobarlas
const fa = P('docs', 'FEEDBACK-AUDIENCIA.md');
if (fs.existsSync(fa)) {
  const reglas = (fs.readFileSync(fa, 'utf8').split('## Reglas activas')[1] || '')
    .split('\n## ')[0]
    .split('\n')
    .filter((l) => l.startsWith('- ') && !l.includes('(todavía'))
    .slice(0, 8);
  if (reglas.length) console.log('LECCIONES DE LA AUDIENCIA REAL (obligatorio aplicarlas):\n' + reglas.join('\n'));
}
