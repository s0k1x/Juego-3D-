// Audio procedural del shooter: todo se genera con Web Audio API, sin archivos.

const KEY = 'tinta:muted';
const MAX_VOCES = 24;

let ctx = null;        // AudioContext (se crea en unlock)
let master = null;     // ganancia master
let noiseBuf = null;   // buffer de ruido reutilizado
let voces = 0;         // voces activas
let muted = false;
const ultimo = {};     // última vez (ctx.currentTime) por sonido, para throttle

// Lee el estado de mute guardado (seguro sin localStorage)
try { muted = localStorage.getItem(KEY) === '1'; } catch (e) { muted = false; }

const Ctor = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;

// Devuelve true si se puede reproducir ahora
function listo() {
  return !!ctx && ctx.state === 'running';
}

// Throttle: true si pasó al menos `ms` desde la última vez de `nombre`
function libre(nombre, ms) {
  const t = ctx.currentTime;
  if (ultimo[nombre] !== undefined && t - ultimo[nombre] < ms / 1000) return false;
  ultimo[nombre] = t;
  return true;
}

// Registra una voz y desconecta sus nodos al terminar
function voz(fuente, nodos, fin) {
  voces++;
  let hecho = false;
  fuente.onended = () => {
    if (hecho) return;
    hecho = true;
    voces--;
    nodos.forEach((n) => { try { n.disconnect(); } catch (e) { /* nada */ } });
  };
  fuente.stop(fin);
}

// Puede sonar una voz nueva? (prioritarias ignoran el límite)
function cupo(prioritario) {
  return prioritario || voces < MAX_VOCES;
}

// Oscilador con barrido de frecuencia y envolvente de volumen
function tono({ tipo = 'sine', f0, f1, dur, vol, t0 = 0, filtro, prio = false }) {
  if (!listo() || !cupo(prio)) return;
  try {
    const t = ctx.currentTime + t0;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const nodos = [osc, g];
    osc.type = tipo;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let salida = osc;
    if (filtro) {
      const f = ctx.createBiquadFilter();
      f.type = filtro.tipo;
      f.frequency.setValueAtTime(filtro.f0, t);
      if (filtro.f1) f.frequency.exponentialRampToValueAtTime(filtro.f1, t + dur);
      salida.connect(f);
      salida = f;
      nodos.push(f);
    }
    salida.connect(g);
    g.connect(master);
    osc.start(t);
    voz(osc, nodos, t + dur + 0.02);
  } catch (e) { /* silencioso */ }
}

// Ráfaga de ruido filtrado con envolvente
function ruido({ tipo, freq, dur, vol, t0 = 0, prio = false }) {
  if (!listo() || !cupo(prio)) return;
  try {
    const t = ctx.currentTime + t0;
    const src = ctx.createBufferSource();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    src.buffer = noiseBuf;
    f.type = tipo;
    f.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t, Math.random() * 0.5);
    voz(src, [src, f, g], t + dur + 0.02);
  } catch (e) { /* silencioso */ }
}

function crear() {
  if (ctx || !Ctor) return;
  try {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ctx.destination);
    // Buffer de ruido blanco de 1s, creado una sola vez
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ctx = null; }
}

export const audio = {
  // Crea/reanuda el contexto; llamar en el primer gesto del usuario
  unlock() {
    try {
      crear();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch (e) { /* silencioso */ }
  },

  setMuted(m) {
    muted = !!m;
    try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch (e) { /* nada */ }
    try {
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.02);
    } catch (e) { /* nada */ }
  },
  isMuted() { return muted; },

  shoot() {
    if (!listo() || !libre('shoot', 45)) return;
    tono({ tipo: 'square', f0: 880, f1: 440, dur: 0.06, vol: 0.05 });
  },

  hit() {
    if (!listo() || !libre('hit', 25)) return;
    ruido({ tipo: 'highpass', freq: 3000, dur: 0.03, vol: 0.12 });
  },

  // size 0..1: más larga y grave cuanto mayor
  kill(size = 0.5) {
    if (!listo()) return;
    const s = Math.min(1, Math.max(0, Number(size) || 0));
    const dur = 0.15 + 0.35 * s;
    ruido({ tipo: 'lowpass', freq: 1800 - 1200 * s, dur, vol: 0.25 });
    tono({ f0: 220 - 120 * s, f1: 40, dur, vol: 0.3 });
  },

  hurt() {
    tono({ tipo: 'sawtooth', f0: 220, f1: 55, dur: 0.35, vol: 0.4,
      filtro: { tipo: 'lowpass', f0: 1200, f1: 200 }, prio: true });
  },

  shieldHit() {
    tono({ tipo: 'triangle', f0: 1200, f1: 600, dur: 0.12, vol: 0.2 });
    tono({ tipo: 'triangle', f0: 2400, f1: 1500, dur: 0.06, vol: 0.06 });
  },

  enemyShoot() {
    if (!listo() || !libre('enemyShoot', 60)) return;
    tono({ tipo: 'triangle', f0: 520, f1: 300, dur: 0.05, vol: 0.06 });
  },

  powerup() {
    [523, 659, 784, 1047].forEach((f, i) =>
      tono({ tipo: 'square', f0: f, dur: 0.08, vol: 0.07, t0: i * 0.055 }));
  },

  wave() {
    tono({ tipo: 'sine', f0: 659, dur: 0.6, vol: 0.2 });
    tono({ tipo: 'triangle', f0: 880, dur: 0.5, vol: 0.1, t0: 0.12 });
  },

  boss() {
    tono({ tipo: 'sawtooth', f0: 70, dur: 1.2, vol: 0.45,
      filtro: { tipo: 'lowpass', f0: 150, f1: 150 }, prio: true });
    // El filtro abre y cierra: barrido extra con rampas manuales
    ruido({ tipo: 'lowpass', freq: 600, dur: 1.2, vol: 0.3, prio: true });
    tono({ tipo: 'sine', f0: 45, f1: 30, dur: 1.2, vol: 0.35, prio: true });
  },

  gameOver() {
    [392, 330, 262].forEach((f, i) =>
      tono({ tipo: 'triangle', f0: f, f1: f * 0.97, dur: 0.45, vol: 0.25, t0: i * 0.25, prio: true }));
  },

  click() {
    tono({ tipo: 'square', f0: 1400, f1: 900, dur: 0.025, vol: 0.05 });
  },
};
