// Demo de la interfaz: carga el <main> real de index.html y expone window.demo para poner cada pantalla y estado.
import { Interfaz } from '../src/ui.js';
import { ARMAS, POR_RANURA } from './armas-falso.js';

const html = await (await fetch('../index.html')).text();
const doc = new DOMParser().parseFromString(html, 'text/html');
document.getElementById('raiz').appendChild(document.importNode(doc.querySelector('main'), true));

const ui = new Interfaz({ ARMAS, POR_RANURA });
const cambios = [];
ui.construirMenu({
  nombre: 'Hana', modo: '2v2', mapa: 'azar', dificultad: 'normal',
  equipo: { principal: 'vector', secundaria: 'chispa', cuerpo: 'filo', utilidad: 'petardo' },
  sensibilidad: 1, fov: 80, volumen: 0.8, musica: 0.5, calidad: 'auto', fps: false,
}, (k, v) => cambios.push([k, v]));
ui.stats({ partidas: 24, victorias: 13, bajas: 212, muertes: 160 });

// Datos de ejecución de las armas (lo que daría juego.js en arsenal.arma).
const RT = {
  vector: { ranura: 'principal', auto: true, cargador: 30, disp: 0.012, dispMov: 0.02, dispCadera: 0.01 },
  trueno: { ranura: 'principal', cargador: 6, disp: 0.03, dispMov: 0.03 },
  aguja: { ranura: 'principal', cargador: 5, mira: true, disp: 0.002, dispMov: 0.05, dispCadera: 0.08 },
  chispa: { ranura: 'secundaria', cargador: 12, disp: 0.008, dispMov: 0.015 },
  filo: { ranura: 'cuerpo', cuerpo: true, combo: 3 },
};
const NOMBRES = ['Hana', 'Kenji', 'Mika', 'Rayo', 'Sora', 'Taro'];
const combatientes = (vivos = [1, 1, 0, 1, 1, 0]) => [
  { nombre: 'Hana', aliado: true, vivo: !!vivos[0], vida: 82, yo: true, bajas: 3, muertes: 1, dano: 410 },
  { nombre: 'Kenji', aliado: true, vivo: !!vivos[1], vida: 55, bajas: 2, muertes: 1, dano: 260 },
  { nombre: 'Mika con nombre', aliado: true, vivo: !!vivos[2], vida: 0, bajas: 1, muertes: 2, dano: 150 },
  { nombre: 'Rayo', aliado: false, vivo: !!vivos[3], vida: 100, bajas: 3, muertes: 2, dano: 380 },
  { nombre: 'SoraSoraSoraSo', aliado: false, vivo: !!vivos[4], vida: 30, bajas: 2, muertes: 2, dano: 300 },
  { nombre: 'Taro', aliado: false, vivo: !!vivos[5], vida: 0, bajas: 0, muertes: 3, dano: 90 },
];
function juegoFalso(o = {}) {
  const tipo = o.arma || 'vector';
  const a = { ...(RT[tipo] || { ranura: 'principal', cargador: 20 }) };
  const cs = combatientes(o.vivos);
  const j = {
    vida: o.vida ?? 82, escudo: o.escudo ?? 0, vivo: o.vivo ?? true, protegido: false, vel: { x: o.vel ?? 0, z: 0 }, suelo: true, deslizando: 0,
    arsenal: {
      ranuras: ['vector', 'chispa', 'filo'], indice: o.indice ?? (tipo === 'filo' ? 2 : tipo === 'chispa' ? 1 : 0), tipo, arma: a,
      municion: { vector: o.municion ?? 24, chispa: 12, aguja: o.municion ?? 5, trueno: 6 }, recargando: o.recargando ?? 0, progresoRecarga: o.progreso ?? 0,
      utilidad: o.util || 'petardo', cdUtil: o.cd ?? 0, cdUtilTotal: 12,
    },
  };
  if (tipo === 'aguja') j.arsenal.ranuras = ['aguja', 'chispa', 'filo'];
  return { jugador: j, espectando: o.espectando, marcador: o.marcador || [2, 1], ronda: o.ronda ?? 4, tiempo: o.tiempo ?? 73, rondasParaGanar: 5, fase: 'combate', combatientes: cs, online: false };
}
const FEED = [
  { a: 'Hana', v: 'Rayo', arma: 'vector', cabeza: true, aAliado: true, vAliado: false, yo: true },
  { a: 'SoraSoraSoraSo', v: 'Mika con nombre', arma: 'aguja', cabeza: false, aAliado: false, vAliado: true },
  { a: 'Kenji', v: 'Taro', arma: 'filo', cabeza: false, aAliado: true, vAliado: false },
  { a: null, v: 'Taro', arma: 'petardo', cabeza: false, aAliado: false, vAliado: false },
];

let juego;
function partida(o = {}) {
  ui.menu();
  ui.empezarPartida(juego);
  ui.guia(false);
  ui.el.guia.hidden = true;
  juego = juegoFalso(o);
  ui.ronda(juego.ronda, juego.marcador);
  ui.el.rondaBanner.className = 'ronda-banner';
  ui.el.cuenta.textContent = '';
  ui.feed(o.feed === false ? [] : FEED);
  ui.hud(juego, !!o.apunta);
  ui.tabla(null);
  return juego;
}
const detener = () => { ui.el.hud.hidden = false; };

window.demo = {
  ui, cambios,
  menu() { ui.menu(); },
  equipoAbierto(ranura = 'principal', modal = false) {
    ui.ranuraAbierta = ranura; ui.renderEquipo();
    if (modal) { partida(); ui.pausa(true, false); ui.equipo(true); } else ui.menu();
  },
  hud(o = {}) { partida(o); detener(); },
  impactos() { ui.impacto(22, false, false); ui.impacto(24, true, false); ui.impacto(30, false, false); ui.recibirDano(0.6); ui.recibirDano(-1.8); ui.baja({ victima: 'Rayo', cabeza: true, multi: 2 }); },
  cuenta(n = 3) { partida({ feed: false }); ui.cuentaAtras(n); },
  ronda() { partida({ feed: false, marcador: [2, 1], ronda: 4 }); ui.ronda(4, [2, 1]); },
  finRonda(gana = true) { partida({ vivos: [1, 1, 0, 0, 0, 0] }); ui.finRonda({ gana, marcador: gana === false ? [2, 3] : [3, 2], motivo: 'eliminacion' }); },
  muerto() { partida({ vida: 0, vivo: false, vivos: [0, 1, 0, 1, 1, 0] }); ui.muerto({ nombre: 'SoraSoraSoraSo', vida: 38, armaNombre: 'Aguja' }); },
  espectando() {
    const j = partida({ vida: 0, vivo: false, vivos: [0, 1, 1, 1, 1, 0] });
    const amigo = juegoFalso({ vida: 55, arma: 'chispa' }).jugador;
    j.espectando = amigo; ui.hud(j, false); ui.espectar('Kenji');
  },
  tabla() { const j = partida(); ui.tabla(j); },
  pausa(online = false) { partida(); ui.pausa(true, online); },
  ajustes() { ui.menu(); ui.ajustes(true, 'menu'); },
  fin(gano = true) {
    ui.finPartida({ gano, marcador: gano ? [5, 3] : [2, 5], jugadores: combatientes().map((c) => ({ ...c, yo: !!c.yo })), resumen: { partidas: 25, victorias: 14, bajas: 215, muertes: 162 }, online: false });
  },
  conectando() { ui.conectando('K7QX2'); },
  error() { ui.errorRed('No se ha podido conectar con la sala. Revisa tu conexión o juega contra bots.'); },
  guia() { partida(); ui.guia(true); },
  tactil(si = true) { ui.marcarTactil(si); ui.el.tactil.hidden = !si; },
  carga() { const c = document.getElementById('carga'); c.classList.add('demo-carga'); c.hidden = false; },
  toast(m = 'Enlace copiado') { ui.toast(m); },
  estadoRed() { ui.estadoRed('conectado', 'K7QX2', 3); ui.fps(60, 'conectado'); },
  francotirador() { partida({ arma: 'aguja', apunta: true, municion: 5 }); },
  recargando() { partida({ recargando: 1, progreso: 0.55, municion: 0 }); },
  melee() { partida({ arma: 'filo', vel: 9 }); },
  critico() { partida({ vida: 18, escudo: 30, municion: 6, cd: 7.4, apunta: false, vel: 9 }); },
};
document.body.dataset.listo = '1';
