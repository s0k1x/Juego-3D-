// Interfaz DOM de Hanamichi Duelos: menú, equipo, HUD, tabla, pausa, ajustes y fin de partida.
// Solo escribe en el DOM cuando un valor cambia (caché `_set`). No importa nada del juego:
// el Director le pasa los datos de armas: new Interfaz({ ARMAS, POR_RANURA }).

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reiniciarAnim = (el, clase) => { el.classList.remove(clase); void el.offsetWidth; el.classList.add(clase); };

const RANURAS = [['principal', 'Principal'], ['secundaria', 'Secundaria'], ['cuerpo', 'Cuerpo a cuerpo'], ['utilidad', 'Utilidad']];
const STATS = [['dano', 'Daño'], ['cadencia', 'Cadencia'], ['alcance', 'Alcance'], ['movilidad', 'Movilidad']];
const NOMBRES_RANURA = Object.fromEntries(RANURAS);

// ---------- Siluetas de armas (viewBox 96×40, cañón a la derecha; .a = acento) ----------
const ACENTO = {
  vector: '#2563FF', trueno: '#FF7A1A', aguja: '#2563FF', avispa: '#FFD23F', cometa: '#FF4D5E',
  chispa: '#FFD23F', sentencia: '#FF7A1A', eco: '#2563FF',
  filo: '#2563FF', yunque: '#FF7A1A', colmillo: '#FF4D5E',
  petardo: '#FF4D5E', humo: '#9AA3B8', destello: '#FFD23F', muro: '#2563FF', botiquin: '#3BD67A',
};
const PISTOLA = '<rect x="26" y="10" width="46" height="12" rx="3.5"/><path d="M30 22h14l-4 16H27z"/><rect class="a" x="58" y="12.5" width="9" height="3" rx="1.5"/><rect x="72" y="13" width="7" height="6" rx="1.5"/><path d="M46 22h9v5a4.5 4.5 0 0 1-9 0z"/>';
const SVG_ARMA = {
  vector: '<rect x="2" y="15" width="16" height="9" rx="2.5"/><rect x="16" y="12" width="42" height="12" rx="3"/><rect x="56" y="14" width="22" height="8" rx="2"/><rect x="78" y="16" width="16" height="4" rx="1.5"/><path d="M36 24h10l-3 14h-9z"/><path d="M21 24h8l-3 12h-8z"/><rect class="a" x="26" y="7" width="16" height="5" rx="2"/>',
  trueno: '<path d="M2 13h20l5 3v10H21l-4 4H2z"/><rect x="30" y="13" width="64" height="5" rx="2"/><rect x="30" y="21" width="52" height="5" rx="2"/><rect x="24" y="11" width="14" height="16" rx="3"/><rect class="a" x="50" y="19" width="19" height="9" rx="3"/>',
  aguja: '<path d="M2 14h12l4 2h22v8H20l-3 6H2z"/><rect x="38" y="15" width="56" height="4" rx="1.5"/><rect x="20" y="13" width="26" height="10" rx="3"/><rect x="28" y="4" width="28" height="7" rx="3"/><rect class="a" x="51" y="5.5" width="6" height="4" rx="1.2"/><rect x="33" y="10" width="3" height="4"/><rect x="47" y="10" width="3" height="4"/><circle class="a" cx="22" cy="28" r="3"/>',
  avispa: '<rect x="4" y="14" width="12" height="4" rx="1.5"/><rect x="14" y="12" width="38" height="12" rx="3.5"/><rect x="52" y="14" width="26" height="6" rx="2"/><rect x="78" y="15.5" width="12" height="3" rx="1.5"/><path d="M26 24h8l-1 14h-8z"/><path d="M42 24h7l-2 10h-7z"/><rect class="a" x="18" y="8" width="12" height="4" rx="2"/>',
  cometa: '<rect x="6" y="12" width="64" height="14" rx="7"/><path class="a" d="M70 12l22 7-22 7z"/><rect x="2" y="9" width="10" height="20" rx="3"/><path d="M32 26h10l-2 11h-8z"/><rect x="38" y="6" width="14" height="6" rx="2"/>',
  chispa: PISTOLA,
  sentencia: '<rect x="46" y="12" width="42" height="6" rx="2"/><rect x="24" y="9" width="30" height="14" rx="4"/><rect class="a" x="34" y="7" width="16" height="18" rx="5"/><path d="M24 23h12l-5 15H17z"/><path d="M40 25h9v4a4.5 4.5 0 0 1-9 0z"/>',
  eco: `<g transform="translate(-6 -8) scale(.82)">${PISTOLA}</g><g transform="translate(14 8) scale(.82)">${PISTOLA}</g>`,
  filo: '<g transform="rotate(-16 48 20)"><rect class="a" x="2" y="17" width="22" height="7" rx="3"/><ellipse cx="27" cy="20.5" rx="3.2" ry="8"/><path d="M30 18h60l5 2.5-5 2.5H30z"/></g>',
  yunque: '<g transform="rotate(-22 48 20)"><rect x="4" y="18" width="66" height="5" rx="2"/><rect x="62" y="7" width="30" height="27" rx="5"/><rect class="a" x="74" y="7" width="6" height="27"/></g>',
  colmillo: '<path d="M32 13q34-6 62 7-28 6-62 5z"/><rect class="a" x="3" y="14" width="30" height="11" rx="5.5"/><rect x="31" y="9" width="5" height="21" rx="2"/>',
  petardo: '<circle cx="48" cy="24" r="13"/><rect x="42" y="6" width="13" height="8" rx="2.5"/><rect class="a" x="34" y="21" width="28" height="5"/><path d="M55 8h14l4 6-6 2-5-4h-7z"/><circle cx="73" cy="16" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/>',
  humo: '<rect x="35" y="12" width="26" height="25" rx="5"/><rect x="40" y="5" width="16" height="8" rx="2.5"/><rect class="a" x="35" y="22" width="26" height="6"/><circle class="a" cx="20" cy="26" r="8" opacity=".55"/><circle class="a" cx="77" cy="22" r="9" opacity=".55"/><circle class="a" cx="68" cy="9" r="5" opacity=".55"/>',
  destello: '<path class="a" d="M56 2L26 23h17l-7 15 34-23H52z"/><path d="M6 14l7 6-7 6M17 14l7 6-7 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
  muro: '<rect x="10" y="5" width="34" height="10" rx="2"/><rect class="a" x="48" y="5" width="38" height="10" rx="2"/><rect class="a" x="10" y="17" width="20" height="10" rx="2"/><rect x="34" y="17" width="34" height="10" rx="2"/><rect class="a" x="72" y="17" width="14" height="10" rx="2"/><rect x="10" y="29" width="38" height="8" rx="2"/><rect x="52" y="29" width="34" height="8" rx="2"/>',
  botiquin: '<rect x="20" y="9" width="56" height="28" rx="6"/><rect x="36" y="4" width="24" height="7" rx="3"/><rect class="a" x="44" y="14" width="8" height="18" rx="1.5"/><rect class="a" x="39" y="19" width="18" height="8" rx="1.5"/>',
};
const CALAVERA = '<circle cx="48" cy="18" r="12"/><rect x="40" y="26" width="16" height="9" rx="2"/><circle class="a" cx="43" cy="18" r="3"/><circle class="a" cx="53" cy="18" r="3"/>';
const icono = (id, extra = '') => `<svg class="ico ${extra}" viewBox="0 0 96 40" style="--acento:${ACENTO[id] || '#9AA3B8'}" aria-hidden="true" focusable="false">${SVG_ARMA[id] ?? CALAVERA}</svg>`;

const TIPS = [
  'Deslizarte mantiene tu velocidad y te hace más difícil de acertar.',
  'Un disparo a la cabeza hace más daño que uno al cuerpo.',
  'Al caer no reapareces: mira a tu equipo y avisa de lo que veas.',
  'Recargar en vacío tarda más que hacerlo a tiempo.',
  'La utilidad tiene tiempo de espera: úsala en cuanto esté lista.',
  'Con 2 contra 2 y 3 contra 3, quedaos juntos para cubriros.',
];

const AYUDA_PC = [
  ['W A S D', 'Moverte'], ['Ratón', 'Mirar · clic dispara · clic derecho apunta'], ['Espacio', 'Saltar (doble salto)'], ['C|Ctrl', 'Deslizarte'],
  ['1 2 3|Rueda', 'Cambiar de arma'], ['Q|4', 'Utilidad'], ['R', 'Recargar'], ['F', 'Inspeccionar'], ['Tab', 'Tabla de jugadores'], ['Esc', 'Pausa'],
];
const AYUDA_TACTIL = [
  ['Pulgar izquierdo', 'Moverte (joystick libre)'], ['Pulgar derecho', 'Mirar arrastrando'], ['Botón de mira', 'Disparar y mirar a la vez'], ['Apuntar', 'Se activa y se desactiva'],
  ['Saltar · Deslizar', 'Doble salto, deslizarte al correr'], ['Arma · Recargar', 'Cambiar de arma y recargar'], ['Utilidad', 'Con su tiempo de espera'], ['Tabla', 'Ver bajas y daño'],
];
const teclas = (spec) => spec.split('|').map((alt) => alt.split(' ').map((k) => `<kbd>${esc(k)}</kbd>`).join('')).join('<i>o</i>');

export class Interfaz {
  constructor({ ARMAS, POR_RANURA } = {}) {
    this.ARMAS = ARMAS || {};
    this.POR_RANURA = POR_RANURA || {};
    this.c = {};
    this.alCambiar = () => {};
    this.eq = { principal: 'vector', secundaria: 'chispa', cuerpo: 'filo', utilidad: 'petardo' };
    this.ranuraAbierta = 'principal';
    this.p = { menu: $('pMenu'), equipo: $('pEquipo'), pausa: $('pPausa'), ajustes: $('pAjustes'), fin: $('pFin'), conectando: $('pConectando') };
    this.foco = { menu: null, equipo: 'btnCerrarEquipo', pausa: 'btnSeguir', ajustes: 'btnCerrarAjustes', fin: 'btnMenu', conectando: 'btnCancelarCon' };
    this.tactil = matchMedia('(pointer: coarse)').matches;
    const ids = ['hud', 'tactil', 'tiempo', 'rondaTxt', 'puntosAz', 'puntosNa', 'mAz', 'mNa', 'vivosAz', 'vivosNa', 'espectando', 'espNombre', 'redChip', 'fps', 'feed',
      'cruz', 'marca', 'direcciones', 'numeros', 'anuncio', 'aviso', 'avisoTxt', 'rondaBanner', 'rondaBannerTxt', 'cuenta', 'finRonda', 'frMotivo', 'frTitulo', 'frAz', 'frNa',
      'vida', 'vidaNum', 'vidaBarra', 'vidaFantasma', 'escudoCaja', 'escudoBarra', 'ranuras', 'util', 'utilIcono', 'utilCd', 'tUtilIcono', 'tUtilCd',
      'arma', 'municion', 'cargador', 'armaNombre', 'recargaCaja', 'recargaBarra', 'muerto', 'muertoNombre', 'muertoArma', 'muertoVida',
      'tabla', 'tablaInfo', 'tablaAz', 'tablaNa', 'guia', 'btnGuia', 'lineas', 'miraFranco', 'danoBorde', 'bordeEstado', 'toast', 'carga', 'cargaConsejo',
      'conTitulo', 'conTexto', 'conRueda', 'pausaNota', 'btnInvitar', 'btnRevancha', 'btnMenu', 'finCaja', 'finSup', 'finTitulo', 'finAz', 'finNa', 'finTablaAz', 'finTablaNa', 'finResumen',
      'equipoMenu', 'equipoModal', 'statsMenu'];
    this.el = Object.fromEntries(ids.map((i) => [i, $(i)]));
    this.tUtil = this.el.tactil.querySelector('.t-util');
    this.dirs = Array.from({ length: 4 }, () => {
      const d = document.createElement('div'); d.className = 'dir'; d.innerHTML = '<i></i>'; this.el.direcciones.appendChild(d); return d;
    });
    this.dirN = 0;
    this._ayuda();
    if (this.el.cargaConsejo) this.el.cargaConsejo.textContent = 'Consejo: ' + TIPS[(Math.random() * TIPS.length) | 0];
    this.el.btnGuia.addEventListener('click', () => this._cerrarGuia());
    $('btnCerrarEquipo').addEventListener('click', () => { this.equipo(false); this.alCerrarEquipo?.(); });
    for (const host of [this.el.equipoMenu, this.el.equipoModal]) host.addEventListener('click', (e) => this._clicEquipo(e, host));
    this.renderEquipo();
    // El foco automático en pantallas solo si se navega con teclado (así no aparece el aro tras un clic).
    addEventListener('keydown', () => { this._teclado = true; }, true);
    addEventListener('pointerdown', () => { this._teclado = false; }, true);
  }

  marcarTactil(si) {
    this.tactil = si;
    document.body.classList.toggle('es-tactil', si);
    this._ayuda();
  }

  _ayuda() {
    const filas = this.tactil ? AYUDA_TACTIL : AYUDA_PC;
    const html = filas.map(([a, b]) => `<dt>${this.tactil ? esc(a) : teclas(a)}</dt><dd>${esc(b)}</dd>`).join('');
    $('ayuda').innerHTML = html;
    $('ayudaAjustes').innerHTML = html;
  }

  // ---------- Equipo ----------
  _datosArma(id) { return this.ARMAS[id] || { nombre: id, corto: id, desc: '', stats: {}, cargador: 0 }; }

  renderEquipo() {
    const sel = this.ranuraAbierta;
    const opciones = this.POR_RANURA[sel] || [];
    const slots = RANURAS.map(([r, nombre]) => {
      const a = this._datosArma(this.eq[r]);
      return `<button type="button" class="eq-slot${r === sel ? ' sel' : ''}" data-ranura="${r}" aria-pressed="${r === sel}">
        <span class="eq-r">${nombre}</span>${icono(this.eq[r])}<b>${esc(a.nombre)}</b></button>`;
    }).join('');
    const lista = opciones.map((id) => {
      const a = this._datosArma(id), on = this.eq[sel] === id;
      const barras = STATS.map(([k, n]) => `<span class="eq-st"><em>${n}</em><i style="--v:${Math.max(0, Math.min(100, a.stats?.[k] ?? 0))}%"></i></span>`).join('');
      return `<button type="button" class="eq-op${on ? ' on' : ''}" role="radio" aria-checked="${on}" data-arma="${id}">
        ${icono(id)}<span class="eq-txt"><b>${esc(a.nombre)}</b><small>${esc(a.desc)}</small></span><span class="eq-stats">${barras}</span></button>`;
    }).join('');
    const html = `<header class="eq-cab"><h2>Tu equipo</h2><p>Pulsa un hueco y elige su arma</p></header>
      <div class="eq-slots">${slots}</div>
      <div class="eq-lista" role="radiogroup" aria-label="Opciones: ${esc(NOMBRES_RANURA[sel])}">${lista}</div>`;
    this.el.equipoMenu.innerHTML = html;
    this.el.equipoModal.innerHTML = html;
  }

  _clicEquipo(e, host) {
    const s = e.target.closest('[data-ranura]'), o = e.target.closest('[data-arma]');
    if (!s && !o) return;
    let sel;
    if (s) { this.ranuraAbierta = s.dataset.ranura; sel = `[data-ranura="${s.dataset.ranura}"]`; }
    else {
      this.eq[this.ranuraAbierta] = o.dataset.arma;
      sel = `[data-arma="${o.dataset.arma}"]`;
      this.alCambiar('equipo', { ...this.eq });
    }
    this.renderEquipo();
    host.querySelector(sel)?.focus({ preventScroll: true });
  }

  equipo(abrir) {
    if (abrir) {
      if (!this.p.menu.hidden) { // en el menú el panel ya está a la vista
        this.el.equipoMenu.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
        reiniciarAnim(this.el.equipoMenu, 'destaca');
        return;
      }
      this._equipoVolver = !this.p.pausa.hidden ? 'pausa' : null;
      this.mostrar('equipo');
    } else {
      this.mostrar(this._equipoVolver === 'pausa' ? 'pausa' : null);
      this._equipoVolver = null;
    }
  }

  // ---------- Menú y ajustes ----------
  construirMenu(ajustes, alCambiar) {
    this.alCambiar = alCambiar;
    if (ajustes.equipo) this.eq = { ...this.eq, ...ajustes.equipo };
    this.renderEquipo();
    const seg = (id, clave, valor) => {
      const el = $(id);
      const marcar = (v) => el.querySelectorAll('[data-v]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === v)));
      marcar(valor);
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-v]');
        if (!b) return;
        marcar(b.dataset.v);
        alCambiar(clave, b.dataset.v);
      });
    };
    seg('segModo', 'modo', ajustes.modo ?? '1v1');
    seg('segDif', 'dificultad', ajustes.dificultad ?? 'normal');
    seg('segMapa', 'mapa', ajustes.mapa ?? 'azar');
    seg('segCal', 'calidad', ajustes.calidad ?? 'auto');
    const pct = (v) => Math.round(v * 100) + '%';
    for (const [id, clave, fmt, def] of [['ajSens', 'sensibilidad', (v) => v.toFixed(2), 1], ['ajFov', 'fov', (v) => v + '°', 80], ['ajVol', 'volumen', pct, 0.8], ['ajMus', 'musica', pct, 0.5]]) {
      const inp = $(id), out = $(id + 'V');
      inp.value = ajustes[clave] ?? def;
      out.textContent = fmt(+inp.value);
      this._rango(inp);
      inp.addEventListener('input', () => { out.textContent = fmt(+inp.value); this._rango(inp); alCambiar(clave, +inp.value); });
    }
    const fps = $('ajFps');
    fps.setAttribute('aria-checked', String(!!ajustes.fps));
    fps.addEventListener('click', () => { const v = fps.getAttribute('aria-checked') !== 'true'; fps.setAttribute('aria-checked', String(v)); alCambiar('fps', v); });
    const nombre = $('nombre');
    nombre.value = ajustes.nombre || '';
    nombre.addEventListener('input', () => alCambiar('nombre', nombre.value.trim().slice(0, 14)));
    nombre.addEventListener('keydown', (e) => e.stopPropagation());
    $('codigoSala').addEventListener('keydown', (e) => e.stopPropagation());
  }

  _rango(inp) { inp.style.setProperty('--v', ((inp.value - inp.min) / (inp.max - inp.min)) * 100 + '%'); }

  stats(s) {
    this.el.statsMenu.textContent = s && s.partidas
      ? `${s.victorias} victorias en ${s.partidas} partidas · ${s.bajas} bajas · ${s.muertes} muertes`
      : 'Tu primer duelo te espera.';
  }

  mostrar(nombre) {
    for (const k in this.p) this.p[k].hidden = k !== nombre;
    const f = this.foco[nombre];
    if (f && this._teclado) requestAnimationFrame(() => $(f)?.focus({ preventScroll: true }));
  }

  menu() {
    this.mostrar('menu');
    this.el.hud.hidden = true;
    this.el.tactil.hidden = true;
    this.el.lineas.classList.remove('ver');
    this.el.miraFranco.hidden = true;
    this.el.bordeEstado.className = 'borde-estado';
    this.el.danoBorde.classList.remove('ver');
    this.el.guia.hidden = true;
  }

  ajustes(abrir, volverA) {
    if (abrir) { this._volver = volverA; this.mostrar('ajustes'); }
    else if (this._volver === 'pausa') this.mostrar('pausa');
    else if (this._volver === 'menu') this.mostrar('menu');
    else this.mostrar(null);
  }

  pausa(si, online) {
    this.mostrar(si ? 'pausa' : null);
    this.el.pausaNota.hidden = !online;
    this.el.btnInvitar.hidden = !online;
    this.el.tactil.hidden = si || !this.tactil;
  }

  conectando(sala) {
    this.mostrar('conectando');
    this.p.conectando.classList.remove('error');
    this.el.conTitulo.textContent = 'Conectando…';
    this.el.conTexto.textContent = sala ? `Entrando en la sala ${sala}.` : 'Buscando una partida.';
  }

  errorRed(msg) {
    this.mostrar('conectando');
    this.p.conectando.classList.add('error');
    this.el.conTitulo.textContent = 'Sin conexión';
    this.el.conTexto.textContent = msg;
  }

  estadoRed(estado, sala, pares) {
    const chip = this.el.redChip;
    if (!estado || estado === 'desconectado' || !sala) { chip.hidden = true; return; }
    chip.hidden = false;
    const txt = { conectando: 'Conectando', conectado: 'Online', reconectando: 'Reconectando', caido: 'Sin conexión' }[estado] || estado;
    chip.className = 'red-chip ' + estado;
    chip.textContent = `${txt} · ${sala} · ${(pares ?? 0) + 1} jug.`;
  }

  toast(msg) {
    const t = this.el.toast;
    t.textContent = msg; t.hidden = false;
    clearTimeout(this._tt);
    this._tt = setTimeout(() => { t.hidden = true; }, 2400);
  }

  fps(valor, estadoRed) {
    const f = this.el.fps;
    if (valor == null) { f.hidden = true; return; }
    f.hidden = false;
    f.textContent = `${valor} FPS${estadoRed ? ' · ' + estadoRed : ''}`;
  }

  // ---------- Guía de primera partida ----------
  guia(forzar) {
    let visto = false;
    try { visto = localStorage.getItem('hanamichi:guia') === '1'; } catch { /* sin almacenamiento */ }
    if (visto && !forzar) return;
    this.el.guia.hidden = false;
  }

  _cerrarGuia() {
    this.el.guia.hidden = true;
    try { localStorage.setItem('hanamichi:guia', '1'); } catch { /* sin almacenamiento */ }
  }

  // ---------- Partida ----------
  empezarPartida() {
    this.mostrar(null);
    this.c = {};
    this.el.hud.hidden = false;
    this.el.tactil.hidden = !this.tactil;
    this.el.muerto.hidden = true;
    this.el.finRonda.hidden = true;
    this.el.espectando.hidden = true;
    this.el.tabla.hidden = true;
    this.el.cuenta.className = 'cuenta';
    this.el.cuenta.textContent = '';
    this.el.rondaBanner.className = 'ronda-banner';
    this.el.anuncio.className = 'anuncio';
    this.el.feed.innerHTML = '';
    this.guia(false);
  }

  ronda(n, marcador) {
    const e = this.el;
    e.rondaBannerTxt.textContent = `Ronda ${n}`;
    reiniciarAnim(e.rondaBanner, 'ver');
    e.rondaTxt.textContent = `Ronda ${n}`;
    if (marcador) { e.mAz.textContent = marcador[0]; e.mNa.textContent = marcador[1]; }
    e.finRonda.hidden = true;
    e.muerto.hidden = true;
    e.espectando.hidden = true;
    e.anuncio.className = 'anuncio';
    this.c.cuentaMuerto = null;
  }

  cuentaAtras(n) {
    if (this.c.cuenta === n) return;
    this.c.cuenta = n;
    const el = this.el.cuenta;
    this.el.finRonda.hidden = true;
    if (n > 0) { el.textContent = n; el.className = 'cuenta'; void el.offsetWidth; el.classList.add('num'); }
    else { el.textContent = '¡A luchar!'; el.className = 'cuenta'; void el.offsetWidth; el.classList.add('ya'); }
  }

  finRonda({ gana, marcador, motivo } = {}) {
    const e = this.el;
    const estado = gana === true ? 'gana' : gana === false ? 'pierde' : 'empate';
    e.frTitulo.textContent = { gana: 'Ronda ganada', pierde: 'Ronda perdida', empate: 'Empate' }[estado];
    const sub = motivo === 'tiempo' ? 'Se acabó el tiempo'
      : estado === 'gana' ? 'Equipo rival eliminado' : estado === 'pierde' ? 'Tu equipo ha caído' : 'Sin ganador';
    e.frMotivo.textContent = sub;
    if (marcador) { e.frAz.textContent = marcador[0]; e.frNa.textContent = marcador[1]; e.mAz.textContent = marcador[0]; e.mNa.textContent = marcador[1]; }
    e.finRonda.className = 'fin-ronda ' + estado;
    e.finRonda.hidden = false;
    reiniciarAnim(e.finRonda, 'ver');
  }

  impacto(dano, cabeza, letal) {
    const m = this.el.marca;
    m.className = 'marca' + (cabeza ? ' cabeza' : '') + (letal ? ' letal' : '');
    void m.offsetWidth;
    m.classList.add('ver');
    // Los daños de una ráfaga se suman en un solo número.
    const ahora = performance.now();
    if (!this._num || ahora - this._numT > 800) {
      this._num = document.createElement('span');
      this.el.numeros.appendChild(this._num);
      this._numSum = 0; this._numCab = false;
    }
    this._numT = ahora;
    this._numSum += Math.round(dano);
    this._numCab = this._numCab || !!cabeza;
    this._num.textContent = this._numSum;
    this._num.className = this._numCab ? 'cabeza' : '';
    reiniciarAnim(this._num, 'pop');
    const num = this._num;
    clearTimeout(this._numTm);
    this._numTm = setTimeout(() => { num.remove(); if (this._num === num) this._num = null; }, 1000);
  }

  recibirDano(angRel) {
    const d = this.dirs[this.dirN++ % this.dirs.length];
    d.style.transform = `rotate(${-angRel}rad)`;
    reiniciarAnim(d, 'ver');
    reiniciarAnim(this.el.danoBorde, 'ver');
  }

  baja({ victima, cabeza, multi } = {}) {
    const a = this.el.anuncio;
    const insignias = [];
    if (multi >= 3) insignias.push('Triple baja'); else if (multi === 2) insignias.push('Doble baja');
    if (cabeza) insignias.push('Crítico');
    a.innerHTML = `<small>Eliminado</small><b>${esc(victima)}</b>${insignias.length ? `<div>${insignias.map((t) => `<em class="${t === 'Crítico' ? 'crit' : ''}">${t}</em>`).join('')}</div>` : ''}`;
    a.className = 'anuncio' + (multi > 1 ? ' multi' : '');
    reiniciarAnim(a, 'ver');
  }

  feed(lista) {
    const fila = (f) => {
      const col = (al) => (al ? 'az' : 'na');
      const atacante = f.a && f.a !== f.v ? `<b class="${col(f.aAliado)}">${esc(f.a)}</b>` : '';
      return `<li class="${f.yo ? 'yo' : ''}">${atacante}<span class="f-arma">${icono(f.arma)}${f.cabeza ? '<em>Crítico</em>' : ''}</span><b class="${col(f.vAliado)}">${esc(f.v)}</b></li>`;
    };
    const html = (lista || []).slice(-5).map(fila).join('');
    if (this.c.feedHtml !== html) { this.c.feedHtml = html; this.el.feed.innerHTML = html; }
  }

  muerto(asesino) {
    const e = this.el;
    e.muerto.hidden = false;
    reiniciarAnim(e.muerto, 'ver');
    if (asesino) {
      e.muerto.querySelector('small').textContent = 'Te ha eliminado';
      e.muertoNombre.textContent = asesino.nombre;
      e.muertoArma.textContent = asesino.armaNombre ? `con ${asesino.armaNombre}` : '';
      const v = Math.max(0, Math.ceil(asesino.vida ?? 0));
      e.muertoVida.innerHTML = `<span>Le quedaba <b>${v}</b> de vida</span><i><u style="width:${Math.min(100, v)}%"></u></i>`;
    } else {
      e.muerto.querySelector('small').textContent = 'Has caído';
      e.muertoNombre.textContent = 'Eliminado';
      e.muertoArma.textContent = '';
      e.muertoVida.innerHTML = '';
    }
  }

  espectar(nombre) {
    const e = this.el;
    e.espectando.hidden = !nombre;
    if (nombre) e.espNombre.textContent = nombre;
  }

  utilUsada() { reiniciarAnim(this.el.util, 'usada'); }
  utilNoLista() { reiniciarAnim(this.el.util, 'no'); reiniciarAnim(this.tUtil, 'no'); }

  // ---------- Tabla ----------
  _filasTabla(lista) {
    return lista.map((c) => `<div class="fila${c.yo ? ' yo' : ''}${c.vivo === false ? ' caido' : ''}"><span class="nom">${esc(c.nombre)}</span><span>${c.bajas ?? 0}</span><span>${c.muertes ?? 0}</span><span>${Math.round(c.dano ?? 0)}</span></div>`).join('');
  }

  _equipos(lista, yoRef) {
    const marcar = (c) => ({ ...c, yo: c.yo ?? (yoRef && c === yoRef) });
    const orden = (a, b) => (b.bajas ?? 0) - (a.bajas ?? 0) || (b.dano ?? 0) - (a.dano ?? 0);
    const todos = lista.map(marcar);
    return [todos.filter((c) => c.aliado).sort(orden), todos.filter((c) => !c.aliado).sort(orden)];
  }

  tabla(juego) {
    const e = this.el;
    if (!juego) { if (!e.tabla.hidden) e.tabla.hidden = true; return; }
    e.tabla.hidden = false;
    const [az, na] = this._equipos(juego.combatientes || [], juego.jugador);
    const m = juego.marcador || [0, 0];
    const clave = JSON.stringify([az, na, m, juego.ronda]);
    if (this.c.tabla === clave) return;
    this.c.tabla = clave;
    e.tablaInfo.textContent = `Ronda ${juego.ronda ?? 1} · ${m[0]} – ${m[1]}`;
    e.tablaAz.innerHTML = this._filasTabla(az);
    e.tablaNa.innerHTML = this._filasTabla(na);
  }

  // ---------- HUD ----------
  _set(clave, valor, fn) { if (this.c[clave] !== valor) { this.c[clave] = valor; fn(valor); } }

  hud(juego, apunta) {
    const e = this.el;
    const yo = juego.jugador, j = juego.espectando || yo;
    if (!j || !j.arsenal) return;
    const ars = j.arsenal, a = ars.arma || {};
    const total = juego.rondasParaGanar ?? 5;

    // Marcador, tiempo y vivos
    const m = juego.marcador || [0, 0];
    this._set('marc', `${m[0]}|${m[1]}|${total}`, () => {
      const pts = (n) => Array.from({ length: total }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
      e.puntosAz.innerHTML = pts(m[0]); e.puntosNa.innerHTML = pts(m[1]);
      e.mAz.textContent = m[0]; e.mNa.textContent = m[1];
    });
    this._set('rondaN', juego.ronda, (v) => { e.rondaTxt.textContent = `Ronda ${v ?? 1}`; });
    const t = Math.max(0, Math.ceil(juego.tiempo ?? 0));
    this._set('tiempo', t, (v) => {
      e.tiempo.textContent = `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
      e.tiempo.classList.toggle('urgente', v <= 10 && v > 0);
    });
    const comb = juego.combatientes || [];
    this._set('vivos', comb.map((c) => `${c.nombre}|${c.aliado ? 1 : 0}|${c.vivo ? 1 : 0}|${Math.ceil((c.vida ?? 0) / 10)}`).join(';'), () => {
      const chip = (c) => `<li class="chip${c.vivo ? '' : ' caido'}${c === yo || c.yo ? ' yo' : ''}" title="${esc(c.nombre)}"><span>${esc((c.nombre || '?').trim().charAt(0).toUpperCase())}</span><i><u style="width:${c.vivo ? Math.max(6, Math.min(100, c.vida ?? 0)) : 0}%"></u></i></li>`;
      e.vivosAz.innerHTML = comb.filter((c) => c.aliado).map(chip).join('');
      e.vivosNa.innerHTML = comb.filter((c) => !c.aliado).map(chip).join('');
    });

    // Vida y escudo
    const vida = Math.max(0, Math.ceil(j.vida ?? 0));
    this._set('vida', vida, (v) => {
      e.vidaNum.textContent = v;
      e.vidaBarra.style.transform = `scaleX(${Math.min(1, v / 100)})`;
      e.vidaFantasma.style.transform = `scaleX(${Math.min(1, v / 100)})`;
      e.vida.classList.toggle('baja', v > 0 && v <= 30);
    });
    this._set('escudo', Math.ceil(j.escudo ?? 0), (v) => { e.escudoBarra.style.transform = `scaleX(${Math.min(1, v / 50)})`; e.escudoCaja.classList.toggle('ver', v > 0); });
    const propio = j === yo;
    this._set('estado', !propio || !j.vivo ? '' : (vida <= 30 ? 'baja' : '') + (j.protegido ? ' protegido' : ''), (v) => { e.bordeEstado.className = 'borde-estado ' + v; });

    // Armas, munición y recarga
    this._set('ranuras', `${ars.ranuras?.join(',')}|${ars.indice}`, () => {
      e.ranuras.innerHTML = (ars.ranuras || []).map((id, i) => `<li class="slot${i === ars.indice ? ' activa' : ''}"><kbd>${i + 1}</kbd>${icono(id)}</li>`).join('');
    });
    this._set('arma', ars.tipo, () => {
      e.armaNombre.textContent = this._datosArma(ars.tipo).nombre;
      e.cruz.classList.toggle('cuerpo', !!a.cuerpo);
    });
    const tieneCargador = !!a.cargador;
    const mun = tieneCargador ? (ars.municion?.[ars.tipo] ?? 0) : null;
    this._set('mun', `${mun}|${a.cargador}`, () => {
      e.municion.textContent = tieneCargador ? mun : '—';
      e.cargador.textContent = tieneCargador ? `/ ${a.cargador}` : '';
      e.arma.classList.toggle('vacia', tieneCargador && mun === 0);
      e.arma.classList.toggle('poca', tieneCargador && mun > 0 && mun <= a.cargador * 0.25);
      e.arma.classList.toggle('cuerpo', !tieneCargador);
    });
    const recarga = ars.recargando > 0;
    this._set('recarga', Math.round((ars.progresoRecarga ?? 0) * 50) + (recarga ? 1000 : 0), () => {
      e.recargaCaja.classList.toggle('ver', recarga);
      e.recargaBarra.style.transform = `scaleX(${recarga ? Math.min(1, ars.progresoRecarga ?? 0) : 0})`;
    });
    const aviso = recarga ? 'Recargando' : tieneCargador && mun === 0 ? 'Sin munición' : '';
    this._set('aviso', aviso, (v) => {
      e.avisoTxt.textContent = v;
      e.aviso.className = 'aviso' + (v ? ' ver ' + (recarga ? 'recarga' : 'vacia') : '');
    });

    // Utilidad
    const cd = Math.max(0, ars.cdUtil ?? 0), cdTot = ars.cdUtilTotal || 1;
    this._set('utilId', ars.utilidad, (id) => {
      const svg = (SVG_ARMA[id] ?? CALAVERA);
      for (const s of [e.utilIcono, e.tUtilIcono]) { s.innerHTML = svg; s.style.setProperty('--acento', ACENTO[id] || '#9AA3B8'); }
    });
    this._set('cdUtil', Math.ceil(cd * 10), () => {
      const prog = cd > 0 ? 1 - cd / cdTot : 1;
      const txt = cd > 0 ? Math.ceil(cd) : '';
      for (const el of [e.util, this.tUtil]) { el.style.setProperty('--p', (prog * 360).toFixed(0) + 'deg'); el.classList.toggle('espera', cd > 0); }
      e.utilCd.textContent = txt; e.tUtilCd.textContent = txt;
    });

    // Mira
    const vel = j.vel ? Math.hypot(j.vel.x, j.vel.z) : 0;
    const disp = (a.disp ?? 0) + (vel / 8) * (a.dispMov ?? 0) + (j.suelo ? 0 : 0.025) + (a.mira && !apunta ? (a.dispCadera ?? 0) : 0);
    this._set('cruz', Math.round((3 + disp * 380) * (apunta && !a.mira ? 0.55 : 1)), (v) => e.cruz.style.setProperty('--s', v + 'px'));
    const franco = !!apunta && !!a.mira && j.vivo !== false;
    this._set('franco', franco, (v) => { e.miraFranco.hidden = !v; e.cruz.hidden = v; e.hud.classList.toggle('con-mira', v); });
    this._set('lineas', (vel > 8.5 || j.deslizando > 0) && juego.fase === 'combate', (v) => e.lineas.classList.toggle('ver', v));
    this._set('hudMuerto', j.vivo === false, (v) => e.hud.classList.toggle('sin-vida', v));
  }

  // ---------- Fin de partida ----------
  finPartida({ gano, marcador, jugadores, resumen, online } = {}) {
    const e = this.el;
    e.lineas.classList.remove('ver');
    e.miraFranco.hidden = true;
    e.hud.hidden = true;
    e.tactil.hidden = true;
    e.bordeEstado.className = 'borde-estado';
    e.finCaja.classList.toggle('gana', !!gano);
    e.finCaja.classList.toggle('pierde', !gano);
    e.finSup.textContent = online ? 'Fin del duelo online' : 'Fin del duelo';
    e.finTitulo.textContent = gano ? 'Victoria' : 'Derrota';
    const m = marcador || [0, 0];
    e.finAz.textContent = m[0]; e.finNa.textContent = m[1];
    const [az, na] = this._equipos(jugadores || []);
    e.finTablaAz.innerHTML = this._filasTabla(az);
    e.finTablaNa.innerHTML = this._filasTabla(na);
    if (resumen) this.stats(resumen);
    e.finResumen.textContent = resumen && resumen.partidas ? `Has ganado ${resumen.victorias} de ${resumen.partidas} partidas.` : '';
    e.btnRevancha.hidden = !!online;
    e.btnMenu.textContent = online ? 'Salir de la sala' : 'Volver al menú';
    this.mostrar('fin');
  }
}
