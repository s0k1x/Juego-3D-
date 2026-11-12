// Interfaz DOM: menú, HUD, avisos y pantallas. Solo escribe en el DOM cuando un valor cambia.
import { ARMAS, PRIMARIAS } from './armas.js';

const $ = (id) => document.getElementById(id);

export class Interfaz {
  constructor() {
    this.c = {};
    this.p = { menu: $('pMenu'), pausa: $('pPausa'), ajustes: $('pAjustes'), fin: $('pFin') };
    this.tactil = matchMedia('(pointer: coarse)').matches;
    this.el = {
      hud: $('hud'), tactil: $('tactil'), tiempo: $('tiempo'), pipsYo: $('pipsYo'), pipsRival: $('pipsRival'),
      nombreRival: $('nombreRival'), vidaNum: $('vidaNum'), vidaBarra: $('vidaBarra'), vidaFantasma: $('vidaFantasma'),
      municion: $('municion'), cargador: $('cargador'), armaNombre: $('armaNombre'), ranuras: $('ranuras'),
      cruz: $('cruz'), marca: $('marca'), direccion: $('direccion'), numeros: $('numeros'), aviso: $('aviso'),
      cuenta: $('cuenta'), lineas: $('lineas'), miraFranco: $('miraFranco'), danoBorde: $('danoBorde'),
    };
    this._ayuda();
  }

  marcarTactil(si) {
    this.tactil = si;
    document.body.classList.toggle('es-tactil', si);
    this._ayuda();
  }

  _ayuda() {
    const filas = this.tactil
      ? [['Pulgar izquierdo', 'moverte (al fondo, correr)'], ['Pulgar derecho', 'mirar'], ['Botón rosa', 'disparar y mirar a la vez']]
      : [['W A S D', 'moverte'], ['Ratón', 'mirar; clic para disparar, clic derecho para apuntar'], ['Mayús', 'correr'], ['C', 'deslizarte corriendo, agacharte parado'], ['Espacio', 'saltar (dos veces en el aire)'], ['1 a 4, rueda', 'cambiar de arma'], ['G', 'lanzar granada'], ['R', 'recargar'], ['V', 'cambiar de cámara']];
    $('ayuda').innerHTML = filas.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
  }

  // ---------- Menú ----------
  construirMenu(ajustes, alCambiar) {
    const cont = $('armas');
    cont.innerHTML = PRIMARIAS.map((k) => {
      const a = ARMAS[k];
      const s = a.stats;
      return `<button type="button" class="arma-carta" role="radio" data-v="${k}">
        <b>${a.nombre}</b><small>${a.desc}</small>
        <span class="barras"><span>Daño <i style="--n:${s.dano}"></i></span><span>Alcance <i style="--n:${s.alcance}"></i></span><span>Cadencia <i style="--n:${s.cadencia}"></i></span></span>
      </button>`;
    }).join('');
    const grupo = (el, clave) => {
      const marcar = (v) => el.querySelectorAll('[data-v]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === v)));
      marcar(ajustes[clave]);
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-v]');
        if (!b) return;
        marcar(b.dataset.v);
        alCambiar(clave, b.dataset.v);
      });
    };
    grupo(cont, 'primaria');
    grupo($('dificultad'), 'dificultad');
    grupo($('ajCam'), 'camara');
    grupo($('ajCal'), 'calidad');
    for (const [id, clave, fmt] of [['ajSens', 'sensibilidad', (v) => v.toFixed(2)], ['ajVol', 'volumen', (v) => Math.round(v * 100) + '%']]) {
      const inp = $(id), out = $(id + 'V');
      inp.value = ajustes[clave];
      out.textContent = fmt(+inp.value);
      inp.addEventListener('input', () => { out.textContent = fmt(+inp.value); alCambiar(clave, +inp.value); });
    }
  }

  stats(s) {
    $('statsMenu').textContent = s.partidas
      ? `Has ganado ${s.victorias} de ${s.partidas} duelos. Mejor racha: ${s.mejorRacha}.`
      : 'Tu primer duelo te espera.';
  }

  mostrar(nombre) {
    for (const k in this.p) this.p[k].hidden = k !== nombre;
  }

  menu() {
    this.mostrar('menu');
    this.el.hud.hidden = true;
    this.el.tactil.hidden = true;
    this.el.lineas.classList.remove('ver');
    this.el.miraFranco.hidden = true;
  }

  ajustes(abrir, volverA) {
    this._volver = volverA;
    if (abrir) this.mostrar('ajustes');
    else this.mostrar(this._volver);
  }

  pausa(si) {
    this.mostrar(si ? 'pausa' : null);
    this.el.tactil.hidden = si || !this.tactil;
  }

  empezarPartida(juego) {
    this.mostrar(null);
    this.c = {};
    this.el.hud.hidden = false;
    this.el.tactil.hidden = !this.tactil;
    this.el.nombreRival.textContent = juego.rival.nombre;
  }

  ronda(n, marcador) {
    this._pips(marcador);
    this.aviso(`Ronda ${n}`, '', 'empate');
  }

  _pips(m) {
    const p = (n) => Array.from({ length: 5 }, (_, i) => `<i class="${i < n ? 'lleno' : ''}"></i>`).join('');
    this.el.pipsYo.innerHTML = p(m[0]);
    this.el.pipsRival.innerHTML = p(m[1]);
  }

  cuentaAtras(n) {
    if (this.c.cuenta === n) return;
    this.c.cuenta = n;
    const el = this.el.cuenta;
    el.className = 'cuenta';
    if (n > 0) el.textContent = n;
    else { el.textContent = '¡Ya!'; void el.offsetWidth; el.classList.add('ya'); }
  }

  banner(ganador, porTiempo, marcador, fin) {
    this._pips(marcador);
    const sub = porTiempo ? 'Se acabó el tiempo: gana quien conserva más vida.' : fin ? 'Fin del duelo' : '';
    if (ganador === 0) this.aviso(fin ? '¡Duelo ganado!' : '¡Ronda para ti!', sub, 'gana');
    else if (ganador === 1) this.aviso(fin ? 'Duelo perdido' : 'Ronda perdida', sub, 'pierde');
    else this.aviso('Empate', 'Nadie suma la ronda.', 'empate');
  }

  ocultarBanner() {}

  aviso(texto, sub, clase) {
    const a = this.el.aviso;
    a.innerHTML = `<b>${texto}</b>${sub ? `<small>${sub}</small>` : ''}`;
    a.className = 'aviso ' + clase;
    void a.offsetWidth;
    a.classList.add('ver');
  }

  impacto(dano, cabeza, muere) {
    const m = this.el.marca;
    m.className = 'marca' + (cabeza ? ' cabeza' : '');
    void m.offsetWidth;
    m.classList.add('ver');
    const n = document.createElement('span');
    n.textContent = muere ? (cabeza ? '¡Crítico!' : '¡Abatido!') : cabeza ? `${dano}!` : dano;
    if (cabeza) n.className = 'cabeza';
    n.style.marginLeft = `${(Math.random() - 0.5) * 30}px`;
    this.el.numeros.appendChild(n);
    setTimeout(() => n.remove(), 700);
    if (this.el.numeros.childElementCount > 8) this.el.numeros.firstChild.remove();
  }

  recibirDano(angRel) {
    const d = this.el.direccion;
    d.style.transform = `rotate(${-angRel}rad)`;
    d.classList.remove('ver'); void d.offsetWidth; d.classList.add('ver');
    setTimeout(() => d.classList.remove('ver'), 60);
    const b = this.el.danoBorde;
    b.classList.add('ver');
    clearTimeout(this._tb);
    this._tb = setTimeout(() => b.classList.remove('ver'), 120);
  }

  _set(clave, valor, fn) { if (this.c[clave] !== valor) { this.c[clave] = valor; fn(valor); } }

  hud(juego, apunta) {
    const j = juego.jugador, ars = j.arsenal, a = ars.arma, e = this.el;
    this._set('vida', Math.ceil(j.vida), (v) => {
      e.vidaNum.textContent = v;
      e.vidaBarra.style.transform = `scaleX(${v / 100})`;
      e.vidaFantasma.style.transform = `scaleX(${v / 100})`;
      e.vidaNum.parentElement.classList.toggle('baja', v <= 30);
    });
    const t = Math.max(0, Math.ceil(juego.tiempo ?? 0));
    this._set('tiempo', t, (v) => {
      e.tiempo.textContent = `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
      e.tiempo.classList.toggle('urgente', v <= 10);
    });
    const mun = a.cargador ? ars.municion[ars.tipo] : a.lanzable ? ars.granadas : '∞';
    this._set('mun', `${mun}|${ars.recargando > 0}`, () => {
      e.municion.textContent = ars.recargando > 0 ? '…' : mun;
      e.cargador.textContent = a.cargador ? `/ ${a.cargador}` : '';
      e.municion.parentElement.classList.toggle('vacia', mun === 0);
    });
    this._set('arma', ars.tipo, () => {
      e.armaNombre.textContent = a.nombre;
      e.cruz.classList.toggle('katana', !!(a.cuerpo || a.lanzable));
    });
    this._set('ranuras', `${ars.indice}|${ars.granadas}|${ars.ranuras[0]}`, () => {
      const corto = { rifle: 'Rifle', escopeta: 'Escop.', franco: 'Franco', pistola: 'Pistola', katana: 'Katana', granada: 'Granada' };
      e.ranuras.innerHTML = ars.ranuras.map((k, i) => `<li class="${i === ars.indice ? 'activa' : ''}${k === 'granada' && ars.granadas <= 0 ? ' gastada' : ''}">${i + 1} ${corto[k]}</li>`).join('');
    });
    // Mira: se abre con la dispersión del arma y el movimiento.
    const vel = Math.hypot(j.vel.x, j.vel.z);
    const disp = (a.disp ?? 0) + (vel / 7.6) * (a.dispMov ?? 0) + (j.suelo ? 0 : 0.03) + (a.mira && !apunta ? a.dispCadera : 0);
    this._set('cruz', Math.round((4 + disp * 380) * (apunta && !a.mira ? 0.6 : 1)), (v) => e.cruz.style.setProperty('--s', v + 'px'));
    const franco = apunta && !!a.mira;
    this._set('franco', franco, (v) => { e.miraFranco.hidden = !v; e.cruz.hidden = v; });
    this._set('lineas', (vel > 7.2 || j.deslizando > 0) && juego.fase === 'combate', (v) => e.lineas.classList.toggle('ver', v));
  }

  finPartida({ gano, marcador, stats, rival, resumen }) {
    this.el.hud.hidden = true;
    this.el.tactil.hidden = true;
    this.el.lineas.classList.remove('ver');
    this.el.miraFranco.hidden = true;
    this.mostrar('fin');
    const caja = this.p.fin.querySelector('.caja');
    caja.classList.toggle('gana', gano);
    $('finTitulo').textContent = gano ? '¡Victoria!' : 'Derrota';
    $('finMarcador').textContent = `Tú ${marcador[0]} – ${marcador[1]} ${rival}`;
    const prec = stats.disparos ? Math.round((stats.aciertos / stats.disparos) * 100) : 0;
    $('finStats').innerHTML = [['Precisión', prec + '%'], ['A la cabeza', stats.cabezas], ['Daño', Math.round(stats.dano)]]
      .map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('');
    $('finRacha').textContent = resumen.racha > 1 ? `Llevas ${resumen.racha} victorias seguidas.` : `Has ganado ${resumen.victorias} de ${resumen.partidas} duelos.`;
    this.stats(resumen);
  }
}
