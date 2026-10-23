// Motor de episodios de @iaenapuros. Lee window.EPISODE y dibuja cada fotograma desde t.
import * as THREE from 'three';
import { createLia } from './rig.js';
import { POSES, NUMERIC_KEYS } from './poses.js';
import { createBackgrounds } from './backgrounds.js';
import { createOverlays } from './overlays.js';
import { clamp, lerp, easeOutBack, easeInOut, smooth, pulse, noise1, hash, mulberry32 } from './util.js';

const EP = window.EPISODE;
const W = 1080;
const H = 1920;

// encuadres: altura del objetivo y distancia
const CAMS = {
  general: { ty: 3.5, d: 31 },
  medio: { ty: 4.0, d: 19.5 },
  cara: { ty: 4.5, d: 13.5 },
};

async function build() {
  await Promise.all([
    document.fonts.load('64px "IAE Display"'),
    document.fonts.load('800 64px "IAE Text"'),
    document.fonts.load('600 32px "IAE Text"'),
  ]);

  const canvas = document.getElementById('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 200);
  camera.setViewOffset(W, H, 0, 70, W, H);

  scene.add(new THREE.HemisphereLight('#9FB4FF', '#2A1E3A', 1.1));
  const key = new THREE.DirectionalLight('#FFE1B8', 2.4);
  key.position.set(7, 14, 11);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -12;
  key.shadow.camera.right = 12;
  key.shadow.camera.top = 14;
  key.shadow.camera.bottom = -4;
  key.shadow.bias = -0.0004;
  scene.add(key);
  const rim = new THREE.DirectionalLight('#7FE7FF', 1.6);
  rim.position.set(-9, 7, -7);
  scene.add(rim);
  const fillL = new THREE.PointLight('#FF8FA0', 12, 20, 1.5);
  fillL.position.set(-6, 4, 6);
  scene.add(fillL);

  const bgs = createBackgrounds(EP);
  Object.values(bgs).forEach((b) => {
    b.group.visible = false;
    scene.add(b.group);
  });

  const lia = createLia();
  scene.add(lia.root);

  // ---- efectos 3D: humo y confeti ----
  const smokeMat = new THREE.MeshStandardMaterial({ color: '#8A8FA8', roughness: 1, transparent: true, opacity: 0.8 });
  const smoke = Array.from({ length: 14 }, () => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), smokeMat);
    m.visible = false;
    scene.add(m);
    return m;
  });
  const confColors = ['#FFD23F', '#FF5A5F', '#2EC4B6', '#8E7CFF', '#F4F7FB'];
  const confetti = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.22, 0.06), new THREE.MeshBasicMaterial({ color: '#ffffff' }), 90);
  const cc = new THREE.Color();
  for (let i = 0; i < 90; i++) confetti.setColorAt(i, cc.set(confColors[i % 5]));
  confetti.visible = false;
  scene.add(confetti);
  const dummy = new THREE.Object3D();

  const overlays = createOverlays(EP);

  // ---- segmentos de pose / cámara / fondo ----
  const poseSegs = [{ t: -10, pose: EP.lines[0].pose || 'normal' }];
  const camSegs = [{ t: -10, cam: EP.lines[0].cam || 'medio' }];
  const bgSegs = [{ t: -10, bg: EP.lines[0].bg || EP.background || 'oficina' }];
  EP.lines.forEach((ln) => {
    if (ln.pose) poseSegs.push({ t: ln.start - 0.08, pose: ln.pose });
    if (ln.react) poseSegs.push({ t: ln.start + (ln.react.at || 0.8), pose: ln.react.pose });
    if (ln.cam) camSegs.push({ t: ln.start - 0.05, cam: ln.cam });
    if (ln.bg) bgSegs.push({ t: ln.start - 0.02, bg: ln.bg });
  });
  poseSegs.sort((a, b) => a.t - b.t);
  const segAt = (segs, t) => {
    let k = 0;
    for (let i = 0; i < segs.length; i++) if (segs[i].t <= t) k = i;
    return k;
  };

  // parpadeos deterministas
  const rnd = mulberry32(EP.seed || 42);
  const blinks = [];
  for (let bt = 1.2; bt < EP.duration + 2; bt += 2.3 + rnd() * 2.2) blinks.push(bt);

  function poseAt(t) {
    const k = segAt(poseSegs, t);
    const cur = POSES[poseSegs[k].pose] || POSES.normal;
    const prev = k > 0 ? POSES[poseSegs[k - 1].pose] || POSES.normal : cur;
    const t0 = poseSegs[k].t;
    const u = easeOutBack((t - t0) / 0.42, 1.25);
    const p = {};
    for (const key of NUMERIC_KEYS) p[key] = lerp(prev[key], cur[key], u);
    p.eyes = (t - t0) / 0.42 < 0.3 ? prev.eyes : cur.eyes;
    p.mouth = (t - t0) / 0.42 < 0.3 ? prev.mouth : cur.mouth;
    return { p, squash: 0.07 * pulse(t, t0, 0.3) };
  }

  function speechAt(t) {
    for (const ln of EP.lines) {
      if (t < ln.start - 0.05 || t > ln.end + 0.05) continue;
      if (ln.speaker !== 'lia') return { open: 0, wordPulse: 0, talking: false, line: ln };
      let open = 0;
      let wp = 0;
      for (const w of ln.words) {
        if (t >= w.s) wp = Math.max(wp, Math.exp(-(t - w.s) * 9));
        if (t >= w.s && t < w.e) {
          const syl = Math.max(1, (w.w.toLowerCase().match(/[aeiouáéíóúü]+/g) || []).length);
          const ph = (t - w.s) / Math.max(0.05, w.e - w.s);
          open = 0.2 + 0.8 * Math.abs(Math.sin(Math.PI * ph * syl));
        }
      }
      return { open, wordPulse: wp, talking: true, line: ln };
    }
    return { open: 0, wordPulse: 0, talking: false, line: null };
  }

  function fxAmount(t, name, decay = 0) {
    let v = 0;
    for (const ln of EP.lines) {
      if (!ln.fx || !ln.fx.includes(name) || t < ln.start) continue;
      if (decay) v = Math.max(v, Math.exp(-(t - ln.start) * decay) * (t < ln.end + 1 ? 1 : 0));
      else if (t < ln.end + 0.2) v = Math.max(v, smooth((t - ln.start) / 0.2) * (1 - smooth((t - ln.end) / 0.2)));
    }
    return v;
  }

  function camAt(t) {
    const k = segAt(camSegs, t);
    const cur = CAMS[camSegs[k].cam] || CAMS.medio;
    const prev = k > 0 ? CAMS[camSegs[k - 1].cam] || CAMS.medio : cur;
    const u = easeInOut((t - camSegs[k].t) / 0.45);
    return { ty: lerp(prev.ty, cur.ty, u), d: lerp(prev.d, cur.d, u) };
  }

  function renderAt(t) {
    t = Math.max(0, t);
    // fondo
    const bgName = bgSegs[segAt(bgSegs, t)].bg;
    for (const [name, b] of Object.entries(bgs)) b.group.visible = name === bgName;
    const bg = bgs[bgName] || bgs.oficina;
    scene.background = new THREE.Color(bg.sky);
    scene.fog = new THREE.Fog(bg.fog[0], bg.fog[1], bg.fog[2]);
    const alarmAmt = fxAmount(t, 'alarma');
    bg.update(t, alarmAmt);

    // pose + extras
    const { p, squash } = poseAt(t);
    const sp = speechAt(t);
    const shakeFx = fxAmount(t, 'shake', 2.5);
    p.shake = Math.max(p.shake, shakeFx);
    p.sweat = Math.max(p.sweat, fxAmount(t, 'sudor'));
    p.stress = Math.max(p.stress, alarmAmt);
    if (sp.line && sp.line.speaker !== 'lia') {
      // escucha: mira hacia arriba-izquierda, de donde viene la voz
      p.lookX = lerp(p.lookX, -0.35, 0.5);
      p.lookY = lerp(p.lookY, 0.25, 0.5);
    }
    let blink = 0;
    if (!['x', 'spiral', 'happy', 'closed'].includes(p.eyes)) for (const b of blinks) blink = Math.max(blink, pulse(t, b, 0.16));

    const ov = overlays(t);
    const glitch = Math.max(ov.glitch, p.eyes === 'spiral' ? 0.15 : 0, p.eyes === 'x' ? 0.25 : 0);
    lia.update(p, { t, open: sp.open, blink, wordPulse: sp.wordPulse, squash, glitch });

    // humo
    const smokeAmt = fxAmount(t, 'humo');
    smoke.forEach((m, i) => {
      const ph = ((t * 0.6 + hash(i) * 3) % 1.6) / 1.6;
      m.visible = smokeAmt > 0.05;
      const hx = lia.head.getWorldPosition(new THREE.Vector3());
      m.position.set(hx.x + (hash(i + 5) - 0.5) * 2.2 + Math.sin(t * 2 + i) * 0.3, hx.y + 3.2 + ph * 4.5, hx.z + (hash(i + 9) - 0.5));
      m.scale.setScalar((0.5 + ph * 1.6) * smokeAmt);
      m.rotation.set(t + i, t * 0.7 + i, 0);
    });
    smokeMat.opacity = 0.75;

    // confeti
    const confAmt = fxAmount(t, 'confeti');
    confetti.visible = confAmt > 0.01;
    if (confetti.visible) {
      for (let i = 0; i < 90; i++) {
        const ph = ((t * 0.35 + hash(i) * 1.0) % 1);
        dummy.position.set((hash(i + 1) - 0.5) * 14, 12 - ph * 13, (hash(i + 2) - 0.5) * 6 + 1);
        dummy.rotation.set(t * 3 + i, t * 2 + i * 0.5, t + i);
        dummy.scale.setScalar(confAmt);
        dummy.updateMatrix();
        confetti.setMatrixAt(i, dummy.matrix);
      }
      confetti.instanceMatrix.needsUpdate = true;
    }

    // cámara
    const c = camAt(t);
    const zoom = fxAmount(t, 'zoom');
    const d = c.d * (1 - (c.d < 16 ? 0.12 : 0.22) * zoom);
    const ty = c.ty + 0.3 * zoom;
    const camShake = shakeFx * 0.35;
    const drift = Math.sin(t * 0.35) * 0.25;
    camera.position.set(drift + noise1(t * 20, 41) * camShake, ty + 0.7 + noise1(t * 20, 42) * camShake, d);
    camera.lookAt(drift * 0.5, ty, 0);

    renderer.render(scene, camera);
  }

  window.__renderAt = renderAt;
  window.addEventListener('hf-seek', (e) => renderAt(e.detail.time));
  renderAt(0);
}

window.__hf = window.__hf || {};
window.__hf.buildReady = window.__hf.buildReady || {};
window.__hf.buildReady.engine = build();
