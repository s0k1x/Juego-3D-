// Arranque de Hanamichi: crea los módulos, conecta la interfaz y ejecuta el bucle con delta time.
import { Render } from './render.js';
import { Input } from './input.js';
import { audio } from './audio.js';
import { Interfaz } from './ui.js';
import { Juego } from './juego.js';
import { datos } from './datos.js';

const canvas = document.getElementById('lienzo');
const carga = document.getElementById('carga');

function sinWebGL() {
  carga.textContent = 'Tu navegador no puede mostrar gráficos 3D (WebGL). Prueba con otro navegador o activa la aceleración por hardware.';
}

let render;
try { render = new Render(canvas); } catch (e) { console.warn(e); sinWebGL(); throw e; }

const ui = new Interfaz();
const input = new Input(canvas, document.getElementById('tactil'));
const juego = new Juego({ render, input, audio, ui });
input.onGesto = () => audio.unlock();
ui.marcarTactil(input.tactil);

// ---------- Ajustes ----------
const aj = datos.ajustes;
aj.volumen = aj.volumen ?? audio.getVolume();
input.sensibilidad = aj.sensibilidad;
render.setCalidad(aj.calidad);
Object.assign(juego.config, { primaria: aj.primaria, dificultad: aj.dificultad, camara: aj.camara });
juego.jugador.arsenal.reiniciar(aj.primaria);
ui.construirMenu(aj, (clave, v) => {
  audio.ui();
  datos.ajustar({ [clave]: v });
  if (clave === 'sensibilidad') input.sensibilidad = v;
  if (clave === 'volumen') audio.setVolume(v);
  if (clave === 'calidad') render.setCalidad(v);
  if (clave === 'camara') { juego.config.camara = v; juego.camara.modo = v; }
  if (clave === 'primaria') { juego.config.primaria = v; juego.jugador.arsenal.reiniciar(v); }
  if (clave === 'dificultad') juego.config.dificultad = v;
});
ui.stats(datos.stats);

// ---------- Botones ----------
const al = (id, fn) => document.getElementById(id).addEventListener('click', () => { audio.unlock(); audio.ui(); fn(); });
al('btnJugar', () => juego.empezarPartida());
al('btnRevancha', () => juego.empezarPartida());
al('btnSeguir', () => juego.seguir());
al('btnAbandonar', () => juego.salirAlMenu());
al('btnMenu', () => ui.menu());
al('btnPausa', () => juego.pausar());
al('btnAjustes', () => ui.ajustes(true, 'menu'));
al('btnAjustesPausa', () => ui.ajustes(true, 'pausa'));
al('btnCerrarAjustes', () => ui.ajustes(false));
addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse' && !ui.tactil) ui.marcarTactil(true); }, { passive: true });

// Pausa automática al cambiar de pestaña.
document.addEventListener('visibilitychange', () => { if (document.hidden) juego.pausar(); });

// ---------- Tamaño ----------
new ResizeObserver(() => render.redimensionar()).observe(canvas);

// ---------- Bucle ----------
let ultimo = performance.now();
function fotograma(ahora) {
  requestAnimationFrame(fotograma);
  const dt = Math.min(0.05, (ahora - ultimo) / 1000);
  ultimo = ahora;
  // Con fotogramas largos dividimos la física en dos pasos (sin atravesar paredes).
  const pasos = dt > 1 / 45 ? 2 : 1;
  for (let i = 0; i < pasos; i++) juego.actualizar(dt / pasos);
  render.dibujar(juego.t);
  render.adaptar(dt);
}
requestAnimationFrame(fotograma);
carga.hidden = true;
ui.menu();

window.hanamichi = { juego, render, audio };

// Modo sin conexión (no en desarrollo local).
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
