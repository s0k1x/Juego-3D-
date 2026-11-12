// Núcleo: partida «todos contra todos» con reaparición rápida, disparos, poderes, granadas, katana
// y multijugador. Cada máquina es dueña de sus entidades (su jugador y, si es la anfitriona, los bots):
// las simula, les aplica el daño que recibe y difunde su estado. Quien dispara calcula el impacto
// sobre lo que ve (a favor del que dispara) y se lo pide al dueño de la víctima.
import * as THREE from 'three';
import { Mapa } from './mapa.js';
import { Combatiente, Camara, angulo, VIDA_MAX } from './jugador.js';
import { Bot } from './bots.js';
import { ARMAS, caidaDano, geometriaArma } from './armas.js';
import { Efectos } from './efectos.js';
import { Personaje, actualizarFrustum } from './personaje.js';
import { materialContorno } from './render.js';
import { Vista } from './vista.js';
import { Poderes, rayoEsfera } from './poderes.js';
import { HEROES, LISTA_HEROES } from './heroes.js';
import { datos } from './datos.js';
import { red } from './red.js';

export const LIMITE_BAJAS = 20;
const DURACION = 300;
const REAPARICION = 3;
const NOMBRES_BOT = ['Rin', 'Sora', 'Haru', 'Mei', 'Ren', 'Aoi', 'Kenji', 'Nao', 'Hina', 'Taro'];
const RADIOS = { cabeza: 0.21, pecho: 0.34, piernas: 0.3 };
const ZONAS = ['cabeza', 'pecho', 'piernas'];
const LISTA_ARMAS = ['rifle', 'escopeta', 'franco', 'subfusil', 'pistola', 'katana', 'granada'];

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _n = new THREE.Vector3();
const _boca = new THREE.Vector3(), _ojo = new THREE.Vector3(), _q = new THREE.Vector3();
const r2 = (v) => Math.round(v * 100) / 100;

export class Juego {
  constructor({ render, input, audio, ui }) {
    this.render = render; this.input = input; this.audio = audio; this.ui = ui;
    const escena = render.escena;
    this.mapa = new Mapa(escena);
    this.efectos = new Efectos(escena);
    this.camara = new Camara(render.camara);
    this.vista = new Vista(render.escenaVista);
    this.poderes = new Poderes(this);
    this.red = red;
    red.alMensaje = (m) => this._mensaje(m);
    red.alEstado = (e) => this.ui.estadoRed(e, red.sala, this.pares?.size ?? 0);

    this.config = { heroe: 'sakura', nombre: 'Tú', dificultad: 'normal', bots: 5 };
    this.combatientes = [];
    this.indice = new Map();
    this.bots = new Map();
    this.pares = new Map();
    this.jugador = this._crear({ id: red.yo + ':0', nombre: 'Tú', heroe: 'sakura', local: true });
    this.jugador.modelo.setVisible(false);

    this.fase = 'menu';
    this.online = false;
    this.pausado = false;
    this.t = 0;
    this.camaraLenta = 1;
    this.partidaN = 0;
    this.tiempo = DURACION;
    this.feed = [];
    this.tRed = 0;
    this.tEtiquetas = 0;
    this.unidoEn = 0;
    this.multi = { n: 0, t: 0 };

    this.granadas = Array.from({ length: 8 }, () => {
      const g = geometriaArma('granada');
      const m = new THREE.Mesh(g.malla, this.jugador.modelo.material);
      m.add(new THREE.Mesh(g.contorno, materialContorno));
      m.visible = false;
      escena.add(m);
      return { activa: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), t: 0, dueno: null, malla: m };
    });
    this._antesDisparo = false;
    this.maniquies = [];
    this._prepararMenu();
  }

  // ---------- Entidades ----------
  _crear({ id, nombre, heroe, local }) {
    const c = new Combatiente(this.render.escena, { id, nombre, heroe, local });
    this.combatientes.push(c);
    this.indice.set(id, c);
    return c;
  }

  _quitar(c) {
    c.destruir();
    this.combatientes.splice(this.combatientes.indexOf(c), 1);
    this.indice.delete(c.id);
    this.bots.delete(c.id);
  }

  porId(id) { return this.indice.get(id); }
  esLocal(c) { return !!c && c.local; }
  distOyente(p) { return p.distanceTo(this.render.camara.position) < 1 ? 0 : p.distanceTo(this.render.camara.position); }
  rivalesDe(c) { return this.combatientes.filter((o) => o !== c); }

  _crearBot(heroe) {
    const usados = new Set(this.combatientes.map((c) => c.nombre.split(' ')[0]));
    const libres = NOMBRES_BOT.filter((n) => !usados.has(n));
    const nombre = (libres.length ? libres : NOMBRES_BOT)[(Math.random() * (libres.length || NOMBRES_BOT.length)) | 0];
    const id = `${red.yo}:b${(this._nBot = (this._nBot || 0) + 1)}`;
    const c = this._crear({ id, nombre: this.online ? nombre + ' (bot)' : nombre, heroe, local: true });
    const b = new Bot(c, this.config.dificultad);
    this.bots.set(id, b);
    this._aparecer(c);
    c.protegido = 0.5;
    return c;
  }

  _heroeBot() {
    // Reparte héroes para que haya variedad.
    const cuenta = {};
    for (const h of LISTA_HEROES) cuenta[h] = 0;
    for (const c of this.combatientes) cuenta[c.heroe]++;
    const min = Math.min(...Object.values(cuenta));
    const op = LISTA_HEROES.filter((h) => cuenta[h] === min);
    return op[(Math.random() * op.length) | 0];
  }

  _aparecer(c) {
    if (c.proximoHeroe && c.proximoHeroe !== c.heroe) { c.setHeroe(c.proximoHeroe); if (c === this.jugador) c.modelo.setVisible(false); }
    c.proximoHeroe = null;
    const a = this.mapa.aparicionLibre(this.rivalesDe(c));
    c.reiniciar(a.pos, a.yaw);
    this.bots.get(c.id)?.reiniciar();
    if (c === this.jugador) { this.audio.reaparecer(); this.ui.reaparecer(); this.vista.setHeroe(c.H.estilo, c.H.color); }
  }

  // ---------- Flujo de partida ----------
  _prepararMenu() {
    this.fase = 'menu';
    this.camaraLenta = 1;
    for (const c of [...this.combatientes]) if (c !== this.jugador) this._quitar(c);
    this.jugador.setHeroe(this.config.heroe);
    this.jugador.reiniciar(new THREE.Vector3(3.8, 0, 14), 0);
    this.jugador.modelo.setVisible(true);
    this.poderes.limpiar();
    this.mapa.limpiarDinamicas();
    for (const g of this.granadas) { g.activa = false; g.malla.visible = false; }
    this._maniquies(true);
  }

  // Los otros héroes posan en el menú detrás del elegido.
  _maniquies(ver) {
    if (ver && !this.maniquies.length) {
      for (const h of LISTA_HEROES) {
        const p = new Personaje(this.render.escena, HEROES[h].estilo);
        p.heroe = h;
        p.ponerArma(HEROES[h].arma);
        this.maniquies.push(p);
      }
    }
    for (const m of this.maniquies) m.setVisible(ver && m.heroe !== this.config.heroe);
  }

  cambiarHeroe(h) {
    this.config.heroe = h;
    if (this.fase === 'menu' || this.fase === 'finPartida') {
      this.jugador.setHeroe(h);
      this.jugador.modelo.setVisible(true);
      this._maniquies(true);
    } else {
      this.jugador.proximoHeroe = h;
      if (!this.jugador.vivo || this.fase === 'preparacion') this.ui.aviso(`Próximo héroe: ${HEROES[h].nombre}`, 'Al reaparecer', 'empate');
      else this.ui.aviso(`${HEROES[h].nombre} al reaparecer`, '', 'empate');
    }
  }

  // Partida contra bots (sin conexión).
  empezarPartida() {
    if (this.online) red.salir();
    this.online = false;
    this._iniciar();
    for (let i = 0; i < this.config.bots; i++) this._crearBot(this._heroeBot());
  }

  // Partida online. tipo: 'supabase' | 'local'.
  async unirseOnline(sala, tipo = 'supabase') {
    this.ui.conectando(sala);
    try {
      await red.conectar(sala, tipo);
    } catch (e) {
      console.warn('Sin conexión online:', e?.message);
      this.ui.errorRed('No se ha podido conectar con la sala. Revisa tu conexión o juega contra bots.');
      return false;
    }
    this.online = true;
    this.pares.clear();
    this.unidoEn = Date.now();
    this._iniciar();
    this.partidaN = 0; // se adopta la de la anfitriona en cuanto llegue
    red.avisarWeb('online', { sala });
    return true;
  }

  _iniciar() {
    this._maniquies(false);
    for (const c of [...this.combatientes]) if (c !== this.jugador) this._quitar(c);
    this.jugador.nombre = this.config.nombre || 'Tú';
    this.jugador.setHeroe(this.config.heroe);
    this.jugador.modelo.setVisible(false);
    this.vista.setHeroe(this.jugador.H.estilo, this.jugador.H.color);
    this.poderes.limpiar();
    this.mapa.limpiarDinamicas();
    for (const g of this.granadas) { g.activa = false; g.malla.visible = false; }
    this._nuevaPartida(this.online ? 0 : this.partidaN + 1);
    this.ui.empezarPartida(this);
    this.input.activo = true;
    this.input.pedirBloqueo();
    red.avisarWeb('inicio');
  }

  _nuevaPartida(n) {
    this.partidaN = n;
    this.tiempo = DURACION;
    this.fase = 'preparacion';
    this.tFase = 2.5;
    this.feed.length = 0;
    this.ganador = null;
    this.camaraLenta = 1;
    for (const c of this.combatientes) {
      c.bajas = 0; c.muertes = 0; c.racha = 0; c.carga = 0;
      c.stats = { disparos: 0, aciertos: 0, cabezas: 0, dano: 0 };
      if (this.esLocal(c)) this._aparecer(c);
    }
    this.multi.n = 0;
    this.ui.nuevaPartida(this);
  }

  _terminarPartida(ganadorId) {
    if (this.fase === 'finPartida') return;
    this.fase = 'finPartida';
    this.tFase = 10;
    this.ganador = ganadorId;
    const g = this.porId(ganadorId);
    const gano = ganadorId === this.jugador.id;
    if (gano) this.audio.victoriaFinal(); else this.audio.derrotaRonda();
    this.camaraLenta = 0.3;
    const ranking = this.ranking();
    const puesto = ranking.indexOf(this.jugador) + 1;
    const resumen = datos.registrarPartida({ gano, bajas: this.jugador.bajas, muertes: this.jugador.muertes });
    this.input.soltarBloqueo();
    this.ui.finPartida({ gano, ganador: g?.nombre ?? '—', ranking, jugador: this.jugador, puesto, resumen, online: this.online });
    red.avisarWeb('fin', { gano, puesto, bajas: this.jugador.bajas });
  }

  ranking() {
    return [...this.combatientes].sort((a, b) => b.bajas - a.bajas || a.muertes - b.muertes);
  }

  revancha() {
    if (this.online) return;
    this._iniciar();
    for (let i = 0; i < this.config.bots; i++) this._crearBot(this._heroeBot());
  }

  pausar() {
    if (this.pausado || !['preparacion', 'combate'].includes(this.fase)) return;
    this.pausado = true;
    this.input.limpiar();
    this.input.soltarBloqueo();
    this.ui.pausa(true, this.online);
  }

  seguir() {
    if (!this.pausado) return;
    this.pausado = false;
    this.input.limpiar();
    this.input.pedirBloqueo();
    this.ui.pausa(false);
  }

  salirAlMenu() {
    this.pausado = false;
    this.input.activo = false;
    this.input.soltarBloqueo();
    if (this.online) { red.salir(); this.online = false; this.pares.clear(); }
    this._prepararMenu();
    this.ui.menu();
  }

  // ---------- Daño ----------
  // Lo llama quien causa el daño (en su máquina).
  danar(atacante, victima, dano, info = {}) {
    if (!victima || !victima.vivo || victima.protegido > 0) return;
    dano = Math.max(1, Math.round(dano));
    const letal = dano >= victima.vida + victima.escudo;
    if (atacante && this.esLocal(atacante) && atacante !== victima) {
      atacante.stats.aciertos++;
      atacante.stats.dano += dano;
      if (info.cabeza) atacante.stats.cabezas++;
      atacante.carga = Math.min(100, atacante.carga + dano * 0.28);
      if (atacante === this.jugador) {
        this.audio.impacto(info.cabeza);
        this.ui.impacto(dano, info.cabeza, letal);
      }
    }
    if (this.esLocal(victima)) this.recibirDano(atacante?.id, victima, dano, info, atacante?.pos);
    else red.evento({ k: 'd', a: atacante?.id, v: victima.id, n: dano, c: info.cabeza ? 1 : 0, w: info.arma, e: info.empuje });
  }

  // Lo ejecuta el dueño de la víctima.
  recibirDano(atacanteId, v, dano, info = {}, desde) {
    if (!v.vivo) return;
    if (this.fase !== 'combate') return;
    const muere = v.danar(dano, desde);
    if (info.empuje && v.vivo !== undefined) { v.vel.x += info.empuje[0]; v.vel.y += info.empuje[1]; v.vel.z += info.empuje[2]; v.suelo = false; }
    if (v === this.jugador) {
      this.audio.dano();
      this.camara.sacudida = Math.min(1, this.camara.sacudida + 0.3);
      this.ui.recibirDano(angulo(v.dirGolpe - v.yaw), dano);
    }
    if (muere) this._emitir({ k: 'm', v: v.id, a: atacanteId, c: info.cabeza ? 1 : 0, w: info.arma || 'arma' });
  }

  // Evento que se procesa aquí y se manda a los demás.
  _emitir(ev) { if (this.online) red.evento(ev); this._evento(ev, true); }
  enviarFx(ev) { if (this.online) red.evento(ev); }

  _evento(ev, propio = false) {
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
      case 'poder': {
        const c = this.porId(ev.id);
        if (c && !propio) this.poderes.ejecutar(c, ev.h, ev.d, false);
        break;
      }
      case 'gr': {
        const c = this.porId(ev.id);
        if (c) this._granadaVisual(c, _o.set(...ev.o), _d.set(...ev.v));
        break;
      }
      case 'tajo': {
        const c = this.porId(ev.id);
        if (c) { c.golpeKatana = 1; c.katanaLado = -c.katanaLado; this.audio.katana(); }
        break;
      }
    }
  }

  _baja({ v: vid, a: aid, c: cabeza, w }) {
    const v = this.porId(vid), a = this.porId(aid);
    if (v) {
      v.vivo = false; v.muertes++; v.racha = 0; v.asesino = a && a !== v ? a : null;
      if (!this.esLocal(v)) { v.vida = 0; v.tMuerte = 0; }
    }
    if (a && a !== v) { a.bajas++; a.racha++; }
    this.feed.unshift({ a: a?.nombre ?? '', ah: a?.heroe, v: v?.nombre ?? '?', vh: v?.heroe, w, cabeza: !!cabeza, yo: a === this.jugador || v === this.jugador, t: this.t });
    if (this.feed.length > 5) this.feed.length = 5;
    this.ui.feed(this.feed);
    if (a === this.jugador && v !== this.jugador) {
      this.multi.n = this.t - this.multi.t < 4 ? this.multi.n + 1 : 1;
      this.multi.t = this.t;
      this.audio.baja(this.multi.n);
      this.ui.baja(v?.nombre, !!cabeza, this.multi.n, a.racha);
    }
    if (v === this.jugador) {
      this.audio.muerte();
      this.ui.muerto(a && a !== v ? a : null, REAPARICION);
    }
    // La anfitriona (o la partida sin conexión) decide el final.
    if (this.anfitriona && a && a.bajas >= LIMITE_BAJAS && this.fase === 'combate') this._terminarPartida(a.id);
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
    if (!ars.disparar(c.ult > 0 && c.heroe === 'sakura' ? 0.8 : 1)) {
      if (esJug && a.cargador && ars.municion[ars.tipo] === 0 && !this._antesDisparo) this.audio.vacio();
      return false;
    }
    c.disparoHecho = true;
    c.protegido = 0;
    if (a.cuerpo) { this._katana(c); return true; }
    if (a.lanzable) { this.lanzarGranada(c, 0.3); return true; }

    c.stats.disparos++;
    _ojo.set(c.pos.x, c.pos.y + c.ojos, c.pos.z);
    if (esJug) _o.copy(this.render.camara.position); else _o.copy(_ojo);
    const vel = Math.hypot(c.vel.x, c.vel.z);
    const apunta = esJug && this.input.apuntando;
    let disp = a.mira && !apunta && esJug ? a.dispCadera : a.disp;
    if (!a.mira && apunta) disp *= 0.55;
    disp += (vel / 8) * a.dispMov + (c.suelo ? 0 : 0.025);
    this._boca(c, _boca);
    const mult = c.ult > 0 && c.heroe === 'sakura' ? 1.5 : 1;

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
        if (v === c || !v.vivo) continue;
        // Descarte rápido por distancia al rayo.
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
      if (i < 3) this.efectos.trazo(_boca, _p, esJug ? 0xFFF1C8 : 0xFFD7E6);
      if (obj && tObj < tMapa && tObj <= a.alcance) {
        let dano = a.dano * caidaDano(a, tObj) * mult;
        if (zona === 'cabeza') dano *= a.cabeza;
        if (zona === 'piernas') dano *= 0.8;
        const g = golpes.get(obj) || { n: 0, cabeza: false };
        g.n += dano; g.cabeza ||= zona === 'cabeza';
        golpes.set(obj, g);
        this.efectos.chispa(_p, null, 0xFF8FB8, 5, 3);
      } else if (tMapa < a.alcance) {
        this.efectos.chispa(_p, _n, 0xFFE6A8, a.perdigones > 1 ? 1 : 4, 3);
      }
    }
    for (const [v, g] of golpes) this.danar(c, v, g.n, { cabeza: g.cabeza, arma: ars.tipo });

    this.audio.disparo(ars.tipo, esJug ? 0 : this.distOyente(c.pos));
    if (esJug) {
      this.vista.disparo(ars.tipo);
      const k = apunta ? 0.55 : 1;
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
    if (a.cuerpo || a.lanzable) return;
    _o.set(c.pos.x, c.pos.y + c.ojos, c.pos.z);
    this._boca(c, _boca);
    c.direccion(_d);
    const t = Math.min(this.mapa.rayo(_o, _d, a.alcance), a.alcance);
    _p.copy(_o).addScaledVector(_d, t);
    this.efectos.trazo(_boca, _p, 0xFFD7E6);
    this.efectos.fogonazo(_boca, this.render.camara);
    this.audio.disparo(c.arsenal.tipo, this.distOyente(c.pos));
  }

  _katana(c) {
    c.golpeKatana = 1;
    c.katanaLado = -c.katanaLado;
    if (c === this.jugador) this.vista.tajo();
    this.enviarFx({ k: 'tajo', id: c.id });
    c.direccion(_d); _d.y = 0; _d.normalize();
    if (c.suelo) { c.vel.x += _d.x * 7; c.vel.z += _d.z * 7; }
    this.audio.katana();
    let mejor = null, md = Infinity;
    for (const o of this.combatientes) {
      if (o === c || !o.vivo) continue;
      _q.subVectors(o.pos, c.pos);
      const dist = Math.hypot(_q.x, _q.z);
      if (dist > ARMAS.katana.alcance || Math.abs(_q.y) > 1.7) continue;
      const dif = Math.abs(angulo(Math.atan2(-_q.x, -_q.z) - c.yaw));
      if (dif > 0.85 || dist > md) continue;
      md = dist; mejor = o;
    }
    if (!mejor) return;
    const espalda = Math.abs(angulo(mejor.yaw - c.yaw)) < 0.9;
    this.audio.katanaGolpe();
    _p.set(mejor.pos.x, mejor.pos.y + 1.2, mejor.pos.z);
    this.efectos.chispa(_p, null, 0xFFFFFF, 14, 5);
    const mult = c.ult > 0 && c.heroe === 'sakura' ? 1.5 : 1;
    this.danar(c, mejor, ARMAS.katana.dano * (espalda ? 1.7 : 1) * mult, { arma: 'katana', cabeza: espalda });
  }

  lanzarGranada(c, elevacion = 0.3) {
    if (c.arsenal.tipo !== 'granada') {
      if (c.arsenal.granadas <= 0) return;
      c.arsenal.granadas--;
    }
    c.direccion(_d);
    _d.y += elevacion; _d.normalize();
    _o.set(c.pos.x, c.pos.y + c.ojos - 0.1, c.pos.z).addScaledVector(_d, 0.6);
    _q.copy(_d).multiplyScalar(16).add(c.vel);
    this._granadaVisual(c, _o, _q);
    this.enviarFx({ k: 'gr', id: c.id, o: [r2(_o.x), r2(_o.y), r2(_o.z)], v: [r2(_q.x), r2(_q.y), r2(_q.z)] });
    if (c === this.jugador) this.vista.granada();
    if (c.arsenal.tipo === 'granada') c.arsenal.cambiar(c.arsenal.anterior === 3 ? 0 : c.arsenal.anterior);
  }

  _granadaVisual(c, pos, vel) {
    const g = this.granadas.find((x) => !x.activa);
    if (!g) return;
    g.activa = true; g.t = 0; g.dueno = c;
    g.pos.copy(pos); g.vel.copy(vel);
    g.malla.visible = true;
    this.audio.granadaLanzar();
  }

  _granadas(dt) {
    for (const g of this.granadas) {
      if (!g.activa) continue;
      g.t += dt;
      g.vel.y -= 20 * dt;
      for (const k of ['x', 'y', 'z']) {
        const antes = g.pos[k];
        g.pos[k] += g.vel[k] * dt;
        for (const b of this.mapa.cercanas(g.pos.x - 0.3, g.pos.z - 0.3, g.pos.x + 0.3, g.pos.z + 0.3, _cajasG)) {
          if (g.pos.x < b.min.x - 0.07 || g.pos.x > b.max.x + 0.07 || g.pos.y < b.min.y - 0.07 || g.pos.y > b.max.y + 0.07 || g.pos.z < b.min.z - 0.07 || g.pos.z > b.max.z + 0.07) continue;
          g.pos[k] = antes;
          g.vel[k] *= -0.35;
          if (k === 'y') { g.vel.x *= 0.7; g.vel.z *= 0.7; }
          break;
        }
      }
      g.malla.position.copy(g.pos);
      g.malla.rotation.x += dt * 8;
      if (g.t >= ARMAS.granada.mecha) this._explotar(g);
    }
  }

  _explotar(g) {
    g.activa = false; g.malla.visible = false;
    const a = ARMAS.granada;
    this.efectos.explosion(g.pos, a.radio);
    const dj = this.distOyente(g.pos);
    this.audio.explosion(dj);
    this.camara.sacudida = Math.min(1, this.camara.sacudida + Math.max(0, 1 - dj / 18));
    if (!this.esLocal(g.dueno) || this.fase !== 'combate') return;
    for (const c of this.combatientes) {
      if (!c.vivo) continue;
      _p.set(c.pos.x, c.pos.y + 1, c.pos.z);
      const d = _p.distanceTo(g.pos);
      if (d > a.radio) continue;
      _o.copy(g.pos); _o.y += 0.2;
      if (!this.mapa.visible(_o, _p)) continue;
      let dano = a.dano * Math.pow(1 - d / a.radio, 0.7);
      if (c === g.dueno) dano *= 0.4;
      if (dano > 1) this.danar(g.dueno, c, dano, { arma: 'granada', empuje: [(_p.x - g.pos.x) / (d || 1) * 6, 4, (_p.z - g.pos.z) / (d || 1) * 6] });
    }
  }

  // ---------- Red ----------
  _mensaje(m) {
    const ahora = performance.now() / 1000;
    let par = this.pares.get(m.p);
    if (m.adios) { this._quitarPar(m.p); return; }
    if (!this.online) return;
    if (!par) {
      par = { t: ahora, j: m.j ?? Date.now(), nombre: '' };
      this.pares.set(m.p, par);
      this.ui.estadoRed(red.estado, red.sala, this.pares.size);
    }
    par.t = ahora;
    if (m.j) par.j = m.j;
    // Estado de la partida (lo manda la anfitriona).
    if (m.pt && this._esAnfitrionaPar(m.p)) this._partidaRemota(m.pt);
    if (m.s) {
      const vistos = par.ents || (par.ents = new Set());
      for (const e of m.s) this._estadoRemoto(e, ahora, m.p, vistos);
    }
    if (m.ev) for (const ev of m.ev) this._evento(ev);
  }

  _esAnfitrionaPar(p) {
    let mejor = { j: this.unidoEn, p: red.yo };
    for (const [q, d] of this.pares) if (d.j < mejor.j || (d.j === mejor.j && q < mejor.p)) mejor = { j: d.j, p: q };
    return mejor.p === p;
  }

  _partidaRemota(pt) {
    if (pt.n !== this.partidaN) {
      this._nuevaPartida(pt.n);
      this.ui.empezarPartida(this);
    }
    this.tiempo = pt.t;
    if (pt.k) for (const [id, b, mu] of pt.k) { const c = this.porId(id); if (c) { c.bajas = b; c.muertes = mu; } }
    if (pt.f === 'combate' && this.fase === 'preparacion') this.fase = 'combate';
    if (pt.f === 'fin' && this.fase !== 'finPartida') this._terminarPartida(pt.g);
  }

  // e: [id, nombre, heroe, x, y, z, yaw, pitch, vida, escudo, banderas, arma, disparos, bajas, muertes]
  _estadoRemoto(e, ahora, par, vistos) {
    const [id, nombre, heroe, x, y, z, yaw, pitch, vida, escudo, f, arma, disparos] = e;
    let c = this.porId(id);
    if (!c) {
      c = this._crear({ id, nombre, heroe, local: false });
      c.pos.set(x, y, z);
      c.dueno = par;
      vistos.add(id);
      c._disparos = disparos;
      if (e[13] != null) { c.bajas = e[13]; c.muertes = e[14]; }
    }
    if (c.local) return;
    c._visto = ahora;
    if (c.heroe !== heroe) c.setHeroe(heroe);
    c.nombre = nombre;
    c.recibirSnap(ahora, x, y, z, yaw, pitch);
    c.vida = vida; c.escudo = escudo;
    const vivo = !!(f & 1);
    if (vivo && !c.vivo) { c.vivo = true; c.modelo.muerte = 0; c.snaps.length = 0; c.recibirSnap(ahora, x, y, z, yaw, pitch); c.pos.set(x, y, z); }
    if (!vivo && c.vivo) { c.vivo = false; c.tMuerte = 0; }
    c.suelo = !!(f & 2); c.deslizando = f & 4 ? 0.5 : 0; c.agachado = !!(f & 8);
    const recargando = !!(f & 16);
    c.protegido = f & 32 ? 1 : 0; c.ult = f & 64 ? 1 : 0;
    if (f & 128) c.lanzando = 1;
    const idx = LISTA_ARMAS.indexOf(arma);
    if (idx >= 0 && c.arsenal.tipo !== arma) { const i = c.arsenal.ranuras.indexOf(arma); if (i >= 0) c.arsenal.indice = i; }
    if (recargando && c.arsenal.recargando <= 0 && c.arsenal.arma.cargador) c.arsenal.recargando = c.arsenal.arma.recarga;
    if (!recargando) c.arsenal.recargando = 0;
    // Disparos nuevos desde el último paquete: los pintamos.
    const n = ((disparos - (c._disparos ?? disparos)) + 256) % 256;
    c._disparos = disparos;
    for (let i = 0; i < Math.min(3, n); i++) this._tiroRemoto(c);
  }

  _quitarPar(p) {
    this.pares.delete(p);
    for (const c of [...this.combatientes]) if (!c.local && c.dueno === p) this._quitar(c);
    this.ui.estadoRed(red.estado, red.sala, this.pares.size);
  }

  _paqueteRed(dt) {
    if (!this.online) return;
    const humanos = 1 + this.pares.size;
    const hz = humanos <= 2 ? 12 : humanos <= 4 ? 9 : 6;
    this.tRed -= dt;
    // Pares que ya no responden.
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
        | (c.arsenal.recargando > 0 ? 16 : 0) | (c.protegido > 0 ? 32 : 0) | (c.ult > 0 ? 64 : 0) | (c.lanzando > 0.5 ? 128 : 0);
      s.push([c.id, c.nombre, c.heroe, r2(c.pos.x), r2(c.pos.y), r2(c.pos.z), r2(c.yaw), r2(c.pitch), Math.ceil(c.vida), Math.ceil(c.escudo), f, c.arsenal.tipo, c.arsenal.disparos, c.bajas, c.muertes]);
    }
    const m = { j: this.unidoEn, s };
    if (this.anfitriona) {
      m.pt = { n: this.partidaN, t: Math.round(this.tiempo), f: this.fase === 'finPartida' ? 'fin' : this.fase, g: this.ganador };
      if ((this._tTabla = (this._tTabla || 0) + 1) % 4 === 0) m.pt.k = this.combatientes.map((c) => [c.id, c.bajas, c.muertes]);
    }
    red.paquete(m);
  }

  // La anfitriona llena la sala con bots hasta tener 4 combatientes.
  _gestionarBots() {
    if (!this.online) return;
    const soy = this.anfitriona;
    const misBots = [...this.bots.keys()].map((id) => this.porId(id)).filter(Boolean);
    if (!soy) { for (const b of misBots) this._quitar(b); return; }
    const humanos = 1 + this.pares.size;
    const quiero = Math.max(0, 4 - humanos);
    if (misBots.length < quiero && this.fase !== 'finPartida') this._crearBot(this._heroeBot());
    else if (misBots.length > quiero) this._quitar(misBots[misBots.length - 1]);
  }

  // ---------- Bucle ----------
  actualizar(dtReal) {
    this.t += dtReal;
    const inp = this.input;
    if (inp.pulsado('pausa')) { if (this.pausado) this.seguir(); else this.pausar(); }
    if (this.pausado && !this.online) return;

    this.camaraLenta = Math.min(1, this.camaraLenta + dtReal * (this.fase === 'finPartida' ? 0.25 : 3));
    const dt = dtReal * this.camaraLenta;

    if (this.fase === 'menu') { this._menu(dtReal); return; }

    inp.actualizar();
    const j = this.jugador;
    const m = inp.consumirMirada(this.camara.fov);
    const controla = j.vivo && this.fase !== 'finPartida' && !this.pausado;
    if (controla) {
      j.yaw -= m.x;
      j.pitch = Math.max(-1.45, Math.min(1.45, j.pitch - m.y));
    }

    if (this.fase === 'preparacion') {
      const antes = Math.ceil(this.tFase);
      this.tFase -= dtReal;
      if (Math.ceil(this.tFase) !== antes && this.tFase > 0) this.audio.cuentaAtras(false);
      this.ui.cuentaAtras(Math.ceil(this.tFase));
      if (this.tFase <= 0 && (this.anfitriona || this.tFase < -1)) { this.fase = 'combate'; this.audio.cuentaAtras(true); this.ui.cuentaAtras(0); }
    }

    const combate = this.fase === 'combate';
    const I = this._intent || (this._intent = {});
    const mover = combate && controla;
    I.x = mover ? inp.mover.x : 0; I.y = mover ? inp.mover.y : 0;
    I.saltar = mover && inp.pulsado('saltar');
    I.deslizar = mover && inp.pulsado('deslizar');
    I.agachar = mover && inp.agachar;
    I.esprintar = inp.esprintar && !inp.disparando;
    if (combate && j.vivo && !this.pausado) this._controlesArma(j);
    else inp.pulsados.clear();
    this.ui.tabla(inp.tabla || this.fase === 'finPartida' ? this : null);

    // Entidades locales: física y tiempos. Remotas: interpolación.
    const ahora = performance.now() / 1000;
    for (const c of this.combatientes) {
      if (c.local) {
        let intent = c === j ? I : null;
        const bot = this.bots.get(c.id);
        if (bot) {
          intent = bot.pensar(dt, this);
          if (combate && c.vivo) {
            if (intent.poder) this.poderes.usar(c, intent.poder);
            if (intent.disparar) this.disparar(c);
          }
        }
        if (!intent) continue;
        c.fisica(dt, intent, this.mapa, this.audio, c === j);
        c.arsenal.actualizar(dt, c.ult > 0 && c.heroe === 'sakura');
        c.tiempos(dt);
        if (c.trueno && c.suelo && c.vivo) this.poderes.aterrizajeTrueno(c);
        if (c === j && c.aterrizaje < -3) this.vista.aterrizar(c.aterrizaje);
        if (!c.vivo && c.tMuerte >= REAPARICION && combate) this._aparecer(c);
      } else {
        c.interpolar(ahora, dt);
        c.golpeKatana = Math.max(0, c.golpeKatana - dt * 4);
        c.lanzando = Math.max(0, c.lanzando - dt * 3);
        c.flinch = Math.max(0, c.flinch - dt * 5);
        if (c.arsenal.recargando > 0) c.arsenal.recargando = Math.max(0.01, c.arsenal.recargando - dt);
        if (!c.vivo) c.tMuerte += dt;
      }
    }
    this._granadas(dt);
    this.poderes.actualizar(dt);
    this.mapa.actualizar(this.t, dt);

    if (combate) {
      if (this.anfitriona) {
        this.tiempo -= dt;
        if (this.tiempo <= 0) this._terminarPartida(this.ranking()[0].id);
      } else this.tiempo = Math.max(0, this.tiempo - dt);
    } else if (this.fase === 'finPartida') {
      this.tFase -= dtReal;
      if (this.online && this.anfitriona && this.tFase <= 0) { this._nuevaPartida(this.partidaN + 1); this.ui.empezarPartida(this); }
    }
    if (this.online && this.partidaN === 0 && this.anfitriona) this.partidaN = 1;
    this._gestionarBots();
    this._paqueteRed(dtReal);

    const apunta = inp.apuntando && j.vivo && combate && !j.arsenal.arma.cuerpo && !j.arsenal.arma.lanzable && j.arsenal.recargando <= 0;
    this.camara.actualizar(dtReal, j, apunta, j.arsenal.arma.zoom || 60, j.asesino);
    this.vista.actualizar(dt, j, { apunta, mirada: m, visible: j.vivo && !(apunta && j.arsenal.arma.mira) && this.fase !== 'finPartida' });
    this.render.seguirSombra(j.pos);
    this.efectos.actualizar(dt);
    actualizarFrustum(this.render.camara);
    this._etiquetas(dtReal);
    for (const c of this.combatientes) if (c !== j) c.actualizarModelo(dt, this.render.camara);
    this.ui.hud(this, apunta);
  }

  // Nombres sobre la cabeza: solo de quien ves (sin atravesar paredes) y cerca.
  _etiquetas(dt) {
    this.tEtiquetas -= dt;
    if (this.tEtiquetas > 0) return;
    this.tEtiquetas = 0.2;
    const cam = this.render.camara.position;
    for (const c of this.combatientes) {
      if (c === this.jugador) continue;
      _p.set(c.pos.x, c.pos.y + 1.9, c.pos.z);
      const ver = c.vivo && cam.distanceTo(_p) < 45 && this.mapa.visible(cam, _p);
      c.modelo.setEtiqueta(ver ? c.nombre : null, c.H.color);
    }
  }

  _controlesArma(j) {
    const inp = this.input, ars = j.arsenal;
    for (let i = 1; i <= 4; i++) if (inp.pulsado('r' + i) && ars.cambiar(i - 1)) this.audio.cambiarArma();
    if (inp.pulsado('siguiente')) { let k = (ars.indice + 1) % 4; if (k === 3 && ars.granadas <= 0) k = 0; if (ars.cambiar(k)) this.audio.cambiarArma(); }
    if (inp.pulsado('anterior')) { let k = (ars.indice + 3) % 4; if (k === 3 && ars.granadas <= 0) k = 2; if (ars.cambiar(k)) this.audio.cambiarArma(); }
    if (inp.pulsado('granada') && ars.granadas > 0) this.lanzarGranada(j, 0.3);
    if (inp.pulsado('recargar') && ars.recargar()) this.audio.recarga();
    for (const k of ['q', 'e', 'x']) {
      if (!inp.pulsado(k)) continue;
      if (this.poderes.usar(j, k)) this.ui.poderUsado(k);
      else { this.audio.vacio(); this.ui.poderNoListo(k); }
    }
    const quiere = inp.disparando;
    const a = ars.arma;
    if (quiere && (a.auto || !this._antesDisparo)) this.disparar(j);
    if (a.cargador && ars.municion[ars.tipo] === 0 && ars.recargando <= 0 && ars.enfriamiento <= 0) {
      if (ars.recargar()) this.audio.recarga();
    }
    this._antesDisparo = quiere;
  }

  // Menú: el héroe elegido posa delante y los demás detrás; la cámara gira despacio.
  _menu(dt) {
    const cam = this.render.camara;
    const a = Math.sin(this.t * 0.15) * 0.3;
    cam.position.set(3.8 + Math.sin(a) * 3.6, 1.45 + Math.sin(this.t * 0.3) * 0.1, 14 + Math.cos(a) * 3.6);
    cam.lookAt(3.2, 1.15, 13.6);
    if (cam.fov !== 50) { cam.fov = 50; cam.updateProjectionMatrix(); }
    this.camara.fov = 50;
    const j = this.jugador;
    j.vel.set(0, 0, 0);
    j.pitch = Math.sin(this.t * 0.8) * 0.08;
    j.yaw = Math.PI + 0.25 + Math.sin(this.t * 0.5) * 0.1;
    j.pos.set(3.8, 0, 14);
    j.modelo.setVisible(true);
    this.vista.raiz.visible = false;
    actualizarFrustum(cam);
    this.efectos.actualizar(dt);
    this.mapa.actualizar(this.t, dt);
    j.actualizarModelo(dt, cam);
    let i = 0;
    const sitios = [[1.9, 12.1], [2.8, 11.5], [1.0, 12.8]];
    for (const mq of this.maniquies) {
      if (!mq.raiz.visible) continue;
      const [x, z] = sitios[i++ % 3];
      _p.set(x, 0, z);
      mq.ponerArma(HEROES[mq.heroe].arma);
      mq.actualizar(dt, { pos: _p, yaw: Math.PI + 0.5 + i * 0.15, pitch: Math.sin(this.t * 0.7 + i) * 0.06, vel: _q.set(0, 0, 0), suelo: true, vivo: true }, cam);
    }
    this.render.seguirSombra(_p.set(3.4, 0, 13));
  }
}

const _cajasG = [];
export { VIDA_MAX };
