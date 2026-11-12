// Arranque de Hanamichi: crea los módulos, conecta la interfaz y ejecuta el bucle con delta time.
import { Render } from './render.js';
import { Input } from './input.js';
import { audio } from './audio.js';
import { Interfaz } from './ui.js';
import { Juego } from './juego.js';
import { datos } from './datos.js';
import { red, codigoSala } from './red.js';

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
let verFps = false;
ui.marcarTactil(input.tactil);

// ---------- Ajustes ----------
const aj = datos.ajustes;
const nombrePorDefecto = 'Jugador ' + (10 + ((Math.random() * 90) | 0));
if (aj.volumen == null) aj.volumen = audio.getVolume();
input.sensibilidad = aj.sensibilidad;
input.correrSiempre = aj.correr;
juego.camara.fovBase = aj.fov;
render.setCalidad(aj.calidad);
Object.assign(juego.config, { heroe: aj.heroe, dificultad: aj.dificultad, nombre: aj.nombre || nombrePorDefecto, bots: aj.bots });
juego.cambiarHeroe(aj.heroe);
ui.construirMenu(aj, (clave, v) => {
  audio.ui();
  datos.ajustar({ [clave]: v });
  if (clave === 'sensibilidad') input.sensibilidad = v;
  if (clave === 'volumen') audio.setVolume(v);
  if (clave === 'calidad') render.setCalidad(v);
  if (clave === 'fov') juego.camara.fovBase = v;
  if (clave === 'correr') input.correrSiempre = v;
  if (clave === 'heroe') juego.cambiarHeroe(v);
  if (clave === 'dificultad') juego.config.dificultad = v;
  if (clave === 'musica') audio.setMusicVolume?.(v);
  if (clave === 'fps') { verFps = v; if (!v) ui.fps?.(null); }
  if (clave === 'nombre') juego.config.nombre = v || nombrePorDefecto;
});
ui.stats(datos.stats);
verFps = !!aj.fps;
audio.setMusicVolume?.(aj.musica ?? 0.5);
audio.musica?.('menu');

// ---------- Online ----------
const params = new URLSearchParams(location.search);
const transporte = params.get('red') === 'local' ? 'local' : 'supabase';
const salaUrl = (params.get('sala') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
const campoSala = document.getElementById('codigoSala');
if (salaUrl) campoSala.value = salaUrl;

function enlaceSala(sala) {
  const u = new URL(location.href);
  u.searchParams.set('sala', sala);
  return u.toString();
}

async function entrar(sala) {
  const ok = await juego.unirseOnline(sala, transporte);
  if (ok) {
    history.replaceState(null, '', enlaceSala(sala));
    ui.toast(`Sala ${sala}: comparte el enlace para jugar con amigos`);
  }
}

// ---------- Botones ----------
const al = (id, fn) => document.getElementById(id).addEventListener('click', () => { audio.unlock(); audio.ui(); fn(); });
al('btnJugar', () => juego.empezarPartida());
al('btnRapida', () => entrar('PUBLICA'));
al('btnCrear', () => { const s = codigoSala(); campoSala.value = s; entrar(s); });
al('btnUnirse', () => {
  const s = campoSala.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length < 3) { ui.toast('Escribe el código de la sala (3 a 6 letras)'); campoSala.focus(); return; }
  entrar(s);
});
al('btnCancelarCon', () => { red.salir(); juego.salirAlMenu(); });
al('btnRevancha', () => juego.revancha());
al('btnSeguir', () => juego.seguir());
al('btnAbandonar', () => juego.salirAlMenu());
al('btnMenu', () => juego.salirAlMenu());
al('btnPausa', () => juego.pausar());
al('btnAjustes', () => ui.ajustes(true, 'menu'));
al('btnAjustesPausa', () => ui.ajustes(true, 'pausa'));
al('btnCerrarAjustes', () => ui.ajustes(false));
al('btnInvitar', async () => {
  const url = enlaceSala(red.sala);
  try { await navigator.clipboard.writeText(url); ui.toast('Enlace copiado'); } catch { ui.toast(url); }
});
campoSala.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('btnUnirse').click(); });
addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse' && !ui.tactil) ui.marcarTactil(true); }, { passive: true });
addEventListener('pagehide', () => red.salir());

// Pausa automática al cambiar de pestaña (sin conexión).
document.addEventListener('visibilitychange', () => { if (document.hidden && !juego.online) juego.pausar(); });
// Online con la pestaña oculta: el navegador para los fotogramas, así que mantenemos un latido
// para que los demás no nos den por desconectados.
setInterval(() => { if (document.hidden && juego.online) juego.latidoRed(); }, 500);

// ---------- Tamaño ----------
new ResizeObserver(() => render.redimensionar()).observe(canvas);

// ---------- Bucle ----------
let ultimo = performance.now(), fpsN = 0, fpsT = 0;
function fotograma(ahora) {
  requestAnimationFrame(fotograma);
  const dt = Math.min(0.05, (ahora - ultimo) / 1000);
  ultimo = ahora;
  const pasos = dt > 1 / 45 ? 2 : 1;
  for (let i = 0; i < pasos; i++) juego.actualizar(dt / pasos);
  render.dibujar(juego.t);
  render.adaptar(dt);
  if (verFps) {
    fpsN++; fpsT += dt;
    if (fpsT >= 0.5) { ui.fps?.(Math.round(fpsN / fpsT), juego.online ? red.estado : null); fpsN = 0; fpsT = 0; }
  }
}
requestAnimationFrame(fotograma);
carga.hidden = true;
ui.menu();

window.hanamichi = { juego, render, audio, red };

// Enlace de invitación: entra directamente en la sala.
if (salaUrl && params.get('auto') !== '0') entrar(salaUrl);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
