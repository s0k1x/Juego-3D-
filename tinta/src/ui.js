// Interfaz en DOM: HUD, pantallas y textos. Solo toca el DOM cuando cambia un valor.
import { PODERES } from './player.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.floor(n).toLocaleString('es-ES', { useGrouping: 'always' });

export class Interfaz {
  constructor() {
    this.hud = $('hud');
    this.pantallas = { inicio: $('pInicio'), pausa: $('pPausa'), fin: $('pFin') };
    this.cache = {};
    this.el = {
      vida: $('vida'), poderes: $('poderes'), oleada: $('oleada'), puntos: $('puntos'),
      jefe: $('jefe'), jefeBarra: $('jefeBarra'), aviso: $('aviso'),
    };
  }

  mostrar(nombre) {
    for (const k in this.pantallas) this.pantallas[k].hidden = k !== nombre;
    this.hud.hidden = nombre === 'inicio' || nombre === 'fin';
    const btn = this.pantallas[nombre]?.querySelector('.btn');
    // En pausa y fin, el botón principal queda listo para Intro; en el inicio no, para no mostrar el foco al cargar.
    // Nunca robamos el foco a la web que nos contiene; en el fin esperamos un poco
    // para que una tecla que siga pulsada no reinicie la partida sola.
    if (btn && nombre !== 'inicio' && !matchMedia('(pointer: coarse)').matches) {
      const enfocar = () => { if (document.hasFocus() && !btn.closest('[hidden]')) btn.focus({ preventScroll: true }); };
      if (nombre === 'fin') setTimeout(enfocar, 600); else enfocar();
    }
  }

  controles(modo) {
    const filas = modo === 'touch'
      ? [['Pulgar izquierdo', 'moverte'], ['Pulgar derecho', 'apuntar y disparar'], ['Botón superior', 'pausa']]
      : [['W A S D', 'moverte'], ['Ratón', 'apuntar; mantén el clic para disparar'], ['P o Esc', 'pausa']];
    $('controles').innerHTML = filas.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
  }

  sonido(silenciado) {
    const txt = silenciado ? 'Activar sonido' : 'Silenciar';
    $('btnSonidoInicio').textContent = txt;
    $('btnSonidoPausa').textContent = txt;
  }

  record(r) {
    $('recordInicio').innerHTML = r.puntos > 0
      ? `Tu récord: <b>${fmt(r.puntos)}</b> puntos, oleada ${r.oleada}`
      : 'Aún no tienes récord. Esta es tu primera tirada.';
  }

  fin({ puntos, oleada, record, nuevo }) {
    $('finPuntos').textContent = fmt(puntos);
    $('finOleada').textContent = oleada;
    $('finRecord').hidden = !nuevo;
    $('finMejor').innerHTML = nuevo ? '' : `Tu récord: <b>${fmt(record.puntos)}</b>`;
  }

  _set(clave, valor, fn) {
    if (this.cache[clave] === valor) return;
    this.cache[clave] = valor;
    fn(valor);
  }

  resetHud() { this.cache = {}; this.el.aviso.className = 'aviso'; }

  actualizarHud(j, juego) {
    this._set('vida', `${j.vida}/${j.maxVida}`, () => {
      const prev = this.cache.vidaNum ?? j.vida;
      let html = '';
      for (let i = 0; i < j.maxVida; i++) {
        const golpe = i >= j.vida && i < prev ? ' golpe' : '';
        html += `<i class="${i < j.vida ? '' : 'vacia'}${golpe}"></i>`;
      }
      this.el.vida.innerHTML = html;
      this.cache.vidaNum = j.vida;
    });
    this._set('oleada', juego.oleada, (v) => { this.el.oleada.textContent = v; });
    const m = Math.floor(juego.combo);
    const combo = m > 1 ? `  ×${m}` : '';
    this._set('puntos', fmt(juego.puntos) + combo, (v) => { this.el.puntos.textContent = v; });

    // Poderes activos con su barra de tiempo (redondeada para no tocar el DOM cada fotograma).
    let clave = '';
    for (const k in j.poderes) if (j.poderes[k] > 0) clave += k + Math.ceil(j.poderes[k] * 4) + (k === 'escudo' ? j.cargasEscudo : '');
    this._set('poderes', clave, () => {
      let html = '';
      for (const k in j.poderes) {
        const t = j.poderes[k];
        if (t <= 0) continue;
        const p = Math.round((t / PODERES[k].dur) * 100);
        html += `<span class="poder" title="${PODERES[k].nombre}"><b>${PODERES[k].letra}</b><s style="--p:${p}%"></s></span>`;
      }
      this.el.poderes.innerHTML = html;
    });

    const jefe = juego.enemigos.jefe;
    const vivo = !!(jefe && jefe.activo && jefe.tipo === 'prensa');
    this._set('jefeVisible', vivo, (v) => { this.el.jefe.hidden = !v; });
    if (vivo) this._set('jefeVida', Math.ceil((jefe.vida / jefe.vidaMax) * 100), (v) => { this.el.jefeBarra.style.transform = `scaleX(${v / 100})`; });
  }

  aviso(texto, sub = '') {
    const a = this.el.aviso;
    a.innerHTML = texto + (sub ? `<small>${sub}</small>` : '');
    a.classList.remove('ver');
    void a.offsetWidth; // reinicia la animación
    a.classList.add('ver');
  }
}
