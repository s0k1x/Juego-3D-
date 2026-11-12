// Arranque: crea los módulos, conecta botones y ejecuta el bucle con delta time.
import { Input } from './input.js';
import { audio } from './audio.js';
import { Interfaz } from './ui.js';
import { Juego } from './game.js';
import { marcadores } from './storage.js';

const raiz = document.getElementById('juego');
const canvas = document.getElementById('lienzo');
canvas.tabIndex = 0;

const input = new Input(canvas);
const ui = new Interfaz();
const juego = new Juego({ canvas, input, audio, ui });
input.onGesto = () => audio.unlock();

// ---------- Botones ----------
const al = (id, fn) => document.getElementById(id).addEventListener('click', () => { audio.unlock(); audio.click(); fn(); });
al('btnJugar', () => juego.empezar());
al('btnOtra', () => juego.empezar());
al('btnSeguir', () => juego.seguir());
al('btnSalir', () => juego.irAInicio());
al('btnInicio', () => juego.irAInicio());
al('btnPausa', () => juego.pausar());
const alternarSonido = () => { audio.setMuted(!audio.isMuted()); ui.sonido(audio.isMuted()); };
al('btnSonidoInicio', alternarSonido);
al('btnSonidoPausa', alternarSonido);
document.getElementById('btnPausa').addEventListener('pointerdown', (e) => e.stopPropagation());

ui.sonido(audio.isMuted());
ui.controles(input.mode);
addEventListener('pointerdown', (e) => {
  const modo = e.pointerType === 'mouse' ? 'mouse' : 'touch';
  if (juego.estado === 'inicio') ui.controles(modo);
}, { passive: true });

// Pausa automática si se cambia de pestaña o la web que nos contiene pierde el foco.
document.addEventListener('visibilitychange', () => { if (document.hidden) juego.pausar(); });
addEventListener('blur', () => juego.pausar());

// ---------- Tamaño ----------
const ro = new ResizeObserver(() => juego.redimensionar());
ro.observe(raiz);
addEventListener('orientationchange', () => setTimeout(() => juego.redimensionar(), 200));

// ---------- Récord ----------
marcadores.cargarRecord().then((r) => { juego.record = r; ui.record(r); });
ui.mostrar('inicio');

// ---------- Bucle ----------
let ultimo = performance.now();
function fotograma(ahora) {
  // Delta en segundos, limitado para que una pestaña dormida no provoque saltos.
  let dt = Math.min(0.05, (ahora - ultimo) / 1000);
  ultimo = ahora;
  // Con dt grandes (pantallas lentas) se divide en pasos para no atravesar paredes ni balas.
  const pasos = dt > 1 / 50 ? 2 : 1;
  dt /= pasos;
  for (let i = 0; i < pasos; i++) juego.actualizar(dt);
  juego.dibujar();
  requestAnimationFrame(fotograma);
}
requestAnimationFrame(fotograma);

// Acceso para pruebas automáticas y para la web que contenga el juego.
window.tinta = { juego, audio };

// ---------- Sin conexión ----------
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !/^(localhost|127\.)/.test(location.hostname)) {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* sin modo sin conexión */ });
}
