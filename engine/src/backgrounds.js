// Fondos 3D de bloques: oficina, servidor (CPD) y plato (informativo).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mulberry32, hash } from './util.js';

const DISPLAY = '"IAE Display", sans-serif';
const TEXT = '"IAE Text", sans-serif';

function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, ...extra });
}
function box(w, h, d, color, x, y, z, r = 0.08, extra) {
  const m = new THREE.Mesh(r > 0 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d), std(color, extra));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, canvas: c };
}
function screen(w, h, tex, x, y, z) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  m.position.set(x, y, z);
  return m;
}
function floorTex(c1, c2, line) {
  const { tex } = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = c1;
    g.fillRect(0, 0, w, h);
    g.fillStyle = c2;
    g.fillRect(0, 0, w / 2, h / 2);
    g.fillRect(w / 2, h / 2, w / 2, h / 2);
    g.strokeStyle = line;
    g.lineWidth = 4;
    g.strokeRect(0, 0, w, h);
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 16);
  return tex;
}
function floor(tex, color = '#ffffff') {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), std(color, { map: tex, roughness: 0.85 }));
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  return m;
}

// ---------- OFICINA ----------
function oficina() {
  const g = new THREE.Group();
  g.add(floor(floorTex('#3B3366', '#342D5C', '#2A244D')));
  g.add(box(60, 30, 0.6, '#262B57', 0, 15, -10, 0));

  // ventana con ciudad nocturna
  const rnd = mulberry32(7);
  const city = canvasTex(512, 340, (c, w, h) => {
    const sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#0C1033');
    sky.addColorStop(1, '#3A2F6B');
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#FFF4C2';
    c.beginPath();
    c.arc(420, 70, 30, 0, Math.PI * 2);
    c.fill();
    let x = 0;
    while (x < w) {
      const bw = 30 + rnd() * 50;
      const bh = 80 + rnd() * 200;
      c.fillStyle = '#151837';
      c.fillRect(x, h - bh, bw, bh);
      for (let yy = h - bh + 10; yy < h - 8; yy += 16)
        for (let xx = x + 6; xx < x + bw - 8; xx += 12)
          if (rnd() > 0.55) {
            c.fillStyle = rnd() > 0.5 ? '#FFD23F' : '#FFB547';
            c.fillRect(xx, yy, 6, 8);
          }
      x += bw + 4;
    }
  });
  g.add(box(10.6, 7.6, 0.4, '#1A1D3C', -5.5, 9.5, -9.6, 0.1));
  g.add(screen(10, 7, city.tex, -5.5, 9.5, -9.35));
  g.add(box(0.3, 7, 0.3, '#1A1D3C', -5.5, 9.5, -9.25, 0));

  // póster
  const poster = canvasTex(256, 360, (c, w, h) => {
    c.fillStyle = '#FF5A5F';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.font = `64px ${DISPLAY}`;
    c.fillText('KEEP', w / 2, 90);
    c.fillText('CALM', w / 2, 160);
    c.font = `40px ${DISPLAY}`;
    c.fillText('Y PULSA', w / 2, 230);
    c.font = `68px ${DISPLAY}`;
    c.fillStyle = '#FFD23F';
    c.fillText('CTRL+Z', w / 2, 310);
  });
  g.add(screen(2.6, 3.65, poster.tex, 4.0, 8.6, -9.6));

  // estantería con libros
  g.add(box(6, 0.3, 1.2, '#4A3B2A', 6.4, 5.6, -9.2, 0.05));
  const bookColors = ['#FF5A5F', '#FFD23F', '#2EC4B6', '#8E7CFF', '#F4F7FB'];
  for (let i = 0; i < 9; i++) {
    const h = 1 + hash(i + 3) * 0.6;
    g.add(box(0.45, h, 0.9, bookColors[i % 5], 3.8 + i * 0.6, 5.75 + h / 2, -9.1, 0.04));
  }

  // mesa con monitor
  g.add(box(7, 0.4, 3, '#6B4F3A', 5.4, 2.7, -4.5, 0.06));
  for (const dx of [-3.1, 3.1]) g.add(box(0.35, 2.5, 2.6, '#4A3B2A', 5.4 + dx, 1.25, -4.5, 0.04));
  g.add(box(4, 2.6, 0.35, '#14172F', 5.4, 4.9, -5.4, 0.1));
  g.add(box(0.4, 1.0, 0.4, '#14172F', 5.4, 3.3, -5.4, 0.05));
  const code = canvasTex(512, 320, () => {});
  const codeScreen = screen(3.6, 2.2, code.tex, 5.4, 4.9, -5.2);
  g.add(codeScreen);
  g.add(box(1.0, 1.2, 1.0, '#F4F7FB', 3.2, 3.5, -4.0, 0.1)); // taza
  g.add(box(2.6, 0.2, 1.0, '#2B2F55', 5.4, 3.0, -3.8, 0.05)); // teclado

  // planta
  g.add(box(1.6, 1.6, 1.6, '#C96F4A', -6.5, 0.8, -4.5, 0.12));
  const leaf = '#3FA34D';
  [[0, 2.4, 0], [-0.6, 3.2, 0.2], [0.6, 3.0, -0.2], [0, 3.9, 0], [0.3, 4.5, 0.3]].forEach(([x, y, z]) =>
    g.add(box(0.9, 0.9, 0.9, leaf, -6.5 + x, y, -4.5 + z, 0.1))
  );

  const lamp = new THREE.PointLight('#FFC37A', 18, 18, 1.6);
  lamp.position.set(5, 7, -2);
  g.add(lamp);

  const rndCode = mulberry32(11);
  const lines = Array.from({ length: 80 }, () => ({
    indent: Math.floor(rndCode() * 4),
    segs: Array.from({ length: 1 + Math.floor(rndCode() * 4) }, () => ({
      w: 20 + rndCode() * 90,
      c: ['#FF5A5F', '#FFD23F', '#2EC4B6', '#8E7CFF', '#C9D1FF'][Math.floor(rndCode() * 5)],
    })),
  }));

  return {
    group: g,
    fog: ['#1A1C3D', 28, 70],
    sky: '#1A1C3D',
    update(t) {
      const c = code.canvas.getContext('2d');
      c.fillStyle = '#0B0E22';
      c.fillRect(0, 0, 512, 320);
      const scroll = Math.floor(t * 6);
      for (let i = 0; i < 13; i++) {
        const ln = lines[(i + scroll) % lines.length];
        let x = 20 + ln.indent * 28;
        for (const s of ln.segs) {
          c.fillStyle = s.c;
          c.fillRect(x, 16 + i * 23, s.w, 11);
          x += s.w + 10;
        }
      }
      code.tex.needsUpdate = true;
    },
  };
}

// ---------- SERVIDOR ----------
function servidor() {
  const g = new THREE.Group();
  g.add(floor(floorTex('#232A4A', '#1E2442', '#4A56A0')));
  g.add(box(60, 30, 0.6, '#151A36', 0, 15, -26, 0));

  // pasillo de racks con la cara de LEDs mirando al centro
  const racks = [];
  for (const side of [-1, 1])
    for (let i = 0; i < 6; i++) {
      const z = 1 - i * 3.4;
      const x = side * 5.0;
      g.add(box(2.4, 7.2, 3.0, '#262C4F', x, 3.6, z, 0.06));
      g.add(box(0.12, 6.8, 2.7, '#0E1124', x - side * 1.22, 3.6, z, 0));
      racks.push({ x: x - side * 1.3, z, side });
    }
  for (let i = -2; i <= 2; i++) {
    g.add(box(2.6, 7.2, 2.4, '#262C4F', i * 2.8, 3.6, -20, 0.06));
    g.add(box(2.4, 6.8, 0.12, '#0E1124', i * 2.8, 3.6, -18.75, 0));
    racks.push({ x: i * 2.8, z: -18.68, side: 0 });
  }

  const perRack = 24;
  const ledGeo = new THREE.BoxGeometry(0.22, 0.16, 0.22);
  const ledMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, fog: false });
  const leds = new THREE.InstancedMesh(ledGeo, ledMat, racks.length * perRack);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  let k = 0;
  racks.forEach((r) => {
    for (let j = 0; j < perRack; j++) {
      const row = Math.floor(j / 3);
      const c = j % 3;
      if (r.side === 0) dummy.position.set(r.x - 0.7 + c * 0.7, 0.9 + row * 0.78, r.z);
      else dummy.position.set(r.x, 0.9 + row * 0.78, r.z - 0.8 + c * 0.8);
      dummy.updateMatrix();
      leds.setMatrixAt(k, dummy.matrix);
      leds.setColorAt(k, col.set('#5BE37D'));
      k++;
    }
  });
  g.add(leds);

  for (let i = 0; i < 6; i++) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 2.6), new THREE.MeshBasicMaterial({ color: '#BFF4FF', toneMapped: false }));
    strip.position.set(0, 9.2, 1 - i * 4);
    g.add(strip);
  }
  const cold = new THREE.PointLight('#6FC3FF', 60, 30, 1.2);
  cold.position.set(0, 8, 0);
  g.add(cold);
  const back = new THREE.PointLight('#3D6BFF', 40, 30, 1.2);
  back.position.set(0, 6, -14);
  g.add(back);

  const greens = ['#5BE37D', '#3DDC97', '#7FE7FF'];
  return {
    group: g,
    fog: ['#151A36', 26, 60],
    sky: '#151A36',
    update(t, alarm = 0) {
      for (let i = 0; i < leds.count; i++) {
        const rate = 1.5 + hash(i) * 5;
        const on = Math.sin(t * rate + hash(i + 999) * 20) > 0.1;
        if (alarm > 0.3 && hash(i + 77) > 0.35) col.set(on ? '#FF4D5E' : '#40131B');
        else col.set(on ? greens[i % 3] : '#163A26');
        leds.setColorAt(i, col);
      }
      leds.instanceColor.needsUpdate = true;
    },
  };
}

// ---------- PLATO (informativo) ----------
function plato(ep) {
  const g = new THREE.Group();
  g.add(floor(floorTex('#1B1F3F', '#20254A', '#2C3266')));
  g.add(box(60, 30, 0.6, '#151937', 0, 15, -12, 0));

  const wall = canvasTex(1024, 512, () => {});
  const wallScreen = screen(17, 8.5, wall.tex, 0, 8.6, -11.4);
  g.add(box(17.6, 9.1, 0.4, '#0B0D1F', 0, 8.6, -11.7, 0.1));
  g.add(wallScreen);

  // columnas de luz
  for (const side of [-1, 1])
    for (let i = 0; i < 3; i++) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 12, 0.35),
        new THREE.MeshBasicMaterial({ color: i % 2 ? '#2EC4B6' : '#FF5A5F', toneMapped: false })
      );
      strip.position.set(side * (10 + i * 1.4), 6, -10 + i * 0.5);
      g.add(strip);
    }

  // mesa de presentadora (delante de Lía)
  const desk = new THREE.Group();
  desk.add(box(7.5, 2.4, 1.8, '#F4F7FB', 0, 1.2, 0, 0.12));
  desk.add(box(7.6, 0.35, 2.0, '#FF5A5F', 0, 2.5, 0, 0.08));
  desk.add(box(7.55, 0.3, 1.85, '#2EC4B6', 0, 0.6, 0, 0.06));
  desk.position.set(0, 0, 1.9);
  g.add(desk);

  const ticker = (ep.topic && ep.topic.ticker) || 'ÚLTIMA HORA · LA IA, OTRA VEZ EN APUROS · ';
  return {
    group: g,
    fog: ['#151937', 30, 70],
    sky: '#151937',
    update(t) {
      const c = wall.canvas.getContext('2d');
      const w = 1024;
      const h = 512;
      const bg = c.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#1E2A78');
      bg.addColorStop(1, '#3A1E6B');
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
      // rejilla animada
      c.strokeStyle = 'rgba(255,255,255,0.08)';
      c.lineWidth = 2;
      const off = (t * 30) % 64;
      for (let x = -64; x < w; x += 64) {
        c.beginPath();
        c.moveTo(x + off, 0);
        c.lineTo(x + off, h);
        c.stroke();
      }
      c.fillStyle = '#FF5A5F';
      c.fillRect(60, 70, 420, 70);
      c.fillStyle = '#fff';
      c.font = `48px ${DISPLAY}`;
      c.textBaseline = 'middle';
      c.fillText('ÚLTIMA HORA', 80, 107);
      c.font = `120px ${DISPLAY}`;
      c.fillStyle = '#FFD23F';
      c.fillText('APUROS', 60, 230);
      c.fillStyle = '#fff';
      c.fillText('DEL DÍA', 60, 350);
      // rótulo inferior
      c.fillStyle = '#0B0D1F';
      c.fillRect(0, 430, w, 82);
      c.fillStyle = '#fff';
      c.font = `40px ${TEXT}`;
      const text = (ticker + ' ').repeat(4);
      const tw = c.measureText(ticker + ' ').width || 600;
      c.fillText(text, 20 - ((t * 140) % tw), 472);
      wall.tex.needsUpdate = true;
    },
  };
}

export function createBackgrounds(ep) {
  return { oficina: oficina(), servidor: servidor(), plato: plato(ep) };
}
export const BACKGROUND_NAMES = ['oficina', 'servidor', 'plato'];
