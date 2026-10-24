// Capa 2D: título-gancho, subtítulos palabra a palabra, HUD, popups, stickers y efectos.
import { clamp, smooth, easeOutBack, easeOutCubic, noise1 } from './util.js';

const SPEAKER = {
  lia: { label: 'CLAUDE', cls: 'sp-lia' },
  user: { label: 'TÚ', cls: 'sp-user' },
  narrador: { label: 'NOTICIA', cls: 'sp-news' },
};

const $ = (id) => document.getElementById(id);

function fitFont(el, start, min, maxH) {
  let fs = start;
  el.style.fontSize = fs + 'px';
  while (fs > min && el.scrollHeight > maxH) {
    fs -= 2;
    el.style.fontSize = fs + 'px';
  }
  return fs;
}

function fitWidth(el, start, min, maxW) {
  let fs = start;
  el.style.fontSize = fs + 'px';
  while (fs > min && el.scrollWidth > maxW) {
    fs -= 2;
    el.style.fontSize = fs + 'px';
  }
  return fs;
}

// Frases cortas al estilo @tarritoai: se corta en cada signo de puntuación
// o al pasar de 5 palabras / 30 caracteres.
function chunkWords(words) {
  const chunks = [];
  let cur = [];
  let len = 0;
  words.forEach((w) => {
    if (cur.length && (cur.length >= 5 || len + w.w.length > 30)) {
      chunks.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(w);
    len += w.w.length + 1;
    if (/[.,;:!?…]$/.test(w.w)) {
      chunks.push(cur);
      cur = [];
      len = 0;
    }
  });
  if (cur.length) chunks.push(cur);
  return chunks;
}

export function createOverlays(ep) {
  // ---- título ----
  $('series-pill').textContent = ep.seriesLabel;
  $('series-pill').className = ep.series === 'actualidad' ? 'pill pill-news' : 'pill';
  const title = $('title');
  title.textContent = ep.title;
  fitFont(title, 74, 46, 3 * 74 * 1.1);
  const src = $('source');
  if (ep.source) {
    src.textContent = 'Fuente: ' + ep.source;
    src.style.display = 'block';
    fitWidth(src, 28, 18, 880);
  }
  // el HUD se reserva dentro del panel si el episodio lo usa (no mueve el título)
  const hud = $('hud');
  const firstHud = ep.lines.find((l) => l.hud);
  if (firstHud) hud.style.display = 'flex';
  const panel = $('title-panel');
  const y = panel.offsetTop + panel.offsetHeight;
  const popup = $('popup');
  const sticker = $('sticker');
  sticker.style.top = y + 60 + 'px';

  // ---- subtítulos: se preconstruyen todos los grupos ----
  const subs = $('subs');
  const groups = [];
  ep.lines.forEach((ln, li) => {
    const chunks = chunkWords(ln.words);
    chunks.forEach((ch, ci) => {
      const div = document.createElement('div');
      div.className = 'chunk ' + (SPEAKER[ln.speaker] || SPEAKER.user).cls;
      const spans = ch.map((w) => {
        const s = document.createElement('span');
        s.className = 'w';
        s.textContent = w.w;
        div.appendChild(s);
        return s;
      });
      div.style.display = 'none';
      subs.appendChild(div);
      const next = chunks[ci + 1];
      const start = ch[0].s;
      const end = next ? next[0].s - 0.03 : ln.end + 0.3;
      groups.push({ div, spans, words: ch, start, end, line: li });
    });
  });

  const speaker = $('speaker');
  const flash = $('flash');
  const alarm = $('alarm');
  const scan = $('scan');
  const gl = $('gl');
  const outro = $('outro');
  const lastEnd = ep.lines[ep.lines.length - 1].end;

  // valores del HUD por línea (con arrastre)
  let hudState = firstHud ? { ...firstHud.hud, value: 0, t: -1 } : null;
  const hudKeys = ep.lines.map((ln) => {
    if (ln.hud === null) hudState = null;
    else if (ln.hud) hudState = { ...ln.hud, t: ln.start };
    return hudState;
  });

  let shownGroup = null;

  function lineAt(t) {
    let k = -1;
    for (let i = 0; i < ep.lines.length; i++) if (t >= ep.lines[i].start - 0.05) k = i;
    return k;
  }

  return function render(t) {
    const li = lineAt(t);
    const ln = li >= 0 ? ep.lines[li] : null;

    // subtítulos
    const gr = groups.find((g) => t >= g.start - 0.03 && t < g.end) || null;
    if (gr !== shownGroup) {
      if (shownGroup) shownGroup.div.style.display = 'none';
      if (gr) gr.div.style.display = 'block';
      shownGroup = gr;
    }
    if (gr) {
      // cada palabra aparece cuando se dice (fundido corto + leve subida)
      gr.spans.forEach((sp, i) => {
        const u = clamp((t - (gr.words[i].s - 0.03)) / 0.05);
        sp.style.opacity = u;
        sp.style.transform = `translateY(${(1 - easeOutCubic(u)) * 10}px)`;
      });
    }
    speaker.style.opacity = 0;

    // HUD
    const hk = li >= 0 ? hudKeys[li] : firstHud ? { ...firstHud.hud, t: -1 } : null;
    if (hk) {
      const prev = li > 0 && hudKeys[li - 1] ? hudKeys[li - 1].value : 0;
      const u = li >= 0 ? easeOutCubic((t - hk.t) / 0.7) : 1;
      const v = prev + (hk.value - prev) * u;
      hud.style.opacity = 1;
      $('hud-label').textContent = hk.label;
      $('hud-fill').style.width = clamp(v, 0, 1) * 100 + '%';
      $('hud-fill').style.background = v > 0.85 ? '#FF5A5F' : v > 0.6 ? '#FFB547' : '#2EC4B6';
      $('hud-val').textContent = Math.round(v * 100) + '%';
      hud.style.transform = v > 0.9 ? `translateX(${noise1(t * 30, 5) * 6}px)` : 'none';
    } else hud.style.opacity = firstHud ? 0.35 : 0;

    // popup
    if (ln && ln.popup && t < ln.end + 0.25) {
      const u = easeOutBack((t - (ln.start + 0.15)) / 0.28, 1.8);
      popup.style.opacity = clamp((t - ln.start - 0.15) / 0.08);
      $('popup-title').textContent = ln.popup.title || 'Aviso';
      $('popup-text').textContent = ln.popup.text || '';
      popup.style.transform = `rotate(-3deg) scale(${0.6 + 0.4 * u})`;
    } else popup.style.opacity = 0;

    // sticker (onomatopeya)
    if (ln && ln.sticker && t < ln.end + 0.2) {
      const t0 = ln.start + (ln.stickerAt || 0.2);
      const u = easeOutBack((t - t0) / 0.25, 2.2);
      sticker.textContent = ln.sticker;
      sticker.style.opacity = t >= t0 ? 1 : 0;
      sticker.style.transform = `rotate(8deg) scale(${u})`;
    } else sticker.style.opacity = 0;

    // efectos de pantalla
    let fl = 0;
    let al = 0;
    let gli = 0;
    ep.lines.forEach((l) => {
      if (!l.fx) return;
      if (l.fx.includes('flash') && t >= l.start) fl = Math.max(fl, Math.exp(-(t - l.start) * 9));
      if (l.fx.includes('alarma') && t >= l.start && t < l.end + 0.3)
        al = Math.max(al, 0.5 + 0.5 * Math.sin((t - l.start) * Math.PI * 6 - Math.PI / 2));
      if (l.fx.includes('glitch') && t >= l.start && t < l.start + 0.7) gli = 1;
    });
    flash.style.opacity = fl * 0.85;
    alarm.style.opacity = al * 0.55;
    scan.style.opacity = gli ? 0.6 : 0;
    gl.style.transform = gli ? `translateX(${Math.round(noise1(t * 40, 9) * 24)}px) skewX(${noise1(t * 33, 3) * 4}deg)` : 'none';

    // cierre
    const ou = smooth((t - lastEnd - 0.15) / 0.3);
    outro.style.opacity = ou;
    outro.style.transform = `translateY(${(1 - ou) * 30}px)`;

    return { glitch: gli };
  };
}
