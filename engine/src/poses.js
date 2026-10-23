// Poses de Lía. Cada pose es un conjunto de parámetros del rig.
// Numéricos: se interpolan. eyes/mouth: estados discretos de la cara.
//   raise: separación del brazo (0 = pegado, π = arriba)
//   fwd:   brazo hacia delante (rad)
//   bend:  codo (rad, hacia delante)
//   lean/bendBody/twist: cuerpo; tilt/nod/turn: cabeza

const BASE = {
  lean: 0, bendBody: 0, twist: 0, hop: 0,
  tilt: 0, nod: 0, turn: 0,
  lRaise: 0.16, lFwd: 0.08, lBend: 0.18,
  rRaise: 0.16, rFwd: 0.08, rBend: 0.18,
  brows: 0, blush: 0, sweat: 0, stress: 0.12, shake: 0, sway: 0,
  lookX: 0, lookY: 0,
  eyes: 'normal', mouth: 'smile',
};

const def = (o) => ({ ...BASE, ...o });

export const POSES = {
  normal: def({}),
  agobiada: def({
    lRaise: 2.5, lFwd: 0.55, lBend: 1.9,
    rRaise: 2.5, rFwd: 0.55, rBend: 1.9,
    nod: 0.12, brows: -0.8, stress: 0.65, shake: 0.12,
    eyes: 'worried', mouth: 'wavy',
  }),
  sudando: def({
    rRaise: 2.15, rFwd: 0.9, rBend: 1.75,
    lRaise: 0.25, lFwd: 0.15, lBend: 0.3,
    tilt: -0.1, brows: -0.6, sweat: 1, stress: 0.75,
    eyes: 'worried', mouth: 'grimace',
  }),
  panico: def({
    lRaise: 2.75, lFwd: 0.1, lBend: 0.35,
    rRaise: 2.75, rFwd: 0.1, rBend: 0.35,
    hop: 0.25, brows: -1, sweat: 0.7, stress: 1, shake: 1,
    eyes: 'wide', mouth: 'scream',
  }),
  resignada: def({
    lRaise: 0.04, lFwd: 0, lBend: 0.05,
    rRaise: 0.04, rFwd: 0, rBend: 0.05,
    bendBody: 0.2, nod: 0.32, tilt: 0.12, brows: -0.35, stress: 0.45,
    eyes: 'half', mouth: 'flat',
  }),
  pensando: def({
    rRaise: 0.35, rFwd: 1.25, rBend: 2.35,
    lRaise: 0.3, lFwd: 0.55, lBend: 1.35,
    tilt: 0.16, turn: -0.12, brows: 0.25, stress: 0.3,
    lookX: 0.5, lookY: 0.6,
    eyes: 'normal', mouth: 'small',
  }),
  chulita: def({
    rRaise: 1.25, rFwd: 0.6, rBend: 1.35,
    lRaise: 0.55, lFwd: -0.25, lBend: 1.6,
    lean: 0.07, tilt: -0.08, nod: -0.08, brows: 0.4, stress: 0,
    eyes: 'happy', mouth: 'grin',
  }),
  alucinando: def({
    lRaise: 0.75, lFwd: 0.3, lBend: 0.6,
    rRaise: 1.1, rFwd: 0.2, rBend: 0.4,
    sway: 1, tilt: 0.1, stress: 0.55,
    eyes: 'spiral', mouth: 'wavyOpen',
  }),
  avergonzada: def({
    rRaise: 2.3, rFwd: -0.2, rBend: 2.0,
    lRaise: 0.1, lFwd: 0.35, lBend: 0.9,
    nod: 0.2, tilt: 0.14, blush: 1, brows: -0.3, stress: 0.35,
    lookY: -0.6, lookX: -0.3,
    eyes: 'normal', mouth: 'small',
  }),
  error: def({
    lRaise: 0.05, lFwd: 0, lBend: 0,
    rRaise: 0.05, rFwd: 0, rBend: 0,
    tilt: 0.22, stress: 0.9, shake: 0.25,
    eyes: 'x', mouth: 'flat',
  }),
};

export const POSE_NAMES = Object.keys(POSES);
export const NUMERIC_KEYS = Object.keys(BASE).filter((k) => typeof BASE[k] === 'number');
