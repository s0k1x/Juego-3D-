// Núcleo: duelos por rondas entre dos equipos (1v1, 2v2, 3v3). Gana quien llega a 5 rondas; dentro de una
// ronda no se reaparece y los eliminados miran a un compañero. Cada máquina es dueña de sus entidades (su
// jugador y, si es la anfitriona, los bots): las simula, les aplica el daño que reciben y difunde su estado.
// Quien dispara calcula el impacto sobre lo que ve (a favor del que dispara) y se lo pide al dueño de la
// víctima. La anfitriona lleva el reloj, las rondas, el marcador, el reparto de equipos y los bots.
import * as THREE from 'three';
import { Mapa, MAPAS } from './mapa.js';
import { Combatiente, Camara, angulo, VIDA_MAX } from './jugador.js';
import { Bot } from './bots.js';
import { ARMAS, caidaDano, equipoAlAzar, equipoValido } from './armas.js';
import { Efectos } from './efectos.js';
import { actualizarFrustum } from './personaje.js';
import { Vista } from './vista.js';
import { Utilidades, rayoEsfera } from './utilidades.js';
import { COLOR_ALIADO, COLOR_RIVAL, css } from './paleta.js';
import { datos } from './datos.js';
import { red } from './red.js';

export const RONDAS_PARA_GANAR = 5;
const TIEMPO_RONDA = 90, T_PREPARACION = 3, T_FIN_RONDA = 4.5;
const NOMBRES_BOT = ['Rin', 'Sora', 'Haru', 'Mei', 'Ren', 'Aoi', 'Kenji', 'Nao', 'Hina', 'Taro', 'Kira', 'Dani'];
const RADIOS = { cabeza: 0.21, pecho: 0.34, piernas: 0.3 };
const ZONAS = ['cabeza', 'pecho', 'piernas'];

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _n = new THREE.Vector3();
const _boca = new THREE.Vector3(), _ojo = new THREE.Vector3(), _q = new THREE.Vector3();
const r2 = (v) => Math.round(v * 100) / 100;

export class Juego {
  constructor({ render, input, audio, ui }) {
    this.render = render; this.input = input; this.audio = audio; this.ui = ui;
    const escena = render.escena;
    this.mapa = new Mapa(escena, render);
    this.mapa.cargar('azotea');
    this.efectos = new Efectos(escena);
    this.camara = new Camara(render.camara);
    this.vista = new Vista(render.escenaVista);
    this.vista.setColor(COLOR_ALIADO);
    this.utilidades = new Utilidades(this);
    this.red = red;
    red.alMensaje = (m) => this._mensaje(m);
    red.alEstado = (e) => this.ui.estadoRed(e, red.sala, this.pares?.size ?? 0);

    this.config = { nombre: 'Jugador', modo: '1v1', mapa: 'azar', dificultad: 'normal', equipo: equipoValido(null) };
    this.rondasParaGanar = RONDAS_PARA_GANAR;
    this.combatientes = [];
    this.indice = new Map();
    this.bots = new Map();
    this.pares = new Map();
    this.asignacion = new Map(); // par -> equipo (lo decide la anfitriona)
    this.jugador = this._crear({ id: red.yo + ':0', nombre: 'Jugador', equipo: 0, variante: (Math.random() * 6) | 0, local: true });
    this.jugador.asignado = true;

    this.fase = 'menu';
    this.online = false;
    this.pausado = false;
    this.t = 0;
    this.camaraLenta = 1;
    this.partidaN = 0;
    this.ronda = 0;
    this.marcadorEq = [0, 0];
    this.tiempo = TIEMPO_RONDA;
    this.listaFeed = [];
    this.espectando = null;
    this.orbita = null;
    this.tRed = 0;
    this.tEtiquetas = 0;
    this.unidoEn = 0;
    this.multi = { n: 0, t: 0 };
    this._antesDisparo = false;
    this._prepararMenu();
  }

  // Marcador visto por el jugador: [su equipo, el rival].
  get marcador() { const e = this.jugador.equipo === 1 ? 1 : 0; return [this.marcadorEq[e], this.marcadorEq[1 - e]]; }
  get idRonda() { return this.partidaN * 100 + this.ronda; }

  // ---------- Entidades ----------
  _crear({ id, nombre, equipo, variante = 0, armas, local }) {
    const c = new Combatiente(this.render.escena, { id, nombre, equipo, variante, armas, local });
    c.asignado = true;
    c.danoHecho = 0;
    this.combatientes.push(c);
    this.indice.set(id, c);
    this._colores();
    return c;
  }

  _quitar(c) {
    const i = this.combatientes.indexOf(c);
    if (i < 0) return;
    c.destruir();
    this.combatientes.splice(i, 1);
    this.indice.delete(c.id);
    this.bots.delete(c.id);
    if (this.espectando === c) this.espectando = null;
  }

  // Aliados en azul, rivales en naranja (siempre desde el punto de vista del jugador).
  _colores() {
    const mio = this.jugador ? this.jugador.equipo : 0;
    for (const c of this.combatientes) {
      c.aliado = c.equipo === mio;
      c.modelo.setColor(c.aliado ? COLOR_ALIADO : COLOR_RIVAL);
    }
  }

  porId(id) { return this.indice.get(id); }
  esLocal(c) { return !!c && c.local; }
  distOyente(p) { const d = p.distanceTo(this.render.camara.position); return d < 1 ? 0 : d; }
  // Línea de visión teniendo en cuenta paredes y humo.
  ve(a, b) { return this.mapa.visible(a, b) && !this.utilidades.tapado(a, b); }
  enJuego(c) { return c.asignado && c.equipo >= 0; }
  vivosDe(equipo) { let n = 0; for (const c of this.combatientes) if (this.enJuego(c) && c.equipo === equipo && c.vivo) n++; return n; }

  _crearBot(equipo) {
    const usados = new Set(this.combatientes.map((c) => c.nombre.split(' ')[0]));
    const libres = NOMBRES_BOT.filter((n) => !usados.has(n));
    const lista = libres.length ? libres : NOMBRES_BOT;
    const nombre = lista[(Math.random() * lista.length) | 0];
    const id = `${red.yo}:b${(this._nBot = (this._nBot || 0) + 1)}`;
    const c = this._crear({ id, nombre, equipo, variante: this._nBot % 6, armas: equipoAlAzar(), local: true });
    this.bots.set(id, new Bot(c, this.config.dificultad));
    return c;
  }

  // Coloca una entidad propia en su salida para la ronda actual (los lados se cambian cada ronda).
  _colocar(c) {
    const lado = (c.equipo + this.ronda) % 2;
    const companeros = this.combatientes.filter((o) => this.enJuego(o) && o.equipo === c.equipo).map((o) => o.id).sort();
    const a = this.mapa.aparicion(lado, Math.max(0, companeros.indexOf(c.id)) % 3);
    c.reiniciar(a.pos, a.yaw, c === this.jugador ? this.config.equipo : undefined);
    c.protegido = 0;
    this.bots.get(c.id)?.reiniciar();
  }

  // ---------- Flujo de partida ----------
  _prepararMenu() {
    this.fase = 'menu';
    this.camaraLenta = 1;
    this.espectando = null; this.orbita = null;
    for (const c of [...this.combatientes]) if (c !== this.jugador) this._quitar(c);
    const j = this.jugador;
    j.equipo = 0; j.asignado = true;
    this._colores();
    const a = this.mapa.aparicion(0, 1);
    j.reiniciar(a.pos, a.yaw, this.config.equipo);
    j.modelo.setVisible(true);
    this.utilidades.limpiar();
    this.mapa.limpiarDinamicas();
  }

  cambiarEquipo(equipo) {
    this.config.equipo = equipoValido(equipo);
    if (this.fase === 'menu') this.jugador.arsenal.reiniciar(this.config.equipo);
    else if (this.fase === 'preparacion') { this.jugador.arsenal.reiniciar(this.config.equipo); this.vista.setColor(COLOR_ALIADO); }
    // En combate el cambio vale para la siguiente ronda (se aplica en _colocar).
  }

  _elegirMapa() {
    const ids = Object.keys(MAPAS);
    if (this.config.mapa !== 'azar' && MAPAS[this.config.mapa]) return this.config.mapa;
    const otros = ids.filter((m) => m !== this._ultimoMapa);
    return (this._ultimoMapa = otros[(Math.random() * otros.length) | 0]);
  }

  // Partida contra bots (sin conexión).
  empezarPartida() {
    this._intento = (this._intento || 0) + 1;
    if (this.online) red.salir();
    this.online = false;
    this._limpiarPartida();
    const n = Math.max(1, Math.min(3, parseInt(this.config.modo, 10) || 1));
    this.jugador.equipo = 0;
    for (let i = 1; i < n; i++) this._crearBot(0);
    for (let i = 0; i < n; i++) this._crearBot(1);
    this._cargarMapa(this._elegirMapa());
    this._nuevaPartida(this.partidaN + 1);
    this._entrar();
  }

  revancha() { if (!this.online) this.empezarPartida(); }

  // Partida online. tipo: 'supabase' | 'local'.
  async unirseOnline(sala, tipo = 'supabase') {
    this.ui.conectando(sala);
    const intento = (this._intento = (this._intento || 0) + 1);
    try {
      await red.conectar(sala, tipo);
    } catch (e) {
      if (intento !== this._intento || e?.message === 'cancelado') return false;
      console.warn('Sin conexión online:', e?.message);
      this.ui.errorRed('No se ha podido conectar con la sala. Revisa tu conexión o juega contra bots.');
      return false;
    }
    if (intento !== this._intento) return false;
    this.online = true;
    this.pares.clear();
    this.asignacion.clear();
    this.unidoEn = Date.now();
    this._limpiarPartida();
    // Hasta saber si hay alguien más, esperamos; si no llega nadie, esta máquina será la anfitriona.
    this.partidaN = 0; this.ronda = 0; this.marcadorEq = [0, 0];
    this.fase = 'preparacion'; this.tFase = T_PREPARACION;
    this.jugador.asignado = false; this.jugador.vivo = false; this.jugador.equipo = 0;
    this._entrar();
    red.avisarWeb('online', { sala });
    return true;
  }

  _limpiarPartida() {
    for (const c of [...this.combatientes]) if (c !== this.jugador) this._quitar(c);
    this.jugador.nombre = this.config.nombre || 'Jugador';
    this.jugador.asignado = true;
    this.jugador.bajas = 0; this.jugador.muertes = 0; this.jugador.danoHecho = 0;
    this.utilidades.limpiar();
    this.mapa.limpiarDinamicas();
    this.espectando = null; this.orbita = null;
    this.pausado = false;
  }

  _cargarMapa(id) {
    if (!MAPAS[id] || this.mapa.id === id) return;
    this.mapa.cargar(id);
    this.utilidades.limpiar();
  }

  _entrar() {
    this.jugador.modelo.setVisible(false);
    this.ui.empezarPartida(this);
    this.audio.musica?.('combate');
    this.audio.ambiente?.(true);
    this.input.activo = true;
    this.input.pedirBloqueo();
    red.avisarWeb('inicio');
  }

  _nuevaPartida(n) {
    this.partidaN = n;
    this.ronda = 0;
    this.marcadorEq = [0, 0];
    this.listaFeed.length = 0;
    this.jugo = false;
    for (const c of this.combatientes) { c.bajas = 0; c.muertes = 0; c.danoHecho = 0; c.stats = { disparos: 0, aciertos: 0, cabezas: 0, dano: 0 }; }
    this.ui.feed(this.listaFeed);
    this._nuevaRonda(1);
  }

  // Empieza una ronda (la anfitriona o la partida sin conexión deciden cuándo).
  _nuevaRonda(n) {
    this.ronda = n;
    this.fase = 'preparacion';
    this.tFase = T_PREPARACION;
    this.tiempo = TIEMPO_RONDA;
    this.camaraLenta = 1;
    this.espectando = null; this.orbita = null;
    this.ganadorRonda = null;
    this.multi.n = 0;
    if (this.pausado) { this.pausado = false; this.input.limpiar(); }
    this.utilidades.limpiar();
    this.mapa.limpiarDinamicas();
    if (this.online && this.anfitriona) this._repartir();
    this._colores();
    for (const c of this.combatientes) {
      c.celebra = false;
      if (c.local && this.enJuego(c)) this._colocar(c);
    }
    this.jugador.modelo.setVisible(false);
    this.ui.espectar(null);
    this.ui.muerto?.(undefined);
    this.ui.ronda(n, this.marcador);
  }

  // motivo: 'eliminacion' | 'tiempo'. ganador: 0, 1 o null (empate).
  _finRonda(ganador, motivo, sumar = true) {
    if (this.fase === 'finRonda' || this.fase === 'finPartida') return;
    this.fase = 'finRonda';
    this.tFase = T_FIN_RONDA;
    this.ganadorRonda = ganador;
    this.motivoRonda = motivo;
    if (sumar && ganador != null) this.marcadorEq[ganador]++;
    for (const c of this.combatientes) c.celebra = c.vivo && c.equipo === ganador;
    const mio = this.jugador.equipo;
    const gana = ganador == null ? null : ganador === mio;
    if (gana === true) this.audio.victoriaRonda(); else if (gana === false) this.audio.derrotaRonda();
    // Toma final a cámara lenta sobre el último eliminado.
    if (motivo === 'eliminacion' && this.ultimoCaido) {
      this.camaraLenta = 0.3;
      this.orbita = { centro: this.ultimoCaido.pos.clone(), t: 0, a0: this.jugador.yaw + Math.PI };
    }
    this.ui.finRonda({ gana, marcador: this.marcador, motivo });
  }

  _terminarPartida() {
    if (this.fase === 'finPartida') return;
    this.fase = 'finPartida';
    this.pausado = false;
    this.input.limpiar();
    this.tFase = 12;
    const m = this.marcador;
    const gano = m[0] > m[1];
    if (gano) this.audio.victoriaFinal(); else this.audio.derrotaRonda();
    this.audio.musica?.('menu');
    this.audio.pocaVida?.(false);
    const jugadores = this.combatientes.filter((c) => this.enJuego(c))
      .sort((a, b) => (b.aliado - a.aliado) || (b.bajas - a.bajas) || (a.muertes - b.muertes))
      .map((c) => ({ nombre: c.nombre, aliado: c.aliado, yo: c === this.jugador, bajas: c.bajas, muertes: c.muertes, dano: Math.round(c.danoHecho) }));
    const resumen = this.jugo ? datos.registrarPartida({ gano, bajas: this.jugador.bajas, muertes: this.jugador.muertes }) : { ...datos.stats };
    this.input.soltarBloqueo();
    this.ui.finPartida({ gano, marcador: m, jugadores, resumen, online: this.online });
    red.avisarWeb('fin', { gano, marcador: m });
  }

  pausar() {
    if (this.pausado || !['preparacion', 'combate', 'finRonda'].includes(this.fase)) return;
    this.pausado = true;
    this.input.limpiar();
    this.input.soltarBloqueo();
    this.ui.pausa(true, this.online);
  }

  seguir() {
    if (!this.pausado) return;
    this.pausado = false;
    if (this.fase === 'finPartida' || this.fase === 'menu') return;
    this.input.limpiar();
    this.input.pedirBloqueo();
    this.ui.pausa(false);
  }

  salirAlMenu() {
    this._intento = (this._intento || 0) + 1;
    this.pausado = false;
    this.input.activo = false;
    this.input.soltarBloqueo();
    if (this.online) { red.salir(); this.online = false; this.pares.clear(); }
    this._prepararMenu();
    this.audio.musica?.('menu');
    this.audio.pocaVida?.(false);
    this.ui.menu();
  }

  // ---------- Daño ----------
  // Lo llama quien causa el daño (en su máquina). Sin fuego amigo.
  danar(atacante, victima, dano, info = {}) {
    if (!victima || !victima.vivo || victima.protegido > 0) return;
    if (atacante && atacante !== victima && atacante.equipo === victima.equipo) return;
    dano = Math.max(1, Math.round(dano));
    const letal = dano >= victima.vida + victima.escudo;
    if (atacante && this.esLocal(atacante) && atacante !== victima) {
      atacante.stats.aciertos++;
      atacante.stats.dano += dano;
      atacante.danoHecho += Math.min(dano, victima.vida + victima.escudo);
      if (info.cabeza) atacante.stats.cabezas++;
      if (atacante === this.jugador) {
        this.audio.impacto(info.cabeza);
        this.ui.impacto(dano, !!info.cabeza, letal);
      }
    }
    if (this.esLocal(victima)) this.recibirDano(atacante?.id, victima, dano, info, atacante?.pos);
    else red.evento({ k: 'd', p: this.idRonda, a: atacante?.id, v: victima.id, n: dano, c: info.cabeza ? 1 : 0, w: info.arma, e: info.empuje });
  }

  // Lo ejecuta el dueño de la víctima.
  recibirDano(atacanteId, v, dano, info = {}, desde) {
    if (!v.vivo || this.fase !== 'combate') return;
    const muere = v.danar(dano, desde);
    if (!v.golpeado) return;
    if (info.empuje) { v.vel.x += info.empuje[0]; v.vel.y += info.empuje[1]; v.vel.z += info.empuje[2]; v.suelo = false; }
    if (v === this.jugador) {
      this.tAccion = 4;
      this.audio.dano();
      this.camara.sacudida = Math.min(1, this.camara.sacudida + 0.3);
      this.ui.recibirDano(angulo(v.dirGolpe - v.yaw));
    }
    if (muere) this._emitir({ k: 'm', p: this.idRonda, v: v.id, a: atacanteId, c: info.cabeza ? 1 : 0, w: info.arma || '' });
  }

  // Evento que se procesa aquí y se manda a los demás.
  _emitir(ev) { if (this.online) red.evento(ev); this._evento(ev, true); }
  enviarFx(ev) { if (this.online) red.evento(ev); }

  _evento(ev, propio = false) {
    // Daños y bajas de una ronda anterior (llegan tarde): se descartan.
    if ((ev.k === 'd' || ev.k === 'm') && ev.p !== this.idRonda) return;
    switch (ev.k) {
      case 'd': {
        const v = this.porId(ev.v);
        if (v && this.esLocal(v)) {
          const a = this.porId(ev.a);
          this.recibirDano(ev.a, v, ev.n, { cabeza: !!ev.c, arma: ev.w, empuje: ev.e }, a?.pos);
        }
        break;
      }
      case 'm': this._baja(ev); break;
      case 'u': {
        const c = this.porId(ev.id);
        if (c && !propio) this.utilidades.ejecutar(c, ev.t, ev.d, false);
        break;
      }
      case 'tajo': {
        const c = this.porId(ev.id);
        if (c) { c.golpe = 1; c.golpeN = ev.n || 0; this.audio.katana(); }
        break;
      }
    }
  }

  _baja({ v: vid, a: aid, c: cabeza, w }) {
    const v = this.porId(vid), a = this.porId(aid);
    if (v) {
      v.vivo = false; v.muertes++; v.asesino = a && a !== v ? a : null;
      if (!this.esLocal(v)) { v.vida = 0; v.tMuerte = 0; }
      this.ultimoCaido = v;
    }
    if (a && a !== v) a.bajas++;
    this.listaFeed.unshift({ a: a && a !== v ? a.nombre : '', v: v?.nombre ?? '?', arma: ARMAS[w]?.corto ?? '', cabeza: !!cabeza, aAliado: !!a?.aliado, vAliado: !!v?.aliado });
    if (this.listaFeed.length > 5) this.listaFeed.length = 5;
    this.ui.feed(this.listaFeed);
    if (a === this.jugador && v !== this.jugador) {
      this.multi.n = this.t - this.multi.t < 5 ? this.multi.n + 1 : 1;
      this.multi.t = this.t;
      this.audio.baja(this.multi.n);
      this.ui.baja({ victima: v?.nombre ?? '', cabeza: !!cabeza, multi: this.multi.n });
    }
    if (v === this.jugador) {
      this.audio.muerte();
      this.audio.pocaVida?.(false);
      this.ui.muerto(a && a !== v ? { nombre: a.nombre, vida: a.vivo ? Math.max(0, Math.ceil(a.vida)) : 0, armaNombre: ARMAS[w]?.nombre ?? '' } : null);
    }
    this._comprobarRonda();
  }

  // La anfitriona (o la partida sin conexión) decide el final de la ronda.
  _comprobarRonda() {
    if (!this.anfitriona || this.fase !== 'combate') return;
    const v0 = this.vivosDe(0), v1 = this.vivosDe(1);
    if (v0 > 0 && v1 > 0) return;
    this._finRonda(v0 === v1 ? null : v0 > 0 ? 0 : 1, 'eliminacion');
  }

  get anfitriona() {
    if (!this.online) return true;
    if (Date.now() - this.unidoEn < 1500) return false;
    let mejor = { j: this.unidoEn, p: red.yo };
    for (const [p, d] of this.pares) if (d.j < mejor.j || (d.j === mejor.j && p < mejor.p)) mejor = { j: d.j, p };
    return mejor.p === red.yo;
  }

  // ---------- Disparos ----------
  _boca(c, out) {
    if (c === this.jugador) {
      return out.set(0.15, -0.13, -0.62).applyQuaternion(this.render.camara.quaternion).add(this.render.camara.position);
    }
    c.modelo.mano.getWorldPosition(out);
    return out.addScaledVector(c.direccion(_q), 0.55);
  }

  disparar(c) {
    const ars = c.arsenal, a = ars.arma;
    const esJug = c === this.jugador;
    if (!ars.disparar()) {
      if (esJug && a.cargador && ars.municion[ars.tipo] === 0 && !this._antesDisparo) this.audio.vacio();
      return false;
    }
    c.disparoHecho = true;
    if (a.cuerpo) { this._golpe(c, ars.golpeN); return true; }

    c.stats.disparos++;
    _ojo.set(c.pos.x, c.pos.y + c.ojos, c.pos.z);
    if (esJug) _o.copy(this.render.camara.position); else _o.copy(_ojo);
    this._boca(c, _boca);
    if (a.proyectil) {
      c.direccion(_d);
      this.utilidades.cohete(c, _p.copy(_o).addScaledVector(_d, 0.8), _d);
    } else {
      const vel = Math.hypot(c.vel.x, c.vel.z);
      const apunta = c.apuntando && !a.sinApuntar;
      let disp = a.mira && !apunta ? a.dispCadera : a.disp;
      if (!a.mira && apunta) disp *= 0.5;
      disp += (vel / 8) * a.dispMov + (c.suelo ? 0 : 0.025);
      // Daño acumulado por víctima (la escopeta reparte perdigones).
      const golpes = this._golpes || (this._golpes = new Map());
      golpes.clear();
      for (let i = 0; i < a.perdigones; i++) {
        c.direccion(_d);
        _d.x += (Math.random() - 0.5) * 2 * disp; _d.y += (Math.random() - 0.5) * 2 * disp; _d.z += (Math.random() - 0.5) * 2 * disp;
        _d.normalize();
        const tMapa = this.mapa.rayo(_o, _d, a.alcance, _n);
        let tObj = Infinity, zona = null, obj = null;
        for (const v of this.combatientes) {
          if (v === c || !v.vivo || v.equipo === c.equipo || !this.enJuego(v)) continue;
          _q.set(v.pos.x - _o.x, v.pos.y + 1 - _o.y, v.pos.z - _o.z);
          const proy = _q.dot(_d);
          if (proy < 0 || proy > a.alcance || _q.lengthSq() - proy * proy > 2.5) continue;
          const imp = v.cajasImpacto();
          for (const z of ZONAS) {
            const t = rayoEsfera(_o, _d, imp[z], RADIOS[z]);
            if (t < tObj) { tObj = t; zona = z; obj = v; }
          }
        }
        const t = Math.min(tMapa, tObj, a.alcance);
        _p.copy(_o).addScaledVector(_d, t);
        if (i < 3) this.efectos.trazo(_boca, _p, c.aliado ? 0xDCE8FF : 0xFFE3CC);
        if (obj && tObj < tMapa && tObj <= a.alcance) {
          let dano = a.dano * caidaDano(a, tObj);
          if (zona === 'cabeza') dano *= a.cabeza;
          if (zona === 'piernas') dano *= 0.8;
          const g = golpes.get(obj) || { n: 0, cabeza: false };
          g.n += dano; g.cabeza ||= zona === 'cabeza';
          golpes.set(obj, g);
          this.efectos.chispa(_p, null, zona === 'cabeza' ? 0xFFD23F : 0xFFFFFF, 5, 3);
        } else if (tMapa < a.alcance) {
          this.efectos.chispa(_p, _n, 0xFFF1C8, a.perdigones > 1 ? 1 : 4, 3);
        }
      }
      for (const [v, g] of golpes) this.danar(c, v, g.n, { cabeza: g.cabeza, arma: ars.tipo });
    }

    this.audio.disparo(sonidoDe(ars.tipo), esJug ? 0 : this.distOyente(c.pos));
    if (esJug) {
      this.vista.disparo(ars.tipo);
      this.audio.casquillo?.();
      this.tAccion = 4;
      const k = c.apuntando ? 0.55 : 1;
      c.pitch = Math.min(1.45, c.pitch + a.retroceso * k);
      c.yaw += (Math.random() - 0.5) * a.retroceso * 0.6 * k;
      c.retroceso = Math.min(0.08, c.retroceso + a.retroceso * 1.4);
      this.camara.sacudida = Math.min(1, this.camara.sacudida + a.retroceso * 5);
    } else this.efectos.fogonazo(_boca, this.render.camara);
    return true;
  }

  // Disparo solo visual de un jugador remoto (el daño ya lo calcula su máquina).
  _tiroRemoto(c) {
    const a = c.arsenal.arma;
    if (a.cuerpo || a.proyectil) return;
    _o.set(c.pos.x, c.pos.y + c.ojos, c.pos.z);
    this._boca(c, _boca);
    c.direccion(_d);
    const t = Math.min(this.mapa.rayo(_o, _d, a.alcance), a.alcance);
    _p.copy(_o).addScaledVector(_d, t);
    this.efectos.trazo(_boca, _p, c.aliado ? 0xDCE8FF : 0xFFE3CC);
    this.efectos.fogonazo(_boca, this.render.camara);
    this.audio.disparo(sonidoDe(c.arsenal.tipo), this.distOyente(c.pos));
  }

  // Golpe cuerpo a cuerpo: el tercero del combo pega más; por la espalda, daño extra.
  _golpe(c, n) {
    const a = c.arsenal.arma;
    c.golpe = 1; c.golpeN = n;
    if (c === this.jugador) this.vista.tajo(n);
    this.enviarFx({ k: 'tajo', id: c.id, n });
    c.direccion(_d); _d.y = 0; _d.normalize();
    if (c.suelo && a.embestida) { c.vel.x += _d.x * a.embestida; c.vel.z += _d.z * a.embestida; }
    this.audio.katana();
    let mejor = null, md = Infinity;
    for (const o of this.combatientes) {
      if (o === c || !o.vivo || o.equipo === c.equipo || !this.enJuego(o)) continue;
      _q.subVectors(o.pos, c.pos);
      const dist = Math.hypot(_q.x, _q.z);
      if (dist > a.alcance || Math.abs(_q.y) > 1.7) continue;
      const dif = Math.abs(angulo(Math.atan2(-_q.x, -_q.z) - c.yaw));
      if (dif > 0.9 || dist > md) continue;
      md = dist; mejor = o;
    }
    if (!mejor) return;
    const espalda = Math.abs(angulo(mejor.yaw - c.yaw)) < 0.9;
    const final = n === a.combo - 1;
    this.audio.katanaGolpe();
    _p.set(mejor.pos.x, mejor.pos.y + 1.2, mejor.pos.z);
    this.efectos.chispa(_p, null, 0xFFFFFF, 14, 5);
    if (c === this.jugador) this.camara.sacudida = Math.min(1, this.camara.sacudida + 0.25);
    const empuje = a.empuje ? [_d.x * a.empuje * (final ? 1.3 : 0.7), final ? 6 : 3.5, _d.z * a.empuje * (final ? 1.3 : 0.7)] : undefined;
    this.danar(c, mejor, (final ? a.danoFinal : a.dano) * (espalda ? (a.espalda || 1.5) : 1), { arma: c.arsenal.tipo, cabeza: espalda, empuje });
  }

  // ---------- Red ----------
  _mensaje(m) {
    const ahora = performance.now() / 1000;
    if (m.adios) { this._quitarPar(m.p); return; }
    if (!this.online) return;
    let par = this.pares.get(m.p);
    if (!par) {
      par = { t: ahora, j: m.j ?? Date.now() };
      this.pares.set(m.p, par);
      this.ui.estadoRed(red.estado, red.sala, this.pares.size);
    }
    par.t = ahora;
    if (m.j) par.j = m.j;
    if (m.s) for (const e of m.s) this._estadoRemoto(e, ahora, m.p);
    if (m.pt && this._esAnfitrionaPar(m.p)) this._partidaRemota(m.pt);
    if (m.ev) for (const ev of m.ev) this._evento(ev);
  }

  _esAnfitrionaPar(p) {
    let mejor = { j: this.unidoEn, p: red.yo };
    for (const [q, d] of this.pares) if (d.j < mejor.j || (d.j === mejor.j && q < mejor.p)) mejor = { j: d.j, p: q };
    return mejor.p === p;
  }

  // Estado de la partida que manda la anfitriona: { n, r, f, t, m, mp, g, mo, eq }
  _partidaRemota(pt) {
    const j = this.jugador;
    if (pt.mp) this._cargarMapa(pt.mp);
    for (const p in pt.eq) this.asignacion.set(p, pt.eq[p]);
    const mio = pt.eq?.[red.yo];
    if (pt.n !== this.partidaN || pt.r !== this.ronda) {
      const nuevaPartida = pt.n !== this.partidaN;
      this.partidaN = pt.n;
      if (nuevaPartida) { this.listaFeed.length = 0; this.ui.feed(this.listaFeed); for (const c of this.combatientes) { c.bajas = 0; c.muertes = 0; c.danoHecho = 0; } this.jugo = false; }
      this.marcadorEq = pt.m.slice();
      const entra = mio != null && pt.f !== 'fin' && (pt.f === 'preparacion' || j.asignado);
      if (entra) { j.equipo = mio; j.asignado = true; }
      if (this.fase === 'finPartida') { this.ui.empezarPartida(this); this.audio.musica?.('combate'); this.input.pedirBloqueo(); }
      this._nuevaRonda(pt.r);
      if (!entra) {
        // Llega a mitad de ronda: espera mirando hasta la siguiente.
        j.vivo = false; j.tMuerte = 9; j.asesino = null;
        this.ui.toast('Entras en la siguiente ronda');
      }
    }
    this.marcadorEq[0] = pt.m[0]; this.marcadorEq[1] = pt.m[1];
    this.tiempo = pt.t;
    if (pt.k) for (const [id, b, mu, dn] of pt.k) { const c = this.porId(id); if (c) { c.bajas = Math.max(c.bajas, b); c.muertes = Math.max(c.muertes, mu); if (!c.local) c.danoHecho = dn; } }
    if (pt.f === 'combate' && this.fase === 'preparacion') this._aLuchar();
    if (pt.f === 'finRonda' && (this.fase === 'combate' || this.fase === 'preparacion')) this._finRonda(pt.g, pt.mo, false);
    if (pt.f === 'fin' && this.fase !== 'finPartida') this._terminarPartida();
  }

  // e: [id, nombre, equipo (-1 = esperando), variante, x, y, z, yaw, pitch, vida, escudo, banderas, arma, disparos, bajas, muertes, daño]
  _estadoRemoto(e, ahora, par) {
    const [id, nombre, equipo, variante, x, y, z, yaw, pitch, vida, escudo, f, arma, disparos] = e;
    let c = this.porId(id);
    if (!c) {
      c = this._crear({ id, nombre, equipo: Math.max(0, equipo), variante, local: false });
      c.pos.set(x, y, z);
      c.dueno = par;
      c._disparos = disparos;
      c.bajas = e[14] || 0; c.muertes = e[15] || 0;
    }
    if (c.local) return;
    c._visto = ahora;
    c.nombre = nombre;
    c.danoHecho = e[16] || 0;
    const asignado = equipo >= 0;
    if (c.asignado !== asignado || (asignado && c.equipo !== equipo)) { c.asignado = asignado; if (asignado) c.equipo = equipo; this._colores(); }
    c.recibirSnap(ahora, x, y, z, yaw, pitch);
    c.vida = vida; c.escudo = escudo;
    const vivo = !!(f & 1) && asignado;
    if (vivo && !c.vivo) { c.vivo = true; c.modelo.reiniciar(); c.snaps.length = 0; c.recibirSnap(ahora, x, y, z, yaw, pitch); c.pos.set(x, y, z); }
    if (!vivo && c.vivo) { c.vivo = false; c.tMuerte = 0; }
    c.modelo.setVisible(asignado);
    c.suelo = !!(f & 2); c.deslizando = f & 4 ? 0.5 : 0; c.agachado = !!(f & 8);
    const recargando = !!(f & 16);
    c.protegido = f & 32 ? 1 : 0; c.apuntando = !!(f & 64); c.celebra = !!(f & 128);
    if (ARMAS[arma] && c.arsenal.tipo !== arma) { c.arsenal.ranuras[0] = arma; c.arsenal.indice = 0; }
    if (recargando && c.arsenal.recargando <= 0 && c.arsenal.arma.cargador) c.arsenal.recargando = c.arsenal.arma.recarga;
    if (!recargando) c.arsenal.recargando = 0;
    // Disparos nuevos desde el último paquete: los pintamos.
    const n = ((disparos - (c._disparos ?? disparos)) + 256) % 256;
    c._disparos = disparos;
    for (let i = 0; i < Math.min(3, n); i++) this._tiroRemoto(c);
  }

  _quitarPar(p) {
    if (!this.pares.delete(p)) return;
    this.asignacion.delete(p);
    for (const c of [...this.combatientes]) if (!c.local && c.dueno === p) this._quitar(c);
    this.ui.estadoRed(red.estado, red.sala, this.pares.size);
    this._comprobarRonda();
  }

  latidoRed() { this.tRed = 0; this._paqueteRed(0); }

  _paqueteRed(dt) {
    if (!this.online) return;
    const humanos = 1 + this.pares.size;
    const hz = humanos <= 2 ? 12 : humanos <= 4 ? 9 : 6;
    this.tRed -= dt;
    const ahora = performance.now() / 1000;
    for (const [p, d] of this.pares) if (ahora - d.t > 6) this._quitarPar(p);
    // Entidades que su dueño ya no manda (bots retirados).
    for (const c of [...this.combatientes]) if (!c.local && ahora - (c._visto ?? ahora) > 2) this._quitar(c);
    if (this.tRed > 0) return;
    this.tRed = 1 / hz;
    const s = [];
    for (const c of this.combatientes) {
      if (!c.local) continue;
      const f = (c.vivo ? 1 : 0) | (c.suelo ? 2 : 0) | (c.deslizando > 0 ? 4 : 0) | (c.agachado ? 8 : 0)
        | (c.arsenal.recargando > 0 ? 16 : 0) | (c.protegido > 0 ? 32 : 0) | (c.apuntando ? 64 : 0) | (c.celebra ? 128 : 0);
      s.push([c.id, c.nombre, c.asignado ? c.equipo : -1, c.variante, r2(c.pos.x), r2(c.pos.y), r2(c.pos.z), r2(c.yaw), r2(c.pitch),
        Math.ceil(c.vida), Math.ceil(c.escudo), f, c.arsenal.tipo, c.arsenal.disparos, c.bajas, c.muertes, Math.round(c.danoHecho)]);
    }
    const m = { j: this.unidoEn, s };
    if (this.anfitriona && this.partidaN > 0) {
      m.pt = { n: this.partidaN, r: this.ronda, f: this.fase === 'finPartida' ? 'fin' : this.fase, t: Math.round(this.tiempo), m: this.marcadorEq,
        mp: this.mapa.id, g: this.ganadorRonda, mo: this.motivoRonda, eq: Object.fromEntries(this.asignacion) };
      if ((this._tTabla = (this._tTabla || 0) + 1) % 4 === 0 || this.fase !== 'combate') m.pt.k = this.combatientes.map((c) => [c.id, c.bajas, c.muertes, Math.round(c.danoHecho)]);
    }
    red.paquete(m);
  }

  // Anfitriona: reparte a los humanos entre los dos equipos y completa con bots hasta igualarlos.
  _repartir() {
    const humanos = [red.yo, ...this.pares.keys()];
    for (const p of [...this.asignacion.keys()]) if (!humanos.includes(p)) this.asignacion.delete(p);
    // Quien ya jugaba conserva su equipo (también si la anfitriona acaba de cambiar).
    for (const p of humanos) {
      if (this.asignacion.has(p)) continue;
      const c = this.porId(p + ':0');
      if (c && c.asignado && c !== this.jugador) this.asignacion.set(p, c.equipo);
    }
    const cuenta = () => { const n = [0, 0]; for (const e of this.asignacion.values()) n[e]++; return n; };
    for (const p of humanos) {
      if (this.asignacion.has(p)) continue;
      const n = cuenta();
      this.asignacion.set(p, n[0] <= n[1] ? 0 : 1);
    }
    // Si un equipo se queda con dos humanos más que el otro, uno cambia de lado.
    let n = cuenta();
    while (Math.abs(n[0] - n[1]) > 1) {
      const de = n[0] > n[1] ? 0 : 1;
      const p = [...this.asignacion.keys()].reverse().find((q) => this.asignacion.get(q) === de);
      this.asignacion.set(p, 1 - de);
      n = cuenta();
    }
    this.jugador.equipo = this.asignacion.get(red.yo);
    this.jugador.asignado = true;
    const tam = Math.max(1, n[0], n[1]);
    const misBots = [...this.bots.keys()].map((id) => this.porId(id)).filter(Boolean);
    for (const eq of [0, 1]) {
      const bots = misBots.filter((b) => b.equipo === eq);
      let faltan = tam - n[eq] - bots.length;
      while (faltan > 0) { this._crearBot(eq); faltan--; }
      while (faltan < 0) { this._quitar(bots.pop()); faltan++; }
    }
  }

  _gestionarOnline() {
    if (!this.online) return;
    const soy = this.anfitriona;
    if (!soy) {
      for (const id of [...this.bots.keys()]) { const b = this.porId(id); if (b) this._quitar(b); }
      return;
    }
    // Primera partida de la sala (nadie mandaba todavía).
    if (this.partidaN === 0) { this._cargarMapa(this._elegirMapa()); this._nuevaPartida(1); return; }
    // Alguien ha llegado durante la cuenta atrás: entra ya en esta ronda.
    if (this.fase === 'preparacion' && [...this.pares.keys()].some((p) => !this.asignacion.has(p))) this._nuevaRonda(this.ronda);
  }

  _aLuchar() {
    this.fase = 'combate';
    this.audio.cuentaAtras(true);
    this.ui.cuentaAtras(0);
  }

  // ---------- Bucle ----------
  actualizar(dtReal) {
    this.t += dtReal;
    const inp = this.input;
    if (inp.pulsado('pausa')) { if (this.pausado) this.seguir(); else this.pausar(); }
    if (this.pausado && !this.online) return;

    this.camaraLenta = Math.min(1, this.camaraLenta + dtReal * (this.fase === 'finRonda' ? 0.3 : 3));
    const dt = dtReal * this.camaraLenta;

    if (this.fase === 'menu') { this._menu(dtReal); return; }

    inp.actualizar();
    const j = this.jugador;
    const m = inp.consumirMirada(this.camara.fov);
    const controla = j.vivo && j.asignado && this.fase !== 'finPartida' && !this.pausado && !this.orbita;
    if (controla) {
      j.yaw -= m.x;
      j.pitch = Math.max(-1.45, Math.min(1.45, j.pitch - m.y));
    }

    if (this.fase === 'preparacion') {
      const antes = Math.ceil(this.tFase);
      this.tFase -= dtReal;
      if (this.partidaN > 0) {
        if (Math.ceil(this.tFase) !== antes && this.tFase > 0) this.audio.cuentaAtras(false);
        this.ui.cuentaAtras(Math.max(1, Math.ceil(this.tFase)));
        if (this.tFase <= 0 && (this.anfitriona || this.tFase < -1.5)) this._aLuchar();
      }
    }

    const combate = this.fase === 'combate';
    if (combate && j.vivo) this.jugo = true;
    const I = this._intent || (this._intent = {});
    const mover = combate && controla;
    I.x = mover ? inp.mover.x : 0; I.y = mover ? inp.mover.y : 0;
    I.saltar = mover && inp.pulsado('saltar');
    I.deslizar = mover && inp.pulsado('deslizar');
    I.agachar = mover && inp.agachar;
    I.esprintar = inp.esprintar && !inp.disparando;
    const a = j.arsenal.arma;
    const apunta = inp.apuntando && controla && combate && !a.cuerpo && !a.sinApuntar && j.arsenal.recargando <= 0 && j.arsenal.cambiando <= 0;
    j.apuntando = apunta;
    if (combate && controla) this._controlesArma(j);
    else {
      // Eliminado: clic para cambiar de compañero al que mirar.
      if (!j.vivo && inp.disparando && !this._antesDisparo) this._siguienteEspectado();
      this._antesDisparo = inp.disparando;
      for (const k of ['r1', 'r2', 'r3', 'siguiente', 'anterior', 'recargar', 'util', 'inspeccionar', 'saltar', 'deslizar']) inp.pulsado(k);
    }
    this.ui.tabla(inp.tabla ? this : null);

    // Entidades locales: física y tiempos. Remotas: interpolación.
    const ahora = performance.now() / 1000;
    for (const c of this.combatientes) {
      if (c.local) {
        let intent = c === j ? I : null;
        const bot = this.bots.get(c.id);
        if (bot) {
          intent = bot.pensar(dt, this);
          c.apuntando = intent.apuntar && c.vivo && !c.arsenal.arma.cuerpo;
          if (combate && c.vivo) {
            if (intent.util) this.utilidades.usar(c);
            if (intent.disparar) this.disparar(c);
          }
        }
        if (!intent || !this.enJuego(c)) continue;
        c.fisica(dt, intent, this.mapa, this.audio, c === j);
        c.arsenal.actualizar(dt);
        c.tiempos(dt);
        if (c === j && c.aterrizaje < -3) this.vista.aterrizar(c.aterrizaje);
      } else {
        c.interpolar(ahora, dt);
        c.golpe = Math.max(0, c.golpe - dt * 3.5);
        c.usando = Math.max(0, c.usando - dt * 2.5);
        c.flinch = Math.max(0, c.flinch - dt * 5);
        if (c.arsenal.recargando > 0) c.arsenal.recargando = Math.max(0.01, c.arsenal.recargando - dt);
        if (!c.vivo) c.tMuerte += dt;
      }
    }
    this.utilidades.actualizar(dt);
    this.mapa.actualizar(this.t, dt);

    if (combate) {
      this.tiempo = Math.max(0, this.tiempo - dt);
      if (this.anfitriona) {
        if (this.tiempo <= 0) this._finPorTiempo();
        else if (this.online) this._comprobarRonda();
      }
    } else if (this.fase === 'finRonda') {
      this.tFase -= dtReal;
      if (this.tFase <= 0 && this.anfitriona) {
        if (Math.max(...this.marcadorEq) >= RONDAS_PARA_GANAR) this._terminarPartida();
        else this._nuevaRonda(this.ronda + 1);
      }
    } else if (this.fase === 'finPartida') {
      this.tFase -= dtReal;
      if (this.online && this.anfitriona && this.tFase <= 0) {
        this._cargarMapa(this._elegirMapa());
        this._nuevaPartida(this.partidaN + 1);
        this.ui.empezarPartida(this);
        this.audio.musica?.('combate');
        this.input.pedirBloqueo();
      }
    }
    this._gestionarOnline();
    this._paqueteRed(dtReal);

    // Música: sube de intensidad cuando hay acción y avisa con latido si queda poca vida.
    this.tAccion = Math.max(0, (this.tAccion || 0) - dtReal);
    this.audio.intensidad?.(combate ? 0.35 + Math.min(1, this.tAccion / 3) * 0.65 : 0.2);
    this.audio.pocaVida?.(combate && j.vivo && j.vida <= 30);

    this._camara(dtReal, dt, j, apunta, m);
    this.efectos.actualizar(dt);
    actualizarFrustum(this.render.camara);
    this._etiquetas(dtReal);
    for (const c of this.combatientes) if (c !== j || this.orbita) c.actualizarModelo(dt, this.render.camara);
    this.ui.hud(this, apunta);
  }

  _finPorTiempo() {
    // Gana el equipo con más supervivientes; si empatan, el que conserve más vida.
    const suma = [0, 0], vivos = [this.vivosDe(0), this.vivosDe(1)];
    for (const c of this.combatientes) if (this.enJuego(c) && c.vivo) suma[c.equipo] += c.vida;
    const g = vivos[0] !== vivos[1] ? (vivos[0] > vivos[1] ? 0 : 1) : suma[0] !== suma[1] ? (suma[0] > suma[1] ? 0 : 1) : null;
    this._finRonda(g, 'tiempo');
  }

  _siguienteEspectado() {
    const j = this.jugador;
    const op = this.combatientes.filter((c) => c !== j && c.vivo && this.enJuego(c) && (c.aliado || !j.asignado));
    if (!op.length) { this.espectando = null; return; }
    this.espectando = op[(op.indexOf(this.espectando) + 1) % op.length];
    this.ui.espectar(this.espectando.nombre);
  }

  _camara(dtReal, dt, j, apunta, mirada) {
    const cam = this.render.camara;
    let verVista = false;
    // Toma final de la ronda: la cámara gira alrededor del último eliminado.
    if (this.orbita) {
      const o = this.orbita;
      o.t += dtReal;
      if (o.t > 2.6 || this.fase !== 'finRonda') { this.orbita = null; j.modelo.setVisible(false); }
      else {
        const ang = o.a0 + o.t * 0.8;
        _o.set(o.centro.x, o.centro.y + 1.1, o.centro.z);
        _d.set(Math.sin(ang), 0.25, Math.cos(ang)).normalize();
        const t = this.mapa.rayo(_o, _d, 4.4);
        cam.position.copy(_o).addScaledVector(_d, t === Infinity ? 4 : Math.max(0.8, t - 0.35));
        cam.lookAt(o.centro.x, o.centro.y + 0.7, o.centro.z);
        this._fov(62, dtReal);
        j.modelo.setVisible(j.asignado);
        this.vista.actualizar(dt, j, { apunta: false, mirada, visible: false });
        this.render.seguirSombra(o.centro);
        return;
      }
    }
    if (!j.vivo && (j.tMuerte > 1.4 || !j.asignado) && this.fase !== 'finPartida') {
      // Eliminado: cámara en tercera persona detrás de un compañero.
      if (!this.espectando || !this.espectando.vivo) this._siguienteEspectado();
      const e = this.espectando;
      if (e) {
        _o.set(e.pos.x, e.pos.y + e.ojos, e.pos.z);
        e.direccion(_d);
        _q.copy(_d).multiplyScalar(-1); _q.y += 0.25; _q.normalize();
        const t = this.mapa.rayo(_o, _q, 3.4);
        cam.position.copy(_o).addScaledVector(_q, t === Infinity ? 3 : Math.max(0.4, t - 0.3));
        cam.rotation.set(e.pitch * 0.7, e.yaw, 0, 'YXZ');
        this._fov(this.camara.fovBase, dtReal);
        this.render.seguirSombra(e.pos);
        this.vista.actualizar(dt, j, { apunta: false, mirada, visible: false });
        return;
      }
    }
    this.camara.actualizar(dtReal, j, apunta, j.arsenal.arma.zoom || 60, j.asesino);
    verVista = j.vivo && j.asignado && !(apunta && j.arsenal.arma.mira) && this.fase !== 'finPartida';
    this.vista.actualizar(dt, j, { apunta, mirada, visible: verVista });
    this.render.seguirSombra(j.pos);
  }

  _fov(v, dt) {
    const cam = this.render.camara;
    this.camara.fov += (v - this.camara.fov) * Math.min(1, dt * 10);
    if (Math.abs(cam.fov - this.camara.fov) > 0.01) { cam.fov = this.camara.fov; cam.updateProjectionMatrix(); }
  }

  // Nombres sobre la cabeza: compañeros siempre que estén a la vista; rivales solo si los ves de verdad.
  _etiquetas(dt) {
    this.tEtiquetas -= dt;
    if (this.tEtiquetas > 0) return;
    this.tEtiquetas = 0.2;
    const cam = this.render.camara.position;
    for (const c of this.combatientes) {
      if (c === this.jugador) continue;
      _p.set(c.pos.x, c.pos.y + 1.9, c.pos.z);
      const ver = c.vivo && this.enJuego(c) && c !== this.espectando && cam.distanceTo(_p) < 60 && this.ve(cam, _p);
      c.modelo.setEtiqueta(ver ? c.nombre : null, css(c.aliado ? 0x8FB2FF : 0xFFB27A));
    }
  }

  _controlesArma(j) {
    const inp = this.input, ars = j.arsenal;
    for (let i = 1; i <= 3; i++) if (inp.pulsado('r' + i) && ars.cambiar(i - 1)) this.audio.cambiarArma();
    if (inp.pulsado('siguiente') && ars.cambiar((ars.indice + 1) % 3)) this.audio.cambiarArma();
    if (inp.pulsado('anterior') && ars.cambiar((ars.indice + 2) % 3)) this.audio.cambiarArma();
    if (inp.pulsado('recargar') && ars.recargar()) this.audio.recarga();
    if (inp.pulsado('inspeccionar') && ars.listo()) this.vista.inspeccionar();
    if (inp.pulsado('util')) {
      if (this.utilidades.usar(j)) this.ui.utilUsada();
      else { this.audio.vacio(); this.ui.utilNoLista(); }
    }
    const quiere = inp.disparando;
    const a = ars.arma;
    if (quiere && (a.auto || !this._antesDisparo)) this.disparar(j);
    if (a.cargador && ars.municion[ars.tipo] === 0 && ars.recargando <= 0 && ars.enfriamiento <= 0 && ars.cambiando <= 0) {
      if (ars.recargar()) this.audio.recarga();
    }
    this._antesDisparo = quiere;
  }

  // Menú: tu duelista posa con su arma principal y la cámara se mece despacio.
  _menu(dt) {
    const cam = this.render.camara;
    const j = this.jugador;
    const a = this.mapa.aparicion(0, 1);
    j.pos.copy(a.pos);
    j.vel.set(0, 0, 0);
    const frente = a.yaw;
    j.yaw = frente + 0.25 + Math.sin(this.t * 0.5) * 0.12;
    j.pitch = Math.sin(this.t * 0.8) * 0.06;
    j.modelo.setVisible(true);
    const ang = frente + Math.PI + Math.sin(this.t * 0.15) * 0.3;
    // La cámara se coloca delante del personaje (que mira a -Z local).
    cam.position.set(j.pos.x + Math.sin(ang) * 3.4, j.pos.y + 1.4 + Math.sin(this.t * 0.3) * 0.08, j.pos.z + Math.cos(ang) * 3.4);
    cam.lookAt(j.pos.x, j.pos.y + 1.05, j.pos.z);
    if (cam.fov !== 50) { cam.fov = 50; cam.updateProjectionMatrix(); }
    this.camara.fov = 50;
    this.vista.raiz.visible = false;
    actualizarFrustum(cam);
    this.efectos.actualizar(dt);
    this.mapa.actualizar(this.t, dt);
    j.actualizarModelo(dt, cam);
    this.render.seguirSombra(j.pos);
  }
}

// Sonido de disparo según el arma (reutiliza las familias que ya existen en audio.js).
function sonidoDe(id) {
  return { vector: 'rifle', trueno: 'escopeta', aguja: 'franco', avispa: 'subfusil', cometa: 'escopeta', chispa: 'pistola', sentencia: 'franco', eco: 'pistola' }[id] || 'rifle';
}

export { VIDA_MAX };
