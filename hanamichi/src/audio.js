// Audio procedural del duelo: todo se genera con Web Audio API, sin archivos.

const KEY_MUTE = 'hanamichi:muted';
const KEY_VOL = 'hanamichi:volumen';
const MAX_VOCES = 28;

let ctx = null;        // AudioContext (se crea en unlock)
let master = null;     // ganancia master
let noiseBuf = null;   // buffer de ruido reutilizado
let voces = 0;         // voces activas
let muted = false;
let volumen = 0.7;
const ultimo = {};     // última vez (ctx.currentTime) por sonido, para throttle

// Lee el estado guardado (seguro sin localStorage)
try { muted = localStorage.getItem(KEY_MUTE) === '1'; } catch (e) { muted = false; }
try {
  const v = parseFloat(localStorage.getItem(KEY_VOL));
  if (Number.isFinite(v)) volumen = Math.min(1, Math.max(0, v));
} catch (e) { volumen = 0.7; }

const Ctor = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;

const ganMaster = () => (muted ? 0 : 0.5 * volumen);
const listo = () => !!ctx && ctx.state === 'running';

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

// Tramo final: atenuación y lowpass por distancia, y eco opcional; conecta a master
function cadena(g, nodos, t, dist, eco) {
  let sal = g;
  if (dist > 0) {
    const f = ctx.createBiquadFilter();
    const a = ctx.createGain();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(Math.max(500, 9000 - dist * 140), t);
    a.gain.value = 1 / (1 + dist / 12);
    sal.connect(f);
    f.connect(a);
    sal = a;
    nodos.push(f, a);
  }
  sal.connect(master);
  if (eco) {
    const d = ctx.createDelay(0.5);
    const fb = ctx.createGain();
    d.delayTime.value = 0.12;
    fb.gain.value = 0.3;
    sal.connect(d);
    d.connect(fb);
    fb.connect(d);
    d.connect(master);
    nodos.push(d, fb);
  }
}

// Oscilador con barrido de frecuencia y envolvente de volumen
function tono({ tipo = 'sine', f0, f1, dur, vol, t0 = 0, dist = 0, prio = false }) {
  if (!listo() || (!prio && voces >= MAX_VOCES)) return;
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
    osc.connect(g);
    cadena(g, nodos, t, dist, false);
    osc.start(t);
    voz(osc, nodos, t + dur + 0.02);
  } catch (e) { /* silencioso */ }
}

// Ráfaga de ruido filtrado (con barrido opcional de frecuencia) y envolvente
function ruido({ tipo, freq, f1, q = 1, dur, vol, t0 = 0, dist = 0, eco = false, prio = false }) {
  if (!listo() || !noiseBuf || (!prio && voces >= MAX_VOCES)) return;
  try {
    const t = ctx.currentTime + t0;
    const src = ctx.createBufferSource();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    const nodos = [src, f, g];
    src.buffer = noiseBuf;
    f.type = tipo;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    cadena(g, nodos, t, dist, eco);
    src.start(t, Math.random() * 0.5);
    // Con eco la voz dura más para no cortar la cola
    voz(src, nodos, t + dur + (eco ? 0.6 : 0.02));
  } catch (e) { /* silencioso */ }
}

// Jingle: lista de notas [frecuencia, inicio, duración]
function jingle(notas, tipo, vol) {
  notas.forEach(([f, t0, dur]) => {
    tono({ tipo, f0: f, dur, vol, t0, prio: true });
    tono({ tipo: 'sine', f0: f * 2, dur: dur * 0.8, vol: vol * 0.3, t0, prio: true });
  });
}

function crear() {
  if (ctx || !Ctor) return;
  try {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = ganMaster();
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ctx.destination);
    // Buffer de ruido blanco de 1s, creado una sola vez
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ctx = null; }
}

function aplicarMaster() {
  try { if (master) master.gain.setTargetAtTime(ganMaster(), ctx.currentTime, 0.02); } catch (e) { /* nada */ }
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
    try { localStorage.setItem(KEY_MUTE, muted ? '1' : '0'); } catch (e) { /* nada */ }
    aplicarMaster();
  },
  isMuted() { return muted; },

  setVolume(v) {
    const n = Number(v);
    volumen = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.7;
    try { localStorage.setItem(KEY_VOL, String(volumen)); } catch (e) { /* nada */ }
    aplicarMaster();
  },
  getVolume() { return volumen; },

  // tipo: 'rifle' | 'escopeta' | 'franco' | 'pistola' | 'subfusil'; distancia en metros
  disparo(tipo, distancia = 0) {
    if (!listo() || !libre('disparo_' + tipo + (distancia > 0 ? 'l' : ''), tipo === 'subfusil' ? 30 : 40)) return;
    const dist = Math.max(0, Number(distancia) || 0);
    if (tipo === 'escopeta') {
      ruido({ tipo: 'lowpass', freq: 1400, f1: 200, dur: 0.25, vol: 0.5, dist });
      tono({ f0: 90, f1: 40, dur: 0.2, vol: 0.4, dist });
    } else if (tipo === 'franco') {
      ruido({ tipo: 'bandpass', freq: 2500, f1: 500, q: 0.8, dur: 0.12, vol: 0.55, dist, eco: true });
      ruido({ tipo: 'lowpass', freq: 900, f1: 150, dur: 0.6, vol: 0.25, dist });
      tono({ f0: 110, f1: 40, dur: 0.15, vol: 0.4, dist });
    } else if (tipo === 'subfusil') {
      ruido({ tipo: 'bandpass', freq: 2600, q: 1.4, dur: 0.06, vol: 0.32, dist });
      tono({ f0: 180, f1: 90, dur: 0.06, vol: 0.25, dist });
    } else if (tipo === 'pistola') {
      ruido({ tipo: 'highpass', freq: 2200, dur: 0.07, vol: 0.3, dist });
      tono({ f0: 300, f1: 120, dur: 0.05, vol: 0.2, dist });
    } else {
      ruido({ tipo: 'bandpass', freq: 1800, q: 1.2, dur: 0.09, vol: 0.4, dist });
      tono({ f0: 120, f1: 60, dur: 0.09, vol: 0.35, dist });
    }
  },

  recarga() {
    if (!listo()) return;
    [0, 0.35].forEach((t0, i) => {
      ruido({ tipo: 'bandpass', freq: i ? 2200 : 3200, q: 4, dur: 0.04, vol: 0.3, t0 });
      tono({ tipo: 'square', f0: i ? 700 : 1100, f1: 500, dur: 0.03, vol: 0.06, t0 });
    });
  },

  vacio() {
    if (!listo() || !libre('vacio', 80)) return;
    ruido({ tipo: 'bandpass', freq: 3000, q: 3, dur: 0.025, vol: 0.25 });
  },

  impacto(cabeza = false) {
    if (!listo() || !libre('impacto', 25)) return;
    if (cabeza) {
      tono({ f0: 1760, dur: 0.25, vol: 0.2 });
      tono({ f0: 2640, dur: 0.25, vol: 0.12 });
    } else {
      tono({ f0: 2600, dur: 0.04, vol: 0.15 });
    }
  },

  dano() {
    ruido({ tipo: 'lowpass', freq: 700, f1: 150, dur: 0.22, vol: 0.5, prio: true });
    tono({ f0: 80, f1: 50, dur: 0.25, vol: 0.5, prio: true });
  },

  katana() {
    if (!listo() || !libre('katana', 60)) return;
    ruido({ tipo: 'bandpass', freq: 600, f1: 4000, q: 2, dur: 0.18, vol: 0.35 });
  },

  katanaGolpe() {
    if (!listo()) return;
    ruido({ tipo: 'bandpass', freq: 600, f1: 4000, q: 2, dur: 0.18, vol: 0.35 });
    tono({ tipo: 'triangle', f0: 1800, dur: 0.3, vol: 0.18, t0: 0.12 });
    tono({ tipo: 'triangle', f0: 2700, dur: 0.2, vol: 0.08, t0: 0.12 });
  },

  granadaLanzar() {
    if (!listo() || !libre('granada', 100)) return;
    ruido({ tipo: 'bandpass', freq: 400, f1: 1200, dur: 0.15, vol: 0.2 });
    tono({ f0: 200, f1: 120, dur: 0.1, vol: 0.12 });
  },

  explosion(distancia = 0) {
    if (!listo()) return;
    const dist = Math.max(0, Number(distancia) || 0);
    ruido({ tipo: 'lowpass', freq: 1500, f1: 80, dur: 1.2, vol: 0.7, dist, prio: true });
    tono({ f0: 50, f1: 25, dur: 1.0, vol: 0.6, dist, prio: true });
  },

  paso() {
    if (!listo() || !libre('paso', 260)) return;
    ruido({ tipo: 'lowpass', freq: 500, dur: 0.05, vol: 0.06 });
  },

  salto(doble = false) {
    if (!listo() || !libre('salto', 100)) return;
    tono({ f0: doble ? 260 : 180, f1: doble ? 520 : 320, dur: 0.1, vol: 0.08 });
    if (doble) ruido({ tipo: 'bandpass', freq: 900, f1: 2400, q: 1.5, dur: 0.15, vol: 0.12 });
  },

  aterrizar() {
    if (!listo() || !libre('aterrizar', 150)) return;
    ruido({ tipo: 'lowpass', freq: 600, f1: 120, dur: 0.12, vol: 0.22 });
  },

  saltador(distancia = 0) {
    if (!listo() || !libre('saltador', 120)) return;
    tono({ f0: 220, f1: 880, dur: 0.35, vol: 0.18, dist: distancia });
    ruido({ tipo: 'bandpass', freq: 800, f1: 3000, q: 1, dur: 0.3, vol: 0.18, dist: distancia });
  },

  destello(distancia = 0) {
    if (!listo()) return;
    ruido({ tipo: 'bandpass', freq: 3000, f1: 600, q: 2, dur: 0.22, vol: 0.3, dist: distancia });
    tono({ tipo: 'triangle', f0: 1400, f1: 2400, dur: 0.18, vol: 0.12, dist: distancia });
  },

  curar(distancia = 0) {
    if (!listo()) return;
    jingle([[784, 0, 0.15], [988, 0.1, 0.15], [1175, 0.2, 0.3]], 'sine', distancia > 20 ? 0.04 : 0.1);
  },

  rayo(distancia = 0) {
    if (!listo() || !libre('rayo', 60)) return;
    ruido({ tipo: 'highpass', freq: 1800, dur: 0.25, vol: 0.45, dist: distancia, eco: true });
    tono({ tipo: 'sawtooth', f0: 900, f1: 80, dur: 0.3, vol: 0.18, dist: distancia });
  },

  hielo(distancia = 0) {
    if (!listo()) return;
    ruido({ tipo: 'bandpass', freq: 5000, f1: 1500, q: 3, dur: 0.4, vol: 0.25, dist: distancia });
    tono({ tipo: 'triangle', f0: 2093, dur: 0.4, vol: 0.08, dist: distancia });
    tono({ tipo: 'triangle', f0: 2637, dur: 0.35, vol: 0.06, t0: 0.05, dist: distancia });
  },

  fuego(distancia = 0) {
    if (!listo() || !libre('fuego', 60)) return;
    ruido({ tipo: 'lowpass', freq: 2500, f1: 400, dur: 0.35, vol: 0.35, dist: distancia });
    tono({ f0: 160, f1: 70, dur: 0.25, vol: 0.2, dist: distancia });
  },

  definitiva(distancia = 0) {
    if (!listo()) return;
    tono({ tipo: 'sawtooth', f0: 110, f1: 440, dur: 0.6, vol: 0.18, dist: distancia, prio: true });
    tono({ tipo: 'triangle', f0: 220, f1: 880, dur: 0.6, vol: 0.14, dist: distancia, prio: true });
    ruido({ tipo: 'bandpass', freq: 500, f1: 4000, q: 1, dur: 0.7, vol: 0.25, dist: distancia, prio: true });
  },

  listoPoder() {
    if (!listo() || !libre('listo', 300)) return;
    tono({ f0: 1320, dur: 0.08, vol: 0.06 });
    tono({ f0: 1760, dur: 0.1, vol: 0.05, t0: 0.06 });
  },

  baja(racha = 1) {
    if (!listo()) return;
    const base = 660 * Math.pow(1.122, Math.min(6, racha - 1));
    tono({ tipo: 'triangle', f0: base, dur: 0.12, vol: 0.2, prio: true });
    tono({ tipo: 'triangle', f0: base * 1.5, dur: 0.25, vol: 0.18, t0: 0.08, prio: true });
    ruido({ tipo: 'highpass', freq: 4000, dur: 0.08, vol: 0.12, prio: true });
  },

  muerte() {
    if (!listo()) return;
    tono({ tipo: 'sawtooth', f0: 330, f1: 80, dur: 0.7, vol: 0.18, prio: true });
    ruido({ tipo: 'lowpass', freq: 900, f1: 100, dur: 0.6, vol: 0.3, prio: true });
  },

  reaparecer() {
    if (!listo()) return;
    tono({ f0: 523, f1: 1046, dur: 0.25, vol: 0.12, prio: true });
  },

  deslizar() {
    if (!listo() || !libre('deslizar', 150)) return;
    ruido({ tipo: 'lowpass', freq: 1200, f1: 300, dur: 0.35, vol: 0.2 });
  },

  cambiarArma() {
    if (!listo() || !libre('cambiar', 80)) return;
    ruido({ tipo: 'bandpass', freq: 2000, q: 3, dur: 0.04, vol: 0.2 });
    tono({ tipo: 'square', f0: 500, f1: 350, dur: 0.05, vol: 0.05, t0: 0.05 });
  },

  cuentaAtras(final = false) {
    if (!listo()) return;
    if (final) tono({ f0: 1320, dur: 0.35, vol: 0.2, prio: true });
    else tono({ f0: 660, dur: 0.12, vol: 0.18, prio: true });
  },

  victoriaRonda() {
    if (!listo()) return;
    jingle([[523, 0, 0.2], [659, 0.2, 0.2], [784, 0.4, 0.3]], 'triangle', 0.18);
  },

  derrotaRonda() {
    if (!listo()) return;
    jingle([[523, 0, 0.2], [440, 0.2, 0.2], [330, 0.4, 0.3]], 'triangle', 0.18);
  },

  victoriaFinal() {
    if (!listo()) return;
    jingle([[523, 0, 0.2], [659, 0.2, 0.2], [784, 0.4, 0.2], [1047, 0.6, 0.25], [1319, 0.85, 0.55]],
      'triangle', 0.2);
  },

  ui() {
    if (!listo() || !libre('ui', 30)) return;
    tono({ f0: 900, f1: 700, dur: 0.04, vol: 0.08 });
  },
};
