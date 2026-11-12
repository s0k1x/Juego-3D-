// Audio procedural del duelo: todo se genera con Web Audio API, sin archivos.

const KEY_MUTE = 'hanamichi:muted';
const KEY_VOL = 'hanamichi:volumen';
const KEY_MUS = 'hanamichi:musica';
const MAX_VOCES = 28;
const MUS_MAX = 40;        // límite propio de voces de la música
const MUS_ESC = 0.4;       // escala del bus de música (queda por debajo de los efectos)

let ctx = null;        // AudioContext (se crea en unlock)
let master = null;     // ganancia master
let noiseBuf = null;   // buffer de ruido reutilizado
let voces = 0;         // voces activas
let muted = false;
let volumen = 0.7;
let musVoces = 0;      // voces de música activas
let musVol = 0.5;
let musicaGain = null; // bus de música -> master
let tema = null;       // tema sonando { nombre, def, bus, filt }
let quiere = null;     // tema deseado (se recuerda si aún no hay contexto)
let nextT = 0;         // próximo paso a agendar
let stepI = 0;
let intObj = 0.5;      // intensidad objetivo
let lv = 0.5;          // intensidad suavizada
let lvAplic = -1;
let ambQuiere = false;
let ambNodes = null;
let brownBuf = null;
let vidaBaja = false;  // latido activo
let nextLatido = 0;
const ultimo = {};     // última vez (ctx.currentTime) por sonido, para throttle

// Lee el estado guardado (seguro sin localStorage)
try { muted = localStorage.getItem(KEY_MUTE) === '1'; } catch (e) { muted = false; }
try {
  const v = parseFloat(localStorage.getItem(KEY_VOL));
  if (Number.isFinite(v)) volumen = Math.min(1, Math.max(0, v));
} catch (e) { volumen = 0.7; }
try {
  const m = parseFloat(localStorage.getItem(KEY_MUS));
  if (Number.isFinite(m)) musVol = Math.min(1, Math.max(0, m));
} catch (e) { musVol = 0.5; }

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
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 8;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    master.connect(comp);
    musicaGain = ctx.createGain();
    musicaGain.gain.value = musVol * MUS_ESC;
    musicaGain.connect(master);
    setInterval(tick, 100);
    comp.connect(ctx.destination);
    // Buffer de ruido blanco de 1s, creado una sola vez
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ctx = null; }
}

// ---------- Música procedural (planificador lookahead) ----------
const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const vari = () => 1 + (Math.random() * 0.08 - 0.04);

function musFin(fuente, nodos, fin) {
  musVoces++;
  let hecho = false;
  fuente.onended = () => {
    if (hecho) return;
    hecho = true;
    musVoces--;
    nodos.forEach((n) => { try { n.disconnect(); } catch (e) { /* nada */ } });
  };
  fuente.stop(fin);
}

// Nota de música: atk (s) y rel (s) opcionales para notas sostenidas (pads)
function mnota({ tipo = 'sine', f, f1, dur, vol, t, atk = 0.004, rel = 0 }) {
  if (!tema || musVoces >= MUS_MAX) return;
  try {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = tipo;
    osc.frequency.setValueAtTime(f, t);
    if (f1) osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + atk);
    if (rel) {
      g.gain.setValueAtTime(vol, t + Math.max(atk, dur - rel));
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
    } else {
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    }
    osc.connect(g);
    g.connect(tema.bus);
    osc.start(t);
    musFin(osc, [osc, g], t + dur + 0.03);
  } catch (e) { /* silencioso */ }
}

function mrui({ tipo, freq, q = 1, dur, vol, t }) {
  if (!tema || !noiseBuf || musVoces >= MUS_MAX) return;
  try {
    const src = ctx.createBufferSource();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    src.buffer = noiseBuf;
    f.type = tipo;
    f.frequency.value = freq;
    f.Q.value = q;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(tema.bus);
    src.start(t, Math.random() * 0.5);
    musFin(src, [src, f, g], t + dur + 0.03);
  } catch (e) { /* silencioso */ }
}

const bombo = (t, vol) => {
  mnota({ f: 140, f1: 45, dur: 0.17, vol, t, atk: 0.002 });
  mrui({ tipo: 'highpass', freq: 3000, dur: 0.012, vol: vol * 0.3, t });
};
const campana = (t, m, vol) => {
  mnota({ f: mf(m), dur: 1.1, vol, t });
  mnota({ f: mf(m) * 2.01, dur: 0.45, vol: vol * 0.3, t });
};
const mapa = (lista) => {
  const a = new Array(16).fill(null);
  lista.forEach(([s, m, l]) => { a[s] = [m, l]; });
  return a;
};

// --- Menú: city-pop/lofi, 84 bpm, 8 compases (1 acorde por compás)
const M_ACORDES = [
  [53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [55, 59, 62, 65],
  [48, 52, 55, 59], [57, 60, 64, 67], [50, 53, 57, 60], [55, 59, 62, 65],
];
const M_RAIZ = [41, 40, 38, 43, 48, 45, 38, 43];
const M_MEL = [
  [[0, 76], [3, 72], [6, 69], [10, 72], [12, 76]],
  [[0, 79], [4, 76], [7, 74], [10, 76], [14, 72]],
  [[0, 72], [3, 69], [6, 72], [8, 76], [12, 74]],
  [[0, 74], [4, 79], [6, 76], [8, 74], [12, 72], [14, 74]],
  [[0, 76], [3, 79], [6, 81], [10, 79], [12, 76]],
  [[0, 81], [4, 79], [7, 76], [10, 72], [12, 76]],
  [[0, 74], [3, 72], [6, 69], [8, 72], [11, 74], [14, 76]],
  [[0, 79], [4, 76], [6, 74], [8, 72], [12, 74]],
];

function pasoMenu(i, t, pass, sp) {
  const bar = i >> 4;
  const s = i & 15;
  const alt = pass % 2 === 1; // variación en las pasadas impares
  if (s === 0) {
    M_ACORDES[bar].forEach((m) => {
      mnota({ tipo: 'triangle', f: mf(m), dur: 16 * sp + 0.4, vol: 0.05, t, atk: 0.4, rel: 1.0 });
      if (alt) mnota({ f: mf(m + 12), dur: 16 * sp + 0.2, vol: 0.016, t, atk: 0.5, rel: 1.0 });
    });
    mnota({ tipo: 'sawtooth', f: mf(M_ACORDES[bar][1]) * 1.004, dur: 16 * sp, vol: 0.012, t, atk: 0.5, rel: 1.0 });
  }
  if (s === 0) mnota({ f: mf(M_RAIZ[bar]), dur: 6 * sp, vol: 0.13, t, atk: 0.01 });
  if (s === 10) mnota({ f: mf(M_RAIZ[bar]), dur: 3 * sp, vol: 0.09, t, atk: 0.01 });
  if (s === 0 || s === 10) bombo(t, 0.13);
  if (s === 4 || s === 12) {
    mrui({ tipo: 'bandpass', freq: 1800, q: 1, dur: 0.09, vol: 0.04, t });
    mnota({ tipo: 'triangle', f: 190, f1: 150, dur: 0.07, vol: 0.025, t });
  }
  if (s % 2 === 0) mrui({ tipo: 'highpass', freq: 7000, dur: 0.03, vol: s % 4 === 2 ? 0.035 : 0.018, t });
  M_MEL[bar].forEach(([ms, m]) => {
    if (ms !== s) return;
    campana(t, m, 0.065);
    if (alt) campana(t + 3 * sp, m, 0.03);
  });
}

// --- Combate: 150 bpm, hirajoshi en La, 16 compases (A 8 + B 8)
const C_RAIZ = [45, 45, 41, 40, 45, 45, 41, 40, 41, 41, 40, 40, 45, 48, 41, 40];
const C_OCT = [0, 0, 12, 0, 0, 0, 12, 0];
const C_A = [
  mapa([[0, 69, 3], [3, 72, 1], [4, 71, 2], [6, 69, 2], [8, 65, 2], [10, 64, 2], [12, 65, 2], [14, 64, 2]]),
  mapa([[0, 69, 3], [3, 72, 1], [4, 76, 2], [6, 77, 2], [8, 76, 2], [10, 72, 2], [12, 71, 2], [14, 69, 2]]),
];
const C_B = [
  mapa([[0, 76, 4], [4, 77, 2], [6, 76, 2], [8, 72, 4], [12, 71, 2], [14, 69, 2]]),
  mapa([[0, 71, 4], [4, 72, 2], [6, 71, 2], [8, 69, 4], [12, 65, 4]]),
  mapa([[0, 76, 3], [3, 77, 1], [4, 81, 4], [8, 77, 4], [12, 76, 2], [14, 72, 2]]),
  mapa([[0, 71, 4], [4, 69, 4], [8, 64, 4], [12, 65, 2], [14, 64, 2]]),
];

function pasoCombate(i, t, pass, sp) {
  const bar = i >> 4;
  const s = i & 15;
  const secB = bar >= 8;
  const raiz = C_RAIZ[bar];
  // Base: bajo con octavas + bombo + hi-hat suave
  if (s % 2 === 0) {
    mnota({ tipo: 'sawtooth', f: mf(raiz + C_OCT[s >> 1]), dur: sp * 1.8, vol: 0.085, t });
    if (lv > 0.7 && s % 4 === 2) mnota({ tipo: 'square', f: mf(raiz + 12), dur: sp * 1.5, vol: 0.025, t });
  }
  if (s === 0) mnota({ f: mf(raiz), dur: sp * 4, vol: 0.12, t, atk: 0.005 });
  if (s % 4 === 0) bombo(t, 0.15 + 0.08 * lv);
  if (s % 2 === 0) mrui({ tipo: 'highpass', freq: 8000, dur: 0.03, vol: 0.025 + 0.015 * lv, t });
  // Capas por intensidad
  if (lv > 0.3 && (s === 4 || s === 12)) {
    mrui({ tipo: 'bandpass', freq: 1900, q: 0.9, dur: 0.13, vol: 0.07 + 0.05 * lv, t });
    mnota({ tipo: 'triangle', f: 220, f1: 160, dur: 0.08, vol: 0.05, t });
  }
  if (lv > 0.6 && secB && s === 15) mrui({ tipo: 'bandpass', freq: 2100, q: 0.9, dur: 0.06, vol: 0.04, t });
  if (lv > 0.5 && s % 2 === 1) mrui({ tipo: 'highpass', freq: 8500, dur: 0.02, vol: 0.014, t });
  if (lv > 0.2 && s === 14) mrui({ tipo: 'highpass', freq: 7000, dur: 0.12, vol: 0.03, t });
  if (lv > 0.7 && s === 0 && (bar & 7) === 0) mrui({ tipo: 'highpass', freq: 5000, dur: 0.8, vol: 0.05, t });
  if (lv > 0.4) {
    const nota = (secB ? C_B[bar & 3] : C_A[bar & 1])[s];
    if (nota) {
      const rv = clamp01((lv - 0.4) / 0.3);
      const d = nota[1] * sp * 0.95;
      mnota({ tipo: 'sawtooth', f: mf(nota[0]), dur: d, vol: 0.04 * rv, t, atk: 0.006 });
      mnota({ tipo: 'square', f: mf(nota[0]) * 1.005, dur: d, vol: 0.016 * rv, t, atk: 0.006 });
      if (lv > 0.8) mnota({ f: mf(nota[0] + 12), dur: d, vol: 0.03 * clamp01((lv - 0.8) / 0.15), t });
    }
  }
}

const DEF = {
  menu: { bpm: 84, pasos: 128, paso: pasoMenu, corte: 4500 },
  combate: { bpm: 150, pasos: 256, paso: pasoCombate, corte: 1500 },
};

function cambiarTema() {
  const now = ctx.currentTime;
  if (tema) {
    const v = tema;
    v.bus.gain.cancelScheduledValues(now);
    v.bus.gain.setValueAtTime(v.bus.gain.value, now);
    v.bus.gain.linearRampToValueAtTime(0, now + 0.6);
    setTimeout(() => { try { v.bus.disconnect(); v.filt.disconnect(); } catch (e) { /* nada */ } }, 900);
  }
  tema = null;
  const def = DEF[quiere];
  if (!def) return;
  const bus = ctx.createGain();
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.Q.value = 0.7;
  filt.frequency.value = def.corte;
  bus.gain.setValueAtTime(0.0001, now);
  bus.gain.linearRampToValueAtTime(1, now + 0.6);
  bus.connect(filt);
  filt.connect(musicaGain);
  tema = { nombre: quiere, def, bus, filt };
  stepI = 0;
  nextT = now + 0.08;
  lvAplic = -1;
}

function tickMusica() {
  const now = ctx.currentTime;
  if ((tema ? tema.nombre : null) !== quiere) cambiarTema();
  if (!tema) return;
  lv += (intObj - lv) * 0.25;
  if (tema.nombre === 'combate' && Math.abs(lv - lvAplic) > 0.01) {
    lvAplic = lv;
    tema.filt.frequency.setTargetAtTime(1500 + 9000 * lv * lv, now, 0.25);
  }
  const sp = 60 / tema.def.bpm / 4;
  if (nextT < now - 0.1) nextT = now + 0.05; // tras una pausa, no recuperar en ráfaga
  while (nextT < now + 0.25) {
    tema.def.paso(stepI % tema.def.pasos, nextT, Math.floor(stepI / tema.def.pasos), sp);
    stepI++;
    nextT += sp;
  }
}

// ---------- Ambiente ----------
function bufMarron() {
  if (brownBuf) return brownBuf;
  const n = ctx.sampleRate * 4;
  const fund = Math.floor(ctx.sampleRate * 0.25);
  const raw = new Float32Array(n + fund);
  let u = 0;
  for (let i = 0; i < raw.length; i++) {
    u = (u + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    raw[i] = u * 3.5;
  }
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) {
    d[i] = i < fund ? raw[i] * (i / fund) + raw[n + i] * (1 - i / fund) : raw[i];
  }
  brownBuf = b;
  return b;
}

function crearAmbiente() {
  const buf = bufMarron();
  const fuentes = [];
  const nodos = [];
  const bus = ctx.createGain();
  bus.gain.value = 0.0001;
  bus.connect(master);
  nodos.push(bus);
  const lfo = (hz, prof, destino) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = hz;
    g.gain.value = prof;
    o.connect(g);
    g.connect(destino);
    o.start();
    fuentes.push(o);
    nodos.push(o, g);
  };
  // Viento: ruido marrón filtrado, con LFO lento en frecuencia y volumen
  const v = ctx.createBufferSource();
  const vf = ctx.createBiquadFilter();
  const vg = ctx.createGain();
  v.buffer = buf; v.loop = true;
  vf.type = 'lowpass'; vf.frequency.value = 500; vf.Q.value = 0.6;
  vg.gain.value = 0.5;
  v.connect(vf); vf.connect(vg); vg.connect(bus);
  v.start(0, 0);
  fuentes.push(v);
  nodos.push(v, vf, vg);
  lfo(0.09, 220, vf.frequency);
  lfo(0.06, 0.18, vg.gain);
  // Murmullo lejano de ciudad
  const c = ctx.createBufferSource();
  const cf = ctx.createBiquadFilter();
  const cg = ctx.createGain();
  c.buffer = buf; c.loop = true;
  cf.type = 'bandpass'; cf.frequency.value = 280; cf.Q.value = 0.7;
  cg.gain.value = 0.3;
  c.connect(cf); cf.connect(cg); cg.connect(bus);
  c.start(0, 1.7);
  fuentes.push(c);
  nodos.push(c, cf, cg);
  lfo(0.17, 0.1, cg.gain);
  ambNodes = { bus, fuentes, nodos };
}

function aplicarAmbiente() {
  if (!listo()) return;
  try {
    if (ambQuiere) {
      if (!ambNodes) crearAmbiente();
      ambNodes.bus.gain.setTargetAtTime(0.4, ctx.currentTime, 0.8);
    } else if (ambNodes) {
      const a = ambNodes;
      a.bus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.5);
      setTimeout(() => {
        if (ambQuiere || ambNodes !== a) return;
        ambNodes = null;
        a.fuentes.forEach((f) => { try { f.stop(); } catch (e) { /* nada */ } });
        a.nodos.forEach((n) => { try { n.disconnect(); } catch (e) { /* nada */ } });
      }, 3000);
    }
  } catch (e) { /* silencioso */ }
}

// Latido (poca vida): se agenda en el mismo planificador
function tickLatido() {
  const now = ctx.currentTime;
  if (nextLatido < now - 0.1) nextLatido = now + 0.05;
  while (nextLatido < now + 0.25) {
    const t0 = nextLatido - now;
    tono({ f0: 70, f1: 42, dur: 0.15, vol: 0.5, t0, prio: true });
    tono({ tipo: 'triangle', f0: 120, f1: 70, dur: 0.1, vol: 0.12, t0, prio: true });
    tono({ f0: 62, f1: 38, dur: 0.17, vol: 0.34, t0: t0 + 0.22, prio: true });
    nextLatido += 0.9;
  }
}

function tick() {
  try {
    if (!listo()) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    tickMusica();
    if (ambQuiere !== !!ambNodes) aplicarAmbiente();
    if (vidaBaja) tickLatido();
  } catch (e) { /* silencioso */ }
}

function aplicarMusVol() {
  try { if (musicaGain) musicaGain.gain.setTargetAtTime(musVol * MUS_ESC, ctx.currentTime, 0.05); } catch (e) { /* nada */ }
}

function aplicarMaster() {
  try { if (master) master.gain.setTargetAtTime(ganMaster(), ctx.currentTime, 0.02); } catch (e) { /* nada */ }
}

export const audio = {
  // Crea/reanuda el contexto; llamar en el primer gesto del usuario
  unlock() {
    try {
      crear();
      if (ctx && ctx.state === 'suspended') ctx.resume().then(tick).catch(() => {});
      else tick();
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
    const r = vari(); // variación de tono para que las ráfagas no suenen idénticas
    if (tipo === 'escopeta') {
      ruido({ tipo: 'highpass', freq: 2500 * r, dur: 0.04, vol: 0.3, dist });
      ruido({ tipo: 'lowpass', freq: 1400 * r, f1: 200, dur: 0.28, vol: 0.5, dist });
      tono({ f0: 95 * r, f1: 35, dur: 0.22, vol: 0.5, dist });
      ruido({ tipo: 'lowpass', freq: 600, f1: 100, dur: 0.6, vol: 0.18, dist, eco: true });
    } else if (tipo === 'franco') {
      ruido({ tipo: 'highpass', freq: 3200 * r, dur: 0.03, vol: 0.3, dist });
      ruido({ tipo: 'bandpass', freq: 2500 * r, f1: 500, q: 0.8, dur: 0.12, vol: 0.5, dist, eco: true });
      tono({ f0: 130 * r, f1: 40, dur: 0.16, vol: 0.5, dist });
      ruido({ tipo: 'lowpass', freq: 900, f1: 150, dur: 0.6, vol: 0.22, dist });
    } else if (tipo === 'subfusil') {
      ruido({ tipo: 'highpass', freq: 3500 * r, dur: 0.025, vol: 0.2, dist });
      ruido({ tipo: 'bandpass', freq: 2400 * r, q: 1.4, dur: 0.06, vol: 0.3, dist });
      tono({ f0: 190 * r, f1: 80, dur: 0.07, vol: 0.3, dist });
    } else if (tipo === 'pistola') {
      ruido({ tipo: 'highpass', freq: 2400 * r, dur: 0.05, vol: 0.32, dist });
      tono({ f0: 320 * r, f1: 110, dur: 0.06, vol: 0.28, dist });
      ruido({ tipo: 'lowpass', freq: 1200, f1: 300, dur: 0.16, vol: 0.08, dist });
    } else {
      ruido({ tipo: 'highpass', freq: 3000 * r, dur: 0.03, vol: 0.3, dist });
      ruido({ tipo: 'bandpass', freq: 1800 * r, q: 1.2, dur: 0.09, vol: 0.35, dist });
      tono({ f0: 150 * r, f1: 50, dur: 0.11, vol: 0.45, dist });
      ruido({ tipo: 'lowpass', freq: 700, f1: 150, dur: 0.35, vol: 0.12, dist });
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
    const r = vari();
    ruido({ tipo: 'bandpass', freq: 3500 * r, q: 6, dur: 0.02, vol: 0.2 });
    if (cabeza) {
      // «ding» brillante
      tono({ f0: 2093 * r, dur: 0.5, vol: 0.2 });
      tono({ f0: 3136 * r, dur: 0.35, vol: 0.12 });
      tono({ f0: 4186 * r, dur: 0.2, vol: 0.06 });
      ruido({ tipo: 'highpass', freq: 5000, dur: 0.03, vol: 0.15 });
    } else {
      // «tic» seco
      tono({ tipo: 'triangle', f0: 2400 * r, f1: 1800, dur: 0.035, vol: 0.14 });
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
    ruido({ tipo: 'highpass', freq: 2000, dur: 0.15, vol: 0.3, dist, prio: true });
    ruido({ tipo: 'lowpass', freq: 1500, f1: 80, dur: 1.2, vol: 0.65, dist, prio: true });
    tono({ f0: 55, f1: 25, dur: 1.0, vol: 0.55, dist, prio: true });
    tono({ f0: 38, f1: 20, dur: 1.6, vol: 0.6, dist, prio: true }); // subgrave
    ruido({ tipo: 'lowpass', freq: 400, f1: 60, dur: 1.8, vol: 0.3, dist, prio: true });
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
    const n = Math.max(1, Number(racha) || 1);
    const base = 660 * Math.pow(1.122, Math.min(6, n - 1));
    tono({ f0: 200, f1: 80, dur: 0.1, vol: 0.25, prio: true });
    tono({ tipo: 'triangle', f0: base, dur: 0.12, vol: 0.2, prio: true });
    tono({ tipo: 'triangle', f0: base * 1.5, dur: 0.25, vol: 0.18, t0: 0.08, prio: true });
    tono({ tipo: 'triangle', f0: base * 2, dur: 0.35, vol: 0.14, t0: 0.16, prio: true });
    ruido({ tipo: 'highpass', freq: 5000, dur: 0.12, vol: 0.1, t0: 0.08, prio: true });
    if (n >= 3) tono({ f0: base * 3, dur: 0.4, vol: 0.08, t0: 0.22, prio: true });
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

  // Tintineo metálico muy leve de casquillo
  casquillo() {
    if (!listo() || !libre('casquillo', 90)) return;
    const r = vari();
    ruido({ tipo: 'bandpass', freq: 6000 * r, q: 8, dur: 0.03, vol: 0.03 });
    tono({ f0: 4200 * r, f1: 3800, dur: 0.08, vol: 0.025 });
    tono({ f0: 3500 * r, dur: 0.05, vol: 0.015, t0: 0.07 });
  },

  // Arpegio ascendente corto y agradable
  botiquin() {
    if (!listo()) return;
    jingle([[523, 0, 0.14], [659, 0.08, 0.14], [784, 0.16, 0.14], [1047, 0.24, 0.35]], 'triangle', 0.12);
    ruido({ tipo: 'highpass', freq: 6000, dur: 0.2, vol: 0.05, t0: 0.24, prio: true });
  },

  // Latido grave en bucle mientras esté activa (idempotente)
  pocaVida(activa) {
    const a = !!activa;
    if (a && !vidaBaja) nextLatido = listo() ? ctx.currentTime + 0.05 : 0;
    vidaBaja = a;
  },

  // Música: 'menu' | 'combate' | null (fundido). Mismo tema = no hace nada.
  musica(nombre) {
    const n = DEF[nombre] ? nombre : null;
    if (n === quiere) return;
    quiere = n;
    tick();
  },
  intensidad(x) {
    const n = Number(x);
    intObj = Number.isFinite(n) ? clamp01(n) : 0;
  },
  setMusicVolume(v) {
    const n = Number(v);
    musVol = Number.isFinite(n) ? clamp01(n) : 0.5;
    try { localStorage.setItem(KEY_MUS, String(musVol)); } catch (e) { /* nada */ }
    aplicarMusVol();
  },
  getMusicVolume() { return musVol; },

  // Viento de azotea y murmullo lejano de ciudad
  ambiente(on) {
    ambQuiere = !!on;
    aplicarAmbiente();
  },

  _diag() { return { voces, musVoces }; },
};
