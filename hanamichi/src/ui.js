// Interfaz DOM: menú, HUD, avisos y pantallas. Solo escribe en el DOM cuando un valor cambia.
import { ARMAS } from './armas.js';
import { HEROES, LISTA_HEROES, CARGA_DEFINITIVA } from './heroes.js';
import { LIMITE_BAJAS } from './juego.js';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICONO_ARMA = { rifle: '⟶', escopeta: '⁂', franco: '⌖', subfusil: '≫', pistola: '›', katana: '刀', granada: '✹', rayo: 'ϟ', juicio: 'ϟϟ', trueno: 'ϟ', ventisca: '❄', bola: '●', meteoro: '☄', impulso: '▲', arma: '✕' };

export class Interfaz {
  constructor() {
    this.c = {};
    this.p = { menu: $('pMenu'), pausa: $('pPausa'), ajustes: $('pAjustes'), fin: $('pFin'), conectando: $('pConectando') };
    this.tactil = matchMedia('(pointer: coarse)').matches;
    this.el = {
      hud: $('hud'), tactil: $('tactil'), tiempo: $('tiempo'), meta: $('meta'), misBajas: $('misBajas'),
      liderBajas: $('liderBajas'), liderNombre: $('liderNombre'), redChip: $('redChip'), feed: $('feed'),
      vidaNum: $('vidaNum'), vidaBarra: $('vidaBarra'), vidaFantasma: $('vidaFantasma'), escudoBarra: $('escudoBarra'), vidaHeroe: $('vidaHeroe'),
      municion: $('municion'), cargador: $('cargador'), armaNombre: $('armaNombre'), ranuras: $('ranuras'),
      cruz: $('cruz'), marca: $('marca'), direccion: $('direccion'), numeros: $('numeros'), aviso: $('aviso'), anuncio: $('anuncio'),
      cuenta: $('cuenta'), lineas: $('lineas'), miraFranco: $('miraFranco'), danoBorde: $('danoBorde'), bordeEstado: $('bordeEstado'),
      muerto: $('muerto'), muertoNombre: $('muertoNombre'), muertoHeroe: $('muertoHeroe'), muertoCuenta: $('muertoCuenta'),
      tabla: $('tabla'), tablaCuerpo: $('tablaCuerpo'), toast: $('toast'),
    };
    this.poderesEl = {};
    for (const d of document.querySelectorAll('#poderes .poder')) this.poderesEl[d.dataset.k] = d;
    this._ayuda();
  }

  marcarTactil(si) {
    this.tactil = si;
    document.body.classList.toggle('es-tactil', si);
    this._ayuda();
  }

  _ayuda() {
    const filas = this.tactil
      ? [['Pulgar izquierdo', 'moverte (al fondo, correr)'], ['Pulgar derecho', 'mirar'], ['Botón rosa', 'disparar y mirar a la vez'], ['Q · E · X', 'habilidad, poder y definitiva']]
      : [['W A S D', 'moverte (corres al ir hacia delante)'], ['Ratón', 'mirar; clic dispara, clic derecho apunta'], ['Q', 'habilidad'], ['E', 'poder'], ['X o F', 'definitiva (cuando está cargada)'],
        ['Espacio', 'saltar (dos veces en el aire)'], ['C o Ctrl', 'deslizarte corriendo, agacharte parado'], ['1 a 4, rueda', 'cambiar de arma'], ['G', 'granada'], ['R', 'recargar'], ['Tab', 'marcador'], ['Esc', 'pausa']];
    const html = filas.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
    $('ayuda').innerHTML = html;
    $('ayudaAjustes').innerHTML = html;
  }

  // ---------- Menú ----------
  construirMenu(ajustes, alCambiar) {
    const carta = (k, mini) => {
      const h = HEROES[k];
      return `<button type="button" class="heroe-carta" role="radio" data-v="${k}" style="--c:${h.color}">
        <b>${h.nombre}</b>${mini ? '' : `<small>${h.rol}</small><span class="h-arma">${ARMAS[h.arma].nombre}</span>`}
      </button>`;
    };
    $('heroes').innerHTML = LISTA_HEROES.map((k) => carta(k, false)).join('');
    $('heroesPausa').innerHTML = LISTA_HEROES.map((k) => carta(k, true)).join('');
    const info = (k) => {
      const h = HEROES[k];
      $('heroeInfo').innerHTML = ['q', 'e', 'x'].map((r) => `<div class="hi-fila"><kbd>${r.toUpperCase()}</kbd><div><b>${h[r].nombre}</b><span>${h[r].desc}</span></div></div>`).join('');
      $('heroeInfo').style.setProperty('--c', h.color);
    };
    info(ajustes.heroe);
    const grupo = (el, clave, extra) => {
      const marcar = (v) => el.querySelectorAll('[data-v]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === v)));
      marcar(ajustes[clave]);
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-v]');
        if (!b) return;
        marcar(b.dataset.v);
        alCambiar(clave, b.dataset.v);
        extra?.(b.dataset.v);
      });
      return marcar;
    };
    const m1 = grupo($('heroes'), 'heroe', (v) => { info(v); m2(v); });
    const m2 = grupo($('heroesPausa'), 'heroe', (v) => { info(v); m1(v); });
    grupo($('dificultad'), 'dificultad');
    grupo($('ajCal'), 'calidad');
    const correr = $('ajCorrer');
    const marcarCorrer = (v) => correr.querySelectorAll('[data-v]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === (v ? 'si' : 'no'))));
    marcarCorrer(ajustes.correr);
    correr.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; marcarCorrer(b.dataset.v === 'si'); alCambiar('correr', b.dataset.v === 'si'); });
    for (const [id, clave, fmt] of [['ajSens', 'sensibilidad', (v) => v.toFixed(2)], ['ajVol', 'volumen', (v) => Math.round(v * 100) + '%'], ['ajFov', 'fov', (v) => v + '°']]) {
      const inp = $(id), out = $(id + 'V');
      inp.value = ajustes[clave];
      out.textContent = fmt(+inp.value);
      inp.addEventListener('input', () => { out.textContent = fmt(+inp.value); alCambiar(clave, +inp.value); });
    }
    const nombre = $('nombre');
    nombre.value = ajustes.nombre || '';
    nombre.addEventListener('input', () => alCambiar('nombre', nombre.value.trim().slice(0, 14)));
    nombre.addEventListener('keydown', (e) => e.stopPropagation());
    $('codigoSala').addEventListener('keydown', (e) => e.stopPropagation());
  }

  stats(s) {
    $('statsMenu').textContent = s.partidas
      ? `${s.victorias} victorias en ${s.partidas} partidas · ${s.bajas} bajas · récord ${s.mejorPartida}`
      : 'Tu primera partida te espera.';
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
    this.el.bordeEstado.className = 'borde-estado';
  }

  ajustes(abrir, volverA) {
    if (abrir) { this._volver = volverA; this.mostrar('ajustes'); }
    else this.mostrar(this._volver);
  }

  pausa(si, online) {
    this.mostrar(si ? 'pausa' : null);
    $('pausaNota').hidden = !online;
    $('btnInvitar').hidden = !online;
    this.el.tactil.hidden = si || !this.tactil;
  }

  conectando(sala) {
    this.mostrar('conectando');
    $('conTitulo').textContent = 'Conectando…';
    $('conTexto').textContent = `Entrando en la sala ${sala}.`;
  }

  errorRed(msg) {
    this.mostrar('conectando');
    $('conTitulo').textContent = 'Sin conexión';
    $('conTexto').textContent = msg;
  }

  estadoRed(estado, sala, pares) {
    const chip = this.el.redChip;
    if (estado === 'desconectado' || !sala) { chip.hidden = true; return; }
    chip.hidden = false;
    const txt = { conectando: 'Conectando…', conectado: 'Online', reconectando: 'Reconectando…', caido: 'Sin conexión' }[estado] || estado;
    chip.className = 'red-chip ' + estado;
    chip.textContent = `${txt} · sala ${sala} · ${pares + 1} jugador${pares ? 'es' : ''}`;
  }

  toast(msg) {
    const t = this.el.toast;
    t.textContent = msg; t.hidden = false;
    clearTimeout(this._tt);
    this._tt = setTimeout(() => { t.hidden = true; }, 2200);
  }

  empezarPartida() {
    this.mostrar(null);
    this.c = {};
    this.el.hud.hidden = false;
    this.el.tactil.hidden = !this.tactil;
    this.el.muerto.hidden = true;
    this.el.meta.textContent = `Primero a ${LIMITE_BAJAS}`;
  }

  nuevaPartida() {
    this.feed([]);
    this.aviso('Todos contra todos', `Primero a ${LIMITE_BAJAS} bajas`, 'empate');
  }

  cuentaAtras(n) {
    if (this.c.cuenta === n) return;
    this.c.cuenta = n;
    const el = this.el.cuenta;
    el.className = 'cuenta';
    if (n > 0) el.textContent = n;
    else { el.textContent = '¡A luchar!'; void el.offsetWidth; el.classList.add('ya'); }
  }

  aviso(texto, sub, clase) {
    const a = this.el.aviso;
    a.innerHTML = `<b>${esc(texto)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}`;
    a.className = 'aviso ' + clase;
    void a.offsetWidth;
    a.classList.add('ver');
  }

  impacto(dano, cabeza, letal) {
    const m = this.el.marca;
    m.className = 'marca' + (cabeza ? ' cabeza' : '') + (letal ? ' letal' : '');
    void m.offsetWidth;
    m.classList.add('ver');
    const n = document.createElement('span');
    n.textContent = cabeza ? `${dano}!` : dano;
    if (cabeza) n.className = 'cabeza';
    n.style.marginLeft = `${(Math.random() - 0.5) * 40}px`;
    this.el.numeros.appendChild(n);
    setTimeout(() => n.remove(), 700);
    if (this.el.numeros.childElementCount > 10) this.el.numeros.firstChild.remove();
  }

  baja(nombre, cabeza, multi, racha) {
    const textos = { 2: 'Doble baja', 3: 'Triple baja', 4: 'Cuádruple', 5: '¡Masacre!' };
    const rachas = { 3: 'En racha', 5: 'Imparable', 8: 'Leyenda', 12: 'Divino' };
    const a = this.el.anuncio;
    const titulo = textos[Math.min(5, multi)] || (cabeza ? '¡Crítico!' : 'Abatido');
    const extra = rachas[racha] ? ` · ${rachas[racha]}` : '';
    a.innerHTML = `<b>${titulo}</b><small>${esc(nombre ?? '')}${extra}</small>`;
    a.className = 'anuncio' + (multi > 1 || rachas[racha] ? ' grande' : '');
    void a.offsetWidth;
    a.classList.add('ver');
  }

  muerto(asesino, segundos) {
    this.el.muerto.hidden = false;
    this.el.muertoNombre.textContent = asesino ? asesino.nombre : 'Te has eliminado tú';
    this.el.muertoHeroe.textContent = asesino ? `${asesino.H.nombre} · le quedan ${Math.max(0, Math.ceil(asesino.vida))} de vida` : '';
    this.el.muertoHeroe.style.color = asesino ? asesino.H.color : '';
    this.el.muertoCuenta.textContent = `Reapareces en ${segundos}`;
  }

  reaparecer() { this.el.muerto.hidden = true; }

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

  poderUsado(k) {
    const el = this.poderesEl[k];
    el.classList.remove('usado'); void el.offsetWidth; el.classList.add('usado');
  }

  poderNoListo(k) {
    const el = this.poderesEl[k];
    el.classList.remove('no'); void el.offsetWidth; el.classList.add('no');
  }

  feed(lista) {
    this.el.feed.innerHTML = lista.map((f) => `<li class="${f.yo ? 'yo' : ''}">
      ${f.a && f.a !== f.v ? `<b style="color:${HEROES[f.ah]?.color ?? '#fff'}">${esc(f.a)}</b>` : ''}
      <i>${ICONO_ARMA[f.w] ?? '✕'}${f.cabeza ? '<em>◉</em>' : ''}</i>
      <b style="color:${HEROES[f.vh]?.color ?? '#fff'}">${esc(f.v)}</b></li>`).join('');
  }

  tabla(juego) {
    const ver = !!juego;
    if (this.el.tabla.hidden === !ver && !ver) return;
    this.el.tabla.hidden = !ver;
    if (!ver) return;
    const r = juego.ranking();
    const clave = r.map((c) => `${c.id}${c.bajas}${c.muertes}${c.heroe}`).join('|');
    if (this.c.tabla === clave) return;
    this.c.tabla = clave;
    this.el.tablaCuerpo.innerHTML = r.map((c, i) => `<tr class="${c === juego.jugador ? 'yo' : ''}">
      <td>${i + 1}</td><td>${esc(c.nombre)}</td><td style="color:${c.H.color}">${c.H.nombre}</td><td>${c.bajas}</td><td>${c.muertes}</td></tr>`).join('');
  }

  _botonTactil(k, listo, texto) {
    const b = this.el.tactil.querySelector('.t-' + k);
    if (!b) return;
    b.textContent = texto;
    b.classList.toggle('listo', listo);
    b.classList.toggle('espera', !listo);
  }

  _set(clave, valor, fn) { if (this.c[clave] !== valor) { this.c[clave] = valor; fn(valor); } }

  hud(juego, apunta) {
    const j = juego.jugador, ars = j.arsenal, a = ars.arma, e = this.el, H = j.H;
    this._set('vida', Math.ceil(j.vida), (v) => {
      e.vidaNum.textContent = v;
      e.vidaBarra.style.transform = `scaleX(${v / 100})`;
      e.vidaFantasma.style.transform = `scaleX(${v / 100})`;
      e.vidaNum.closest('.vida').classList.toggle('baja', v <= 30);
    });
    this._set('escudo', Math.ceil(j.escudo), (v) => { e.escudoBarra.style.transform = `scaleX(${v / 60})`; e.escudoBarra.parentElement.classList.toggle('ver', v > 0); });
    this._set('heroe', j.heroe, () => {
      e.vidaHeroe.textContent = `${H.nombre} · ${H.rol}`;
      e.hud.parentElement.style.setProperty('--c', H.color);
      for (const k of ['q', 'e', 'x']) this.poderesEl[k].querySelector('.p-nombre').textContent = H[k].nombre;
    });
    // Poderes: enfriamiento en segundos y la definitiva en porcentaje.
    const cd = { q: [j.cdQ, H.q.cd], e: [j.cdE, H.e.cd] };
    for (const k of ['q', 'e']) {
      const [t, total] = cd[k];
      this._set('cd' + k, Math.ceil(t * 10), () => {
        const el = this.poderesEl[k];
        el.style.setProperty('--p', String(1 - t / total));
        el.classList.toggle('listo', t <= 0);
        el.querySelector('.p-cd').textContent = t > 0 ? Math.ceil(t) : '';
        this._botonTactil(k, t <= 0, t > 0 ? Math.ceil(t) : k.toUpperCase());
      });
    }
    this._set('carga', Math.floor(j.carga), (v) => {
      const el = this.poderesEl.x;
      el.style.setProperty('--p', String(v / CARGA_DEFINITIVA));
      const listo = v >= CARGA_DEFINITIVA;
      if (listo && !el.classList.contains('listo')) juego.audio.listoPoder();
      el.classList.toggle('listo', listo);
      el.querySelector('.p-cd').textContent = listo ? '¡Lista!' : v + '%';
      this._botonTactil('x', listo, listo ? 'X' : v + '%');
    });
    const t = Math.max(0, Math.ceil(juego.tiempo ?? 0));
    this._set('tiempo', t, (v) => {
      e.tiempo.textContent = `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
      e.tiempo.classList.toggle('urgente', v <= 30);
    });
    // Marcador: tus bajas y las del líder (o del segundo si vas primero).
    const r = juego.ranking();
    const otro = r[0] === j ? r[1] : r[0];
    this._set('marc', `${j.bajas}|${otro?.id}|${otro?.bajas}`, () => {
      e.misBajas.textContent = j.bajas;
      e.liderBajas.textContent = otro ? otro.bajas : 0;
      e.liderNombre.textContent = otro ? (r[0] === j ? `2.º ${otro.nombre}` : otro.nombre) : '—';
      e.misBajas.parentElement.classList.toggle('primero', r[0] === j && j.bajas > 0);
    });
    const mun = a.cargador ? ars.municion[ars.tipo] : a.lanzable ? ars.granadas : '∞';
    this._set('mun', `${mun}|${ars.recargando > 0}`, () => {
      e.municion.textContent = ars.recargando > 0 ? '…' : mun;
      e.cargador.textContent = a.cargador ? `/ ${a.cargador}` : '';
      e.municion.parentElement.classList.toggle('vacia', mun === 0);
      e.municion.parentElement.classList.toggle('poca', typeof mun === 'number' && a.cargador && mun > 0 && mun <= a.cargador * 0.25);
    });
    this._set('arma', ars.tipo, () => {
      e.armaNombre.textContent = a.nombre;
      e.cruz.classList.toggle('katana', !!(a.cuerpo || a.lanzable));
    });
    this._set('ranuras', `${ars.indice}|${ars.granadas}|${ars.ranuras[0]}`, () => {
      e.ranuras.innerHTML = ars.ranuras.map((k, i) => `<li class="${i === ars.indice ? 'activa' : ''}${k === 'granada' && ars.granadas <= 0 ? ' gastada' : ''}">${i + 1} ${ARMAS[k].corto}${k === 'granada' ? ` ×${ars.granadas}` : ''}</li>`).join('');
    });
    const vel = Math.hypot(j.vel.x, j.vel.z);
    const disp = (a.disp ?? 0) + (vel / 8) * (a.dispMov ?? 0) + (j.suelo ? 0 : 0.025) + (a.mira && !apunta ? a.dispCadera : 0);
    this._set('cruz', Math.round((3 + disp * 380) * (apunta && !a.mira ? 0.55 : 1)), (v) => e.cruz.style.setProperty('--s', v + 'px'));
    const franco = apunta && !!a.mira;
    this._set('franco', franco, (v) => { e.miraFranco.hidden = !v; e.cruz.hidden = v; });
    this._set('lineas', (vel > 8.5 || j.deslizando > 0) && juego.fase === 'combate', (v) => e.lineas.classList.toggle('ver', v));
    const estado = !j.vivo ? 'muerto' : j.ult > 0 ? 'ult' : j.escudo > 0 ? 'escudo' : j.lento > 0 ? 'lento' : j.curando > 0 ? 'cura' : j.protegido > 0 ? 'protegido' : '';
    this._set('estado', estado, (v) => { e.bordeEstado.className = 'borde-estado ' + v; });
    if (!j.vivo) this._set('cuentaMuerto', Math.max(0, Math.ceil(3 - j.tMuerte)), (v) => { e.muertoCuenta.textContent = v > 0 ? `Reapareces en ${v}` : 'Reapareciendo…'; });
  }

  finPartida({ gano, ganador, ranking, jugador, puesto, resumen, online }) {
    this.el.lineas.classList.remove('ver');
    this.el.miraFranco.hidden = true;
    this.el.muerto.hidden = true;
    this.el.tactil.hidden = true;
    this.mostrar('fin');
    const caja = this.p.fin.querySelector('.caja');
    caja.classList.toggle('gana', gano);
    $('finTitulo').textContent = gano ? '¡Victoria!' : puesto <= 3 ? '¡Podio!' : 'Fin de la partida';
    $('finMarcador').textContent = gano ? `Has llegado primero` : `Gana ${ganador} · quedas ${puesto}.º`;
    $('finRanking').innerHTML = ranking.slice(0, 6).map((c) => `<li class="${c === jugador ? 'yo' : ''}"><b style="color:${c.H.color}">${esc(c.nombre)}</b><span>${c.bajas} / ${c.muertes}</span></li>`).join('');
    const s = jugador.stats;
    const prec = s.disparos ? Math.round((s.aciertos / s.disparos) * 100) : 0;
    $('finStats').innerHTML = [['Bajas', jugador.bajas], ['Precisión', prec + '%'], ['Daño', Math.round(s.dano)]]
      .map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('');
    $('finRacha').textContent = online ? 'La siguiente partida empieza en unos segundos.' : `Has ganado ${resumen.victorias} de ${resumen.partidas} partidas.`;
    $('btnRevancha').hidden = online;
    $('btnMenu').textContent = online ? 'Salir de la sala' : 'Volver al menú';
    this.stats(resumen);
  }
}
