// Rig 3D de Claude (parodia): muñeco de barro terracota con cara pintada y chispa de "contexto".
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createFaceCanvas, drawFace } from './face.js';
import { noise1, clamp, lerp } from './util.js';

export const PALETTE = {
  body: '#C96442',
  bodyDark: '#A9532F',
  joint: '#8E4527',
  accent: '#F3E9DC',
  dark: '#3A2620',
  sweat: '#9EE7FF',
};

const mats = {};
function mat(color, extra = {}) {
  const key = color + JSON.stringify(extra);
  if (!mats[key]) mats[key] = new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, ...extra });
  return mats[key];
}

function block(w, h, d, color, r = 0.12, extra) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat(color, extra));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function makeArm(side) {
  const shoulder = new THREE.Group();
  const upper = block(0.62, 1.0, 0.62, PALETTE.body, 0.14);
  upper.position.y = -0.5;
  shoulder.add(upper);
  const cap = block(0.72, 0.5, 0.72, PALETTE.bodyDark, 0.14);
  cap.position.y = -0.05;
  shoulder.add(cap);
  const elbow = new THREE.Group();
  elbow.position.y = -1.0;
  shoulder.add(elbow);
  const fore = block(0.56, 0.9, 0.56, PALETTE.body, 0.14);
  fore.position.y = -0.45;
  elbow.add(fore);
  const hand = block(0.74, 0.62, 0.74, PALETTE.accent, 0.16);
  hand.position.y = -1.08;
  elbow.add(hand);
  shoulder.userData = { side, elbow };
  return shoulder;
}

export function createLia() {
  const root = new THREE.Group();

  // piernas (en el root para que los pies no floten)
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.55, 1.25, 0);
    const shin = block(0.78, 1.15, 0.8, PALETTE.bodyDark, 0.14);
    shin.position.y = -0.62;
    leg.add(shin);
    const foot = block(0.95, 0.36, 1.15, PALETTE.dark, 0.12);
    foot.position.set(0, -1.08, 0.12);
    leg.add(foot);
    root.add(leg);
    legs.push(leg);
  }

  const hips = new THREE.Group();
  hips.position.y = 1.25;
  root.add(hips);

  const torso = new THREE.Group();
  hips.add(torso);
  const chest = block(2.1, 2.0, 1.6, PALETTE.body, 0.42);
  chest.position.y = 0.98;
  torso.add(chest);
  // barriga crema, como un pegote de arcilla más clara
  const belly = block(1.2, 1.1, 0.2, PALETTE.accent, 0.1);
  belly.position.set(0, 0.9, 0.76);
  torso.add(belly);

  const armL = makeArm(-1);
  armL.position.set(-1.32, 1.68, 0);
  torso.add(armL);
  const armR = makeArm(1);
  armR.position.set(1.32, 1.68, 0);
  torso.add(armR);

  const neck = block(0.75, 0.35, 0.75, PALETTE.joint, 0.1);
  neck.position.y = 2.05;
  torso.add(neck);

  const head = new THREE.Group();
  head.position.y = 2.12;
  torso.add(head);
  const skull = block(3.0, 2.5, 2.4, PALETTE.body, 0.6);
  skull.position.y = 1.25;
  head.add(skull);

  const faceCanvas = createFaceCanvas();
  const faceTex = new THREE.CanvasTexture(faceCanvas);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  faceTex.anisotropy = 4;
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 1.8),
    new THREE.MeshBasicMaterial({ map: faceTex, toneMapped: false, transparent: true })
  );
  face.position.set(0, 1.2, 1.205);
  head.add(face);

  const stalk = block(0.22, 0.6, 0.22, PALETTE.bodyDark, 0.08);
  stalk.position.y = 2.72;
  head.add(stalk);
  // chispa de 4 puntas (propia, no el logo de Anthropic) = barra de contexto
  const star = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? 0.13 : 0.42;
    if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  star.closePath();
  const sparkGeo = new THREE.ExtrudeGeometry(star, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 });
  sparkGeo.center();
  const bulbMat = new THREE.MeshStandardMaterial({ color: '#5BE37D', emissive: '#5BE37D', emissiveIntensity: 1.2, roughness: 0.3 });
  const bulb = new THREE.Mesh(sparkGeo, bulbMat);
  bulb.position.y = 3.3;
  head.add(bulb);

  // gotas de sudor
  const drops = [];
  const dropMat = new THREE.MeshStandardMaterial({ color: PALETTE.sweat, roughness: 0.15, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 4; i++) {
    const d = new THREE.Mesh(new RoundedBoxGeometry(0.24, 0.34, 0.24, 2, 0.08), dropMat);
    d.visible = false;
    head.add(d);
    drops.push(d);
  }

  const C_OK = new THREE.Color('#5BE37D');
  const C_MID = new THREE.Color('#FFB547');
  const C_BAD = new THREE.Color('#FF4D5E');
  const tmpC = new THREE.Color();

  /**
   * p: parámetros de pose ya mezclados; extra: { open, blink, t, talking, glitch, wordPulse }
   */
  function update(p, x) {
    const t = x.t;
    const shakeAmt = p.shake;
    const sx = noise1(t * 18, 1) * 0.09 * shakeAmt;
    const sy = noise1(t * 18, 2) * 0.05 * shakeAmt;
    const breath = Math.sin((t / 3.2) * Math.PI * 2);
    const sway = p.sway * Math.sin(t * 2.6);

    // salto del pánico
    const hop = p.hop * Math.abs(Math.sin(t * 9));
    hips.position.set(sx, 1.25 + hop + breath * 0.02 - p.bendBody * 0.15, 0);
    hips.rotation.set(0, p.twist, p.lean + sway * 0.12);
    for (const leg of legs) leg.scale.y = clamp((hips.position.y - hop * 0.6) / 1.25, 0.8, 1.2);
    for (const leg of legs) leg.position.y = 1.25 + hop * 0.4;

    torso.rotation.x = p.bendBody;
    torso.scale.set(1 + breath * 0.008, 1 + breath * 0.012 - x.squash, 1);

    // brazos (desfasados entre sí)
    const armWobble = (s) => noise1(t * 1.3 + s * 5, 10 + s) * 0.06 + shakeAmt * noise1(t * 22, 20 + s) * 0.25;
    armL.rotation.set(-(p.lFwd + armWobble(1) * 0.5), 0, -(p.lRaise + armWobble(2) + sway * 0.2));
    armL.userData.elbow.rotation.x = -p.lBend;
    armR.rotation.set(-(p.rFwd + armWobble(3) * 0.5), 0, p.rRaise + armWobble(4) - sway * 0.2);
    armR.userData.elbow.rotation.x = -p.rBend;

    // cabeza: lidera el movimiento, asiente con cada palabra
    head.position.x = sx * 0.6;
    head.position.y = 2.12 + sy;
    head.rotation.set(
      p.nod + x.wordPulse * 0.06 + noise1(t * 0.7, 30) * 0.03,
      p.turn + noise1(t * 0.5, 31) * 0.05 + sway * 0.15,
      p.tilt + noise1(t * 0.6, 32) * 0.03 + sway * 0.1
    );

    // antena = barra de contexto
    const s = clamp(p.stress);
    if (s < 0.5) tmpC.copy(C_OK).lerp(C_MID, s / 0.5);
    else tmpC.copy(C_MID).lerp(C_BAD, (s - 0.5) / 0.5);
    bulbMat.color.copy(tmpC);
    bulbMat.emissive.copy(tmpC);
    bulbMat.emissiveIntensity = s > 0.8 ? 0.6 + 1.4 * (Math.sin(t * 25) > 0 ? 1 : 0.2) : 1.2;
    bulb.rotation.y = t * 0.8;

    // sudor
    drops.forEach((d, i) => {
      const period = 1.1;
      const ph = ((t + i * 0.37) % period) / period;
      d.visible = p.sweat > 0.25;
      const side = i % 2 ? 1 : -1;
      d.position.set(side * (1.1 + i * 0.05), 2.3 - ph * 2.2, 1.0 - i * 0.1);
      d.scale.setScalar(lerp(0.6, 1.1, ph) * p.sweat);
    });

    drawFace(
      faceCanvas,
      {
        eyes: p.eyes,
        mouth: p.mouth,
        open: x.open,
        blink: x.blink,
        brows: p.brows,
        blush: p.blush,
        lookX: p.lookX,
        lookY: p.lookY,
        glitch: x.glitch,
        crack: clamp((s - 0.6) / 0.4),
      },
      t
    );
    faceTex.needsUpdate = true;
  }

  return { root, update, head };
}
