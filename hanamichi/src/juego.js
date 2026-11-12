// Núcleo: partida por rondas (primero a 5), disparos, impactos, granadas, katana y toma final.
import * as THREE from 'three';
import { Mapa } from './mapa.js';
import { Combatiente, Camara } from './jugador.js';
import { Bot, angulo } from './bots.js';
import { ARMAS, caidaDano, geometriaArma } from './armas.js';
import { Efectos } from './efectos.js';
import { actualizarFrustum } from './personaje.js';
import { materialContorno } from './render.js';
import { modeloArma } from './armas.js';
import { datos } from './datos.js';
import { red } from './red.js';

const RONDAS_PARA_GANAR = 5;
const TIEMPO_RONDA = 80;
const NOMBRES = ['Rin', 'Sora', 'Kaito', 'Yuki', 'Haru', 'Mei'];
const RADIOS = { cabeza: 0.21, pecho: 0.34, piernas: 0.3 };

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _n = new THREE.Vector3();
const _boca = new THREE.Vector3(), _ojo = new THREE.Vector3(), _q = new THREE.Vector3();

export class Juego {
  constructor({ render, input, audio, ui }) {
    this.render = render; this.input = input; this.audio = audio; this.ui = ui;
    const escena = render.escena;
    this.mapa = new Mapa(escena);
    this.efectos = new Efectos(escena);
    this.jugador = new Combatiente(escena, { nombre: 'Tú', estilo: 'sakura', equipo: 0 });
    this.rival = new Combatiente(escena, { nombre: NOMBRES[(Math.random() * NOMBRES.length) | 0], estilo: 'cian', equipo: 1 });
    this.bot = new Bot(this.rival, 'normal');
    this.camara = new Camara(render.camara);
    this.config = { primaria: 'rifle', dificultad: 'normal', camara: 'tercera' };
    this.fase = 'menu';
    this.pausado = false;
    this.t = 0;
    this.camaraLenta = 1;
    this.marcador = [0, 0];
    this.granadas = Array.from({ length: 4 }, () => {
      const g = geometriaArma('granada');
      const m = new THREE.Mesh(g.malla, this.jugador.modelo.material);
      m.add(new THREE.Mesh(g.contorno, materialContorno));
      m.visible = false;
      escena.add(m);
      return { activa: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), t: 0, dueno: null, malla: m };
    });
    this._antesDisparo = false;
    // Arma en primera persona: hija de la cámara, se construye la primera vez que se ve.
    this.vista = new THREE.Group();
    this.vista.position.set(0.2, -0.2, -0.42);
    render.camara.add(this.vista);
    this.vistaArmas = {};
    this._prepararMenu();
  }

  // ---------- Flujo de partida ----------
  _prepararMenu() {
    this.fase = 'menu';
    this.jugador.reiniciar(new THREE.Vector3(0, 0, 5), 0.35);
    this.rival.reiniciar(new THREE.Vector3(1.6, 0, 5), -0.35);
    this.jugador.arsenal.reiniciar(this.config.primaria);
    this.rival.arsenal.reiniciar('escopeta');
    this.camara.orbita = null;
  }

  empezarPartida() {
    this.marcador = [0, 0];
    this.ronda = 0;
    this.camara.modo = this.config.camara;
    this.bot.setNivel(this.config.dificultad);
    this.rival.nombre = NOMBRES[(Math.random() * NOMBRES.length) | 0];
    for (const c of [this.jugador, this.rival]) c.stats = { disparos: 0, aciertos: 0, cabezas: 0, dano: 0 };
    this.ui.empezarPartida(this);
    this.input.activo = true;
    this.input.pedirBloqueo();
    red.avisarWeb('inicio');
    this.empezarRonda();
  }

  empezarRonda() {
    this.ronda++;
    this.fase = 'preparacion';
    this.tFase = 3;
    this.tiempo = TIEMPO_RONDA;
    this.camaraLenta = 1;
    this.camara.orbita = null;
    // Cambiamos de lado cada ronda para que sea justo.
    const lado = this.ronda % 2;
    const pj = this.mapa.aparicion(lado), pr = this.mapa.aparicion(1 - lado);
    this.jugador.reiniciar(pj, lado === 0 ? 0 : Math.PI);
    this.rival.reiniciar(pr, lado === 0 ? Math.PI : 0);
    this.jugador.arsenal.reiniciar(this.config.primaria);
    const prims = ['rifle', 'escopeta', 'franco'];
    this.rival.arsenal.reiniciar(prims[(Math.random() * 3) | 0]);
    this.bot.reiniciar();
    for (const g of this.granadas) { g.activa = false; g.malla.visible = false; }
    this.ui.ronda(this.ronda, this.marcador, this.rival);
    this.ui.ocultarBanner();
  }

  _terminarRonda(ganador, porTiempo = false) {
    if (this.fase !== 'combate') return;
    this.fase = 'finRonda';
    if (ganador >= 0) this.marcador[ganador]++;
    const fin = this.marcador[0] >= RONDAS_PARA_GANAR || this.marcador[1] >= RONDAS_PARA_GANAR;
    this.tFase = fin ? 3.2 : 2.6;
    // Cámara lenta y toma final sobre quien cae.
    if (ganador >= 0 && !porTiempo) {
      const caido = ganador === 0 ? this.rival : this.jugador;
      this.camaraLenta = 0.25;
      if (fin || ganador === 0) this.camara.orbita = { centro: caido.pos.clone(), t: 0, a0: this._anguloAbierto(caido.pos) };
    }
    if (ganador === 0) this.audio.victoriaRonda(); else if (ganador === 1) this.audio.derrotaRonda();
    this.ui.banner(ganador, porTiempo, this.marcador, fin);
    this.finPartida = fin;
  }

  _acabarPartida() {
    this.fase = 'finPartida';
    this.input.activo = false;
    this.input.soltarBloqueo();
    const gano = this.marcador[0] > this.marcador[1];
    if (gano) this.audio.victoriaFinal();
    const resumen = datos.registrarPartida({ gano, marcador: this.marcador.slice(), stats: this.jugador.stats, dificultad: this.config.dificultad });
    this.ui.finPartida({ gano, marcador: this.marcador, stats: this.jugador.stats, rival: this.rival.nombre, resumen });
    red.avisarWeb('fin', { gano, marcador: this.marcador.slice() });
    this._prepararMenu();
    this.fase = 'finPartida';
  }

  pausar() {
    if (this.pausado || !['preparacion', 'combate', 'finRonda'].includes(this.fase)) return;
    this.pausado = true;
    this.input.limpiar();
    this.input.soltarBloqueo();
    this.ui.pausa(true);
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
    this._prepararMenu();
    this.ui.menu();
  }

  // ---------- Combate ----------
  // Devuelve el punto de salida del disparo (boca del arma) en coordenadas de mundo.
  _boca(c, out) {
    if (c === this.jugador && this.camara.primeraPersona) {
      return out.set(0.18, -0.16, -0.5).applyQuaternion(this.render.camara.quaternion).add(this.render.camara.position);
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
    this.disparoHecho = true;
    if (a.cuerpo) { this._katana(c); return true; }
    if (a.lanzable) { this.lanzarGranada(c, 0.35); return true; }

    const otro = c === this.jugador ? this.rival : this.jugador;
    c.stats.disparos++;
    // Origen del rayo: la cámara (jugador en tercera persona) o los ojos.
    _ojo.set(c.pos.x, c.pos.y + c.ojos, c.pos.z);
    if (esJug) _o.copy(this.render.camara.position); else _o.copy(_ojo);
    const vel = Math.hypot(c.vel.x, c.vel.z);
    const apunta = esJug && this.input.apuntando;
    let disp = a.mira && !apunta && esJug ? a.dispCadera : a.disp;
    if (!a.mira && apunta) disp *= 0.6;
    disp += (vel / 7.6) * a.dispMov + (c.suelo ? 0 : 0.03);
    this._boca(c, _boca);

    let golpeo = false, cabeza = false, danoTotal = 0;
    for (let i = 0; i < a.perdigones; i++) {
      c.direccion(_d);
      _d.x += (Math.random() - 0.5) * 2 * disp; _d.y += (Math.random() - 0.5) * 2 * disp; _d.z += (Math.random() - 0.5) * 2 * disp;
      _d.normalize();
      let tMapa = this.mapa.rayo(_o, _d, a.alcance, _n);
      // En tercera persona el rayo sale de la cámara: comprobamos que el personaje también ve ese punto.
      if (esJug && !this.camara.primeraPersona) {
        const lejos = Math.min(tMapa, a.alcance);
        _p.copy(_o).addScaledVector(_d, lejos);
        _q.subVectors(_p, _ojo); const l = _q.length(); _q.divideScalar(l);
        const t2 = this.mapa.rayo(_ojo, _q, l - 0.05, _n);
        if (t2 !== Infinity) { _o.copy(_ojo); _d.copy(_q); tMapa = t2; }
      }
      // Impacto contra el rival (esferas de cabeza, pecho y piernas).
      let tObj = Infinity, zona = null;
      if (otro.vivo) {
        const imp = otro.cajasImpacto();
        for (const z of ['cabeza', 'pecho', 'piernas']) {
          const t = rayoEsfera(_o, _d, imp[z], RADIOS[z]);
          if (t < tObj) { tObj = t; zona = z; }
        }
      }
      const t = Math.min(tMapa, tObj, a.alcance);
      _p.copy(_o).addScaledVector(_d, t);
      if (i < 3) this.efectos.trazo(_boca, _p, c.equipo === 0 ? 0xFFD7E6 : 0xC8F6FF);
      if (tObj < tMapa && tObj <= a.alcance) {
        let dano = a.dano * caidaDano(a, tObj);
        if (zona === 'cabeza') { dano *= a.cabeza; cabeza = true; }
        if (zona === 'piernas') dano *= 0.8;
        danoTotal += dano;
        golpeo = true;
        this.efectos.chispa(_p, null, c.equipo === 0 ? 0xFF8FB8 : 0x3EE0FF, 5, 3);
      } else if (tMapa < a.alcance) {
        this.efectos.chispa(_p, _n, 0xFFE6A8, a.perdigones > 1 ? 1 : 4, 3);
      }
    }
    if (golpeo) this._aplicarDano(c, otro, Math.round(danoTotal), cabeza);

    this.efectos.fogonazo(_boca, this.render.camara, c.equipo);
    const distOyente = esJug ? 0 : c.pos.distanceTo(this.jugador.pos);
    this.audio.disparo(ars.tipo, distOyente);
    if (esJug) {
      // Retroceso: la mira sube y se desvía un poco.
      c.pitch = Math.min(1.45, c.pitch + a.retroceso * (apunta ? 0.6 : 1));
      c.yaw += (Math.random() - 0.5) * a.retroceso * 0.6;
      c.retroceso = Math.min(0.08, c.retroceso + a.retroceso * 1.5);
      this.camara.sacudida = Math.min(1, this.camara.sacudida + a.retroceso * 6);
    }
    return true;
  }

  _aplicarDano(atacante, victima, dano, cabeza) {
    const muere = victima.danar(dano, atacante.pos);
    atacante.stats.aciertos++;
    atacante.stats.dano += dano;
    if (cabeza) atacante.stats.cabezas++;
    if (atacante === this.jugador) {
      this.audio.impacto(cabeza);
      this.ui.impacto(dano, cabeza, muere);
    } else {
      this.audio.dano();
      this.camara.sacudida = Math.min(1, this.camara.sacudida + 0.35);
      this.ui.recibirDano(angulo(victima.dirGolpe - victima.yaw));
    }
    if (muere) this._terminarRonda(atacante.equipo);
  }

  _katana(c) {
    c.golpeKatana = 1;
    c.direccion(_d); _d.y = 0; _d.normalize();
    if (c.suelo) { c.vel.x += _d.x * 6; c.vel.z += _d.z * 6; } // pequeña embestida
    const otro = c === this.jugador ? this.rival : this.jugador;
    this.audio.katana();
    if (!otro.vivo) return;
    _q.subVectors(otro.pos, c.pos);
    const dist = Math.hypot(_q.x, _q.z);
    if (dist > ARMAS.katana.alcance || Math.abs(_q.y) > 1.6) return;
    const dif = Math.abs(angulo(Math.atan2(-_q.x, -_q.z) - c.yaw));
    if (dif > 0.8) return;
    // Por la espalda hace más daño.
    const espalda = Math.abs(angulo(otro.yaw - c.yaw)) < 0.9;
    this.audio.katanaGolpe();
    _p.set(otro.pos.x, otro.pos.y + 1.2, otro.pos.z);
    this.efectos.chispa(_p, null, 0xFFFFFF, 12, 5);
    this._aplicarDano(c, otro, ARMAS.katana.dano * (espalda ? 1.6 : 1), false);
  }

  lanzarGranada(c, elevacion = 0.35) {
    const g = this.granadas.find((x) => !x.activa);
    if (!g) return;
    if (c.arsenal.tipo !== 'granada' && c.arsenal.granadas > 0) c.arsenal.granadas--;
    else if (c.arsenal.tipo !== 'granada') return;
    c.direccion(_d);
    _d.y += elevacion; _d.normalize();
    g.activa = true; g.t = 0; g.dueno = c;
    g.pos.set(c.pos.x, c.pos.y + c.ojos - 0.1, c.pos.z).addScaledVector(_d, 0.6);
    g.vel.copy(_d).multiplyScalar(15).add(c.vel);
    g.malla.visible = true;
    this.audio.granadaLanzar();
    // Tras lanzarla vuelve al arma anterior.
    if (c.arsenal.tipo === 'granada') c.arsenal.cambiar(c.arsenal.anterior === 3 ? 0 : c.arsenal.anterior);
  }

  _granadas(dt) {
    for (const g of this.granadas) {
      if (!g.activa) continue;
      g.t += dt;
      g.vel.y -= 20 * dt;
      // Rebote eje a eje contra las cajas.
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
    const dj = g.pos.distanceTo(this.jugador.pos);
    this.audio.explosion(dj);
    this.camara.sacudida = Math.min(1, this.camara.sacudida + Math.max(0, 1 - dj / 18));
    for (const c of [this.jugador, this.rival]) {
      if (!c.vivo) continue;
      _p.set(c.pos.x, c.pos.y + 1, c.pos.z);
      const d = _p.distanceTo(g.pos);
      if (d > a.radio) continue;
      _o.copy(g.pos); _o.y += 0.2;
      if (!this.mapa.visible(_o, _p)) continue; // las paredes protegen
      let dano = a.dano * Math.pow(1 - d / a.radio, 0.7);
      if (c === g.dueno) dano *= 0.5;
      c.vel.x += (_p.x - g.pos.x) / (d || 1) * 6; c.vel.y += 4;
      if (fase(this) && dano > 1) this._aplicarDano(g.dueno, c, Math.round(dano), false);
    }
  }

  // ---------- Bucle ----------
  actualizar(dtReal) {
    this.t += dtReal;
    const inp = this.input;
    if (inp.pulsado('pausa')) { if (this.pausado) this.seguir(); else this.pausar(); }
    if (this.pausado) return;

    this.camaraLenta = Math.min(1, this.camaraLenta + dtReal * (this.fase === 'finRonda' ? 0.35 : 3));
    const dt = dtReal * this.camaraLenta;
    this.disparoHecho = false;

    if (this.fase === 'menu' || this.fase === 'finPartida') { this._menu(dtReal); return; }

    inp.actualizar();
    const j = this.jugador;
    // Mirada (también durante la cuenta atrás).
    const m = inp.consumirMirada(this.camara.fov);
    if (j.vivo && this.fase !== 'finRonda') {
      j.yaw -= m.x;
      j.pitch = Math.max(-1.45, Math.min(1.45, j.pitch - m.y));
    }

    if (this.fase === 'preparacion') {
      const antes = Math.ceil(this.tFase);
      this.tFase -= dtReal;
      if (Math.ceil(this.tFase) !== antes && this.tFase > 0) this.audio.cuentaAtras(false);
      this.ui.cuentaAtras(Math.ceil(this.tFase));
      if (this.tFase <= 0) { this.fase = 'combate'; this.audio.cuentaAtras(true); this.ui.cuentaAtras(0); }
    }

    const combate = this.fase === 'combate';
    // Intención del jugador.
    const I = this._intent || (this._intent = {});
    I.x = combate ? inp.mover.x : 0; I.y = combate ? inp.mover.y : 0;
    I.saltar = combate && inp.pulsado('saltar');
    I.deslizar = combate && inp.pulsado('deslizar');
    I.agachar = combate && inp.agachar;
    I.esprintar = inp.esprintar && !inp.disparando;
    if (combate && j.vivo) this._controlesArma(j);

    j.fisica(dt, I, this.mapa, this.audio, true);
    j.arsenal.actualizar(dt);
    const B = this.bot.pensar(dt, this);
    this.rival.fisica(dt, B, this.mapa, this.audio, false);
    this.rival.arsenal.actualizar(dt);
    if (combate && B.disparar && this.rival.vivo) this.disparar(this.rival);
    for (const c of [j, this.rival]) c.ultimoGolpe = Math.max(0, c.ultimoGolpe - dt);
    this._granadas(dt);

    if (combate) {
      this.tiempo -= dt;
      if (this.tiempo <= 0) {
        const g = j.vida > this.rival.vida ? 0 : this.rival.vida > j.vida ? 1 : -1;
        this._terminarRonda(g, true);
      }
    } else if (this.fase === 'finRonda') {
      this.tFase -= dtReal;
      if (this.tFase <= 0) { if (this.finPartida) this._acabarPartida(); else this.empezarRonda(); }
    }

    const apunta = inp.apuntando && j.vivo && combate && !j.arsenal.arma.cuerpo && !j.arsenal.arma.lanzable;
    this.camara.actualizar(dtReal, j, this.mapa, apunta, j.arsenal.arma.zoom || 60);
    this._armaVista(dt, j, apunta);
    this.render.seguirSombra(j.pos);
    this.efectos.actualizar(dt);
    actualizarFrustum(this.render.camara);
    j.actualizarModelo(dt, this.render.camara);
    this.rival.actualizarModelo(dt, this.render.camara);
    this.ui.hud(this, apunta);
  }

  _controlesArma(j) {
    const inp = this.input, ars = j.arsenal;
    for (let i = 1; i <= 4; i++) if (inp.pulsado('r' + i) && ars.cambiar(i - 1)) this.audio.cambiarArma();
    if (inp.pulsado('siguiente')) { let k = (ars.indice + 1) % 4; if (k === 3 && ars.granadas <= 0) k = 0; if (ars.cambiar(k)) this.audio.cambiarArma(); }
    if (inp.pulsado('anterior')) { if (ars.cambiar(ars.anterior)) this.audio.cambiarArma(); }
    if (inp.pulsado('granada') && ars.granadas > 0) this.lanzarGranada(j, 0.35);
    if (inp.pulsado('recargar') && ars.recargar()) this.audio.recarga();
    if (inp.pulsado('camara')) { this.camara.modo = this.camara.modo === 'tercera' ? 'primera' : 'tercera'; this.config.camara = this.camara.modo; }
    const quiere = inp.disparando;
    const a = ars.arma;
    // Automáticas: mantener. Semiautomáticas y katana: un disparo por pulsación.
    if (quiere && (a.auto || !this._antesDisparo)) this.disparar(j);
    // Recarga automática al vaciar el cargador.
    if (a.cargador && ars.municion[ars.tipo] === 0 && ars.recargando <= 0 && ars.enfriamiento <= 0) {
      if (ars.recargar()) this.audio.recarga();
    }
    this._antesDisparo = quiere;
  }

  // Para la toma final: el ángulo alrededor del personaje con más espacio libre.
  _anguloAbierto(pos) {
    _o.set(pos.x, pos.y + 1.1, pos.z);
    let mejor = 0, md = -1;
    for (let i = 0; i < 12; i++) {
      // Se mide el centro del barrido (la cámara gira 0.9 rad/s durante ~1.5 s).
      const a = (i / 12) * Math.PI * 2;
      let libre = 0;
      for (const da of [-0.3, 0.3, 0.9]) {
        _d.set(Math.sin(a + da), 0.22, Math.cos(a + da)).normalize();
        libre += Math.min(4.2, this.mapa.rayo(_o, _d, 4.2));
      }
      if (libre > md) { md = libre; mejor = a - 0.3; }
    }
    return mejor;
  }

  _armaVista(dt, j, apunta) {
    const ver = this.camara.primeraPersona && j.vivo && !this.camara.orbita && !(apunta && j.arsenal.arma.mira);
    this.vista.visible = ver;
    if (!ver) return;
    const tipo = j.arsenal.tipo;
    for (const k in this.vistaArmas) this.vistaArmas[k].visible = k === tipo;
    if (!this.vistaArmas[tipo]) {
      const m = modeloArma(tipo);
      if (!m) return;
      m.traverse((o) => { o.castShadow = false; });
      this.vista.add(m);
      this.vistaArmas[tipo] = m;
    }
    // Balanceo al andar, retroceso y bajada al cambiar de arma o recargar.
    const vel = Math.hypot(j.vel.x, j.vel.z);
    const bal = j.suelo ? Math.min(1, vel / 7) : 0.3;
    const ars = j.arsenal;
    const baja = ars.cambiando * 1.2 + (ars.recargando > 0 ? 0.12 : 0);
    this.vista.position.set(0.2 + Math.sin(this.t * 8) * 0.012 * bal - (apunta ? 0.2 : 0), -0.2 - Math.abs(Math.cos(this.t * 8)) * 0.012 * bal - baja + (apunta ? 0.06 : 0), -0.42 + j.retroceso * 1.2);
    this.vista.rotation.set(j.retroceso * 2 + (ars.recargando > 0 ? -0.5 : 0) + j.golpeKatana * -1.2, 0, j.golpeKatana * 0.8);
  }

  // Menú: los dos personajes posan en la azotea y la cámara gira despacio.
  _menu(dt) {
    const cam = this.render.camara;
    // Arco suave delante de los personajes (sin atravesar nada del decorado).
    const a = Math.sin(this.t * 0.15) * 0.32;
    cam.position.set(0.8 + Math.sin(a) * 3.7, 1.45 + Math.sin(this.t * 0.3) * 0.12, 5 + Math.cos(a) * 3.7);
    cam.lookAt(0.8, 1.15, 5);
    if (cam.fov !== 50) { cam.fov = 50; cam.updateProjectionMatrix(); }
    this.camara.fov = 50;
    for (const c of [this.jugador, this.rival]) {
      c.vel.set(0, 0, 0);
      c.pitch = Math.sin(this.t * 0.8 + c.equipo) * 0.08;
      c.modelo.setVisible(true);
    }
    this.jugador.yaw = 0.35 + Math.PI + Math.sin(this.t * 0.5) * 0.1;
    this.rival.yaw = -0.35 + Math.PI;
    this.render.seguirSombra(_p.set(0.8, 0, 5));
    this.vista.visible = false;
    actualizarFrustum(cam);
    this.efectos.actualizar(dt);
    this.jugador.actualizarModelo(dt, cam);
    this.rival.actualizarModelo(dt, cam);
  }
}

const _cajasG = [];
const fase = (j) => j.fase === 'combate';

function rayoEsfera(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - cc;
  if (h < 0) return Infinity;
  const t = -b - Math.sqrt(h);
  return t > 0 ? t : Infinity;
}
