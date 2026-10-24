// Cara de Claude: pintada sobre el barro en un canvas transparente que se usa como textura.
import { clamp } from './util.js';

const W = 512;
const H = 384;
const INK = '#2A1610';
const HOLE = '#7A2A1C';
const CREAM = '#FFF6EA';
const CRACK = '#6E2F1C';

export function createFaceCanvas() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  return c;
}

function rr(g, x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function eye(g, cx, cy, s, kind, blink, t, side) {
  const open = 1 - blink;
  g.save();
  g.translate(cx, cy);
  g.fillStyle = INK;
  g.strokeStyle = INK;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  switch (kind) {
    case 'wide': {
      g.beginPath();
      g.fillStyle = CREAM;
      g.ellipse(0, 0, 50 * s, 58 * s * Math.max(0.12, open), 0, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 7;
      g.stroke();
      g.fillStyle = INK;
      g.beginPath();
      g.arc(0, 4, 16 * s, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'happy': {
      g.lineWidth = 16;
      g.beginPath();
      g.arc(0, 18, 34, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
      break;
    }
    case 'half': {
      const h = 42 * Math.max(0.15, open);
      rr(g, -30, -4, 60, h, 18);
      g.fill();
      g.lineWidth = 10;
      g.beginPath();
      g.moveTo(-38, -10);
      g.lineTo(38, -10);
      g.stroke();
      break;
    }
    case 'worried': {
      const h = 92 * Math.max(0.12, open);
      rr(g, -28, -h / 2, 56, h, 26);
      g.fill();
      // párpado inclinado (cejas tristes)
      g.fillStyle = '#C96442';
      g.beginPath();
      const dir = side < 0 ? 1 : -1;
      g.moveTo(-40, -60);
      g.lineTo(40, -60);
      g.lineTo(40, -60 + (dir > 0 ? 18 : 46));
      g.lineTo(-40, -60 + (dir > 0 ? 46 : 18));
      g.closePath();
      g.fill();
      break;
    }
    case 'spiral': {
      g.lineWidth = 9;
      g.beginPath();
      const rot = t * 9 * (side < 0 ? 1 : -1);
      for (let a = 0; a < Math.PI * 6; a += 0.15) {
        const r = 3 + a * 2.6;
        const x = Math.cos(a + rot) * r;
        const y = Math.sin(a + rot) * r;
        if (a === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      break;
    }
    case 'x': {
      g.lineWidth = 15;
      g.beginPath();
      g.moveTo(-28, -28);
      g.lineTo(28, 28);
      g.moveTo(28, -28);
      g.lineTo(-28, 28);
      g.stroke();
      break;
    }
    case 'closed': {
      g.lineWidth = 12;
      g.beginPath();
      g.moveTo(-30, 4);
      g.lineTo(30, 4);
      g.stroke();
      break;
    }
    default: {
      const h = 92 * Math.max(0.1, open);
      rr(g, -28, -h / 2, 56, h, 26);
      g.fill();
      // brillo
      if (open > 0.5) {
        g.fillStyle = 'rgba(255,255,255,0.9)';
        g.beginPath();
        g.arc(-9, -22, 7, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  g.restore();
}

function mouth(g, kind, open, t) {
  g.save();
  g.translate(256, 292);
  g.fillStyle = INK;
  g.strokeStyle = INK;
  g.lineWidth = 13;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (open > 0.06) {
    // boca hablando: altura según apertura, ancho según expresión
    const wide = kind === 'scream' ? 1.35 : kind === 'grin' ? 1.2 : kind === 'small' ? 0.7 : 1;
    const w = 92 * wide;
    const h = 14 + open * (kind === 'scream' ? 92 : 64);
    rr(g, -w / 2, -h / 2 + 4, w, h, Math.min(30, h / 2));
    g.fill();
    g.fillStyle = HOLE;
    rr(g, -w / 2 + 12, -h / 2 + 4 + 11, w - 24, Math.max(0, h - 22), Math.min(22, h / 2));
    if (h > 30) g.fill();
    g.restore();
    return;
  }
  switch (kind) {
    case 'grin': {
      g.beginPath();
      g.moveTo(-70, -12);
      g.quadraticCurveTo(0, -12, 70, -12);
      g.quadraticCurveTo(60, 58, 0, 58);
      g.quadraticCurveTo(-60, 58, -70, -12);
      g.fill();
      break;
    }
    case 'flat': {
      g.beginPath();
      g.moveTo(-50, 8);
      g.lineTo(50, 8);
      g.stroke();
      break;
    }
    case 'wavy':
    case 'wavyOpen': {
      g.beginPath();
      for (let x = -66; x <= 66; x += 4) {
        const y = Math.sin(x / 11 + t * (kind === 'wavyOpen' ? 10 : 3)) * 9;
        if (x === -66) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      break;
    }
    case 'grimace': {
      rr(g, -70, -20, 140, 50, 14);
      g.fill();
      g.fillStyle = CREAM;
      for (let i = -2; i <= 2; i++) g.fillRect(i * 26 - 3, -16, 6, 42);
      g.fillRect(-64, 3, 128, 5);
      break;
    }
    case 'scream': {
      g.beginPath();
      g.ellipse(0, 10, 46, 52, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = HOLE;
      g.beginPath();
      g.ellipse(0, 12, 32, 38, 0, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'small': {
      g.beginPath();
      g.ellipse(0, 6, 16, 13, 0, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'frown': {
      g.beginPath();
      g.arc(0, 50, 48, Math.PI * 1.2, Math.PI * 1.8);
      g.stroke();
      break;
    }
    default: {
      // sonrisa
      g.beginPath();
      g.arc(0, -30, 56, Math.PI * 0.2, Math.PI * 0.8);
      g.stroke();
    }
  }
  g.restore();
}

/**
 * Dibuja la cara.
 * st: { eyes, mouth, open, blink, brows, blush, lookX, lookY, glitch, crack }
 */
export function drawFace(canvas, st, t) {
  const g = canvas.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  // grietas del barro cuando el estrés aprieta
  if (st.crack > 0.02) {
    g.save();
    g.strokeStyle = CRACK;
    g.lineWidth = 5;
    g.lineCap = 'round';
    g.globalAlpha = Math.min(1, st.crack * 1.4);
    const cracks = [
      [[470, 20], [440, 60], [455, 95], [420, 140]],
      [[30, 330], [70, 300], [60, 270], [100, 240]],
      [[500, 260], [470, 290], [480, 330]],
    ];
    cracks.slice(0, 1 + Math.floor(st.crack * 2.9)).forEach((c) => {
      g.beginPath();
      c.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
    });
    g.restore();
  }

  const lx = clamp(st.lookX, -1, 1) * 22;
  const ly = -clamp(st.lookY, -1, 1) * 16;

  g.save();
  // rasgos un 25 % más grandes: sobre el barro tienen que leerse en el móvil
  g.translate(W / 2, H / 2);
  g.scale(1.25, 1.25);
  g.translate(-W / 2, -H / 2);
  if (st.glitch > 0) {
    const off = Math.round(Math.sin(t * 97) * 18 * st.glitch);
    g.translate(off, 0);
  }

  // cejas (solo si hay emoción marcada y ojos normales)
  if (Math.abs(st.brows) > 0.15 && (st.eyes === 'normal' || st.eyes === 'wide')) {
    g.strokeStyle = INK;
    g.lineWidth = 10;
    g.lineCap = 'round';
    const a = st.brows * 0.35;
    for (const side of [-1, 1]) {
      const cx = 256 + side * 86 + lx;
      g.save();
      g.translate(cx, 92 + ly);
      g.rotate(side * a);
      g.beginPath();
      g.moveTo(-30, 0);
      g.lineTo(30, 0);
      g.stroke();
      g.restore();
    }
  }

  eye(g, 256 - 86 + lx, 170 + ly, 1, st.eyes, st.blink, t, -1);
  eye(g, 256 + 86 + lx, 170 + ly, 1, st.eyes, st.blink, t, 1);
  mouth(g, st.mouth, st.open, t);
  g.restore();

  if (st.blush > 0.02) {
    g.fillStyle = `rgba(255,110,150,${0.55 * st.blush})`;
    for (const side of [-1, 1]) {
      g.beginPath();
      g.ellipse(256 + side * 150, 250, 40, 20, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  if (st.glitch > 0) {
    // franjas de glitch
    for (let i = 0; i < 6; i++) {
      const y = ((Math.sin(t * 31 + i * 17) + 1) / 2) * H;
      g.fillStyle = i % 2 ? 'rgba(255,60,90,0.35)' : 'rgba(60,220,255,0.35)';
      g.fillRect(0, y, W, 6 + (i % 3) * 4);
    }
  }
}
