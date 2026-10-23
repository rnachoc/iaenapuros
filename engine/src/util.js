// Utilidades deterministas: todo depende solo del tiempo t y de semillas fijas.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(n) {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

// Ruido de valor 1D suave en [-1, 1]
export function noise1(t, seed = 0) {
  const i = Math.floor(t);
  const f = t - i;
  const a = hash(i * 7919 + seed * 104729) * 2 - 1;
  const b = hash((i + 1) * 7919 + seed * 104729) * 2 - 1;
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, u) => a + (b - a) * u;
export const smooth = (u) => {
  u = clamp(u);
  return u * u * (3 - 2 * u);
};
export const easeOutBack = (u, s = 1.6) => {
  u = clamp(u);
  const c3 = s + 1;
  return 1 + c3 * Math.pow(u - 1, 3) + s * Math.pow(u - 1, 2);
};
export const easeOutCubic = (u) => 1 - Math.pow(1 - clamp(u), 3);
export const easeInOut = (u) => {
  u = clamp(u);
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
};

// Pulso 0→1→0 dentro de [t0, t0+d]
export function pulse(t, t0, d) {
  if (t < t0 || t > t0 + d) return 0;
  return Math.sin(((t - t0) / d) * Math.PI);
}
