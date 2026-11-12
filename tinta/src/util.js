// Utilidades compartidas: paleta, constantes y matemáticas pequeñas.

export const TINTA = {
  ultramar: '#1B1F5E',
  fondoFuera: '#14174A',
  trama: '#262B78',
  sombra: '#10133F',
  rosa: '#FF4F9A',
  azafran: '#FFC530',
  menta: '#5FE3C0',
  tiza: '#F2F0FF',
};

export const ARENA = { w: 1800, h: 1200 };
export const FUENTE = '"Shoulders", Impact, "Arial Narrow", sans-serif';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
export const choice = (arr) => arr[(Math.random() * arr.length) | 0];

// Elige una clave de un objeto {clave: peso}.
export function pesoAleatorio(pesos) {
  let total = 0;
  for (const k in pesos) total += pesos[k];
  let r = Math.random() * total;
  for (const k in pesos) { r -= pesos[k]; if (r <= 0) return k; }
  for (const k in pesos) return k;
}

// Patrón de trama de puntos (semitono). Se cachea por color/tamaño.
const cachePatrones = new Map();
export function trama(ctx, color, paso = 8, radio = 1.6) {
  const clave = color + paso + radio;
  let p = cachePatrones.get(clave);
  if (p) return p;
  const c = document.createElement('canvas');
  c.width = c.height = paso * 2;
  const g = c.getContext('2d');
  g.fillStyle = color;
  // Retícula a 45º: un punto en la esquina y otro en el centro.
  for (const [x, y] of [[0, 0], [paso, paso], [paso * 2, 0], [0, paso * 2], [paso * 2, paso * 2]]) {
    g.beginPath(); g.arc(x, y, radio, 0, Math.PI * 2); g.fill();
  }
  p = ctx.createPattern(c, 'repeat');
  cachePatrones.set(clave, p);
  return p;
}
