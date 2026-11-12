// Combatiente: cuerpo físico + vida + arsenal + modelo. Lo usan igual el jugador y el bot.
// Cámara: tercera persona sobre el hombro (con colisión) o primera persona.
import * as THREE from 'three';
import { Arsenal } from './armas.js';
import { Personaje } from './personaje.js';

const RADIO = 0.34;
const ALTO = { pie: 1.75, agachado: 1.15, desliz: 0.9 };
const VEL = { andar: 5.4, correr: 7.6, agachado: 3, desliz: 10.5 };
const GRAVEDAD = 21, SALTO = 6.7, SALTO_AIRE = 5.6;
const _cajas = [];

export class Combatiente {
  constructor(escena, { nombre, estilo, equipo }) {
    this.nombre = nombre;
    this.equipo = equipo;
    this.modelo = new Personaje(escena, estilo);
    this.arsenal = new Arsenal('rifle');
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.impactos = { cabeza: new THREE.Vector3(), pecho: new THREE.Vector3(), piernas: new THREE.Vector3() };
    this.stats = { disparos: 0, aciertos: 0, cabezas: 0, dano: 0 };
    this.reiniciar(new THREE.Vector3(), 0);
  }

  reiniciar(pos, yaw) {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0;
    this.vida = 100;
    this.vivo = true;
    this.suelo = true;
    this.saltosAire = 0;
    this.deslizando = 0;
    this.agachado = false;
    this.golpeKatana = 0;
    this.retroceso = 0;
    this.ultimoGolpe = 0;
    this.dirGolpe = 0;
    this.modelo.muerte = 0;
    this.modelo.cadera.rotation.x = 0;
  }

  get alto() { return this.deslizando > 0 ? ALTO.desliz : this.agachado ? ALTO.agachado : ALTO.pie; }
  get ojos() { return this.alto - 0.17; }

  // intencion: { x, y (en ejes de la mirada), saltar, deslizar, agachar, esprintar }
  fisica(dt, intent, mapa, audio, esJugador) {
    if (!this.vivo) { this.vel.x *= 0.9; this.vel.z *= 0.9; }
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    // Adelante = -Z local; derecha = +X local.
    let dx = intent.x * c - intent.y * s;
    let dz = -intent.x * s - intent.y * c;
    const quiere = Math.hypot(dx, dz);
    if (quiere > 1) { dx /= quiere; dz /= quiere; }

    // Deslizamiento: solo corriendo y en el suelo.
    const rapidez = Math.hypot(this.vel.x, this.vel.z);
    if (this.vivo && intent.deslizar && this.suelo && this.deslizando <= 0 && rapidez > 5) {
      this.deslizando = 0.75;
      const k = VEL.desliz / rapidez;
      this.vel.x *= k; this.vel.z *= k;
      if (esJugador) audio.deslizar();
    }
    this.deslizando = Math.max(0, this.deslizando - dt);
    this.agachado = this.vivo && intent.agachar && this.suelo && this.deslizando <= 0;

    if (this.deslizando > 0) {
      // Casi sin rozamiento: conserva el impulso y se puede girar un poco.
      const fr = Math.pow(0.35, dt);
      this.vel.x *= fr; this.vel.z *= fr;
    } else if (this.vivo) {
      const max = this.agachado ? VEL.agachado : intent.esprintar && intent.y > 0.3 ? VEL.correr : VEL.andar;
      const ax = this.suelo ? 16 : 4;
      const k = Math.min(1, dt * ax);
      this.vel.x += (dx * max - this.vel.x) * k;
      this.vel.z += (dz * max - this.vel.z) * k;
    }

    if (this.vivo && intent.saltar) {
      if (this.suelo) {
        this.vel.y = SALTO; this.suelo = false;
        if (this.deslizando > 0) { this.deslizando = 0; this.vel.x *= 1.05; this.vel.z *= 1.05; } // salto deslizado
        if (esJugador) audio.salto();
      } else if (this.saltosAire < 1) {
        this.vel.y = SALTO_AIRE; this.saltosAire++;
        if (esJugador) audio.salto();
      }
    }
    this.vel.y -= GRAVEDAD * dt;

    const estabaEnSuelo = this.suelo;
    this.suelo = false;
    this._mover(0, this.vel.x * dt, mapa);
    this._mover(2, this.vel.z * dt, mapa);
    this._mover(1, this.vel.y * dt, mapa);
    if (this.suelo) this.saltosAire = 0;
    if (esJugador && this.suelo && estabaEnSuelo && rapidez > 3 && this.deslizando <= 0) audio.paso();
    if (this.pos.y < -10) { this.pos.set(0, 0, 0); this.vel.set(0, 0, 0); } // red de seguridad

    this.golpeKatana = Math.max(0, this.golpeKatana - dt * 3.2);
    this.retroceso = Math.max(0, this.retroceso - dt * 6);
  }

  _mover(eje, d, mapa) {
    if (d === 0) return;
    const p = this.pos;
    const k = eje === 0 ? 'x' : eje === 1 ? 'y' : 'z';
    p[k] += d;
    const h = this.alto, r = RADIO;
    mapa.cercanas(p.x - r - 0.5, p.z - r - 0.5, p.x + r + 0.5, p.z + r + 0.5, _cajas);
    for (const b of _cajas) {
      if (p.x + r <= b.min.x || p.x - r >= b.max.x || p.z + r <= b.min.z || p.z - r >= b.max.z) continue;
      if (p.y + h <= b.min.y || p.y >= b.max.y) continue;
      if (eje === 1) {
        if (d < 0) { p.y = b.max.y; this.vel.y = 0; this.suelo = true; }
        else { p.y = b.min.y - h - 0.001; this.vel.y = Math.min(0, this.vel.y); }
        continue;
      }
      // Escalón bajo: se sube sin saltar.
      const escalon = b.max.y - p.y;
      if (escalon > 0 && escalon <= 0.48 && this.vel.y <= 0.5 && this._libreArriba(b.max.y, mapa)) {
        p.y = b.max.y; this.suelo = true; this.vel.y = Math.max(0, this.vel.y);
        continue;
      }
      p[k] = d > 0 ? b.min[k] - r - 0.001 : b.max[k] + r + 0.001;
      this.vel[k] = 0;
    }
  }

  _libreArriba(y, mapa) {
    const p = this.pos, r = RADIO, h = this.alto;
    for (const b of _cajas) {
      if (p.x + r <= b.min.x || p.x - r >= b.max.x || p.z + r <= b.min.z || p.z - r >= b.max.z) continue;
      if (b.min.y < y + h && b.max.y > y + 0.01) return false;
    }
    return true;
  }

  // Aplica daño. dir: ángulo (mundo) desde el que llega el golpe.
  danar(cantidad, desde) {
    if (!this.vivo) return false;
    this.vida = Math.max(0, this.vida - cantidad);
    this.modelo.destello = 0.08;
    this.ultimoGolpe = 0.9;
    if (desde) this.dirGolpe = Math.atan2(desde.x - this.pos.x, desde.z - this.pos.z);
    if (this.vida <= 0) { this.vivo = false; return true; }
    return false;
  }

  actualizarModelo(dt, camara) {
    this.modelo.ponerArma(this.arsenal.tipo);
    this.modelo.actualizar(dt, {
      pos: this.pos, yaw: this.yaw, pitch: this.pitch, vel: this.vel, suelo: this.suelo,
      deslizando: this.deslizando > 0, agachado: this.agachado, vivo: this.vivo, golpeKatana: this.golpeKatana,
    }, camara);
  }

  cajasImpacto() {
    return this.modelo.cajasImpacto({ pos: this.pos, deslizando: this.deslizando > 0, agachado: this.agachado }, this.impactos);
  }

  // Dirección en la que mira (unitaria).
  direccion(out) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }
}

// ---------- Cámara ----------
const _pivote = new THREE.Vector3(), _deseo = new THREE.Vector3(), _dir = new THREE.Vector3(), _off = new THREE.Vector3();

export class Camara {
  constructor(camara) {
    this.cam = camara;
    this.modo = 'tercera';
    this.fovBase = 72;
    this.fov = 72;
    this.distancia = 2.7;
    this.sacudida = 0;
    this.orbita = null; // {centro, t} para la toma final
  }

  actualizar(dt, c, mapa, apuntando, zoom) {
    const cam = this.cam;
    const objetivoFov = apuntando ? zoom : this.fovBase + (Math.hypot(c.vel.x, c.vel.z) > 7 ? 6 : 0);
    this.fov += (objetivoFov - this.fov) * Math.min(1, dt * 14);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }

    if (this.orbita) { // toma final: la cámara gira alrededor del rival derrotado
      const o = this.orbita;
      o.t += dt;
      const a = o.a0 + o.t * 0.9;
      // Rayo desde el personaje: la cámara se acerca si hay una pared en medio.
      _pivote.set(o.centro.x, o.centro.y + 1.1, o.centro.z);
      _dir.set(Math.sin(a), 0.22, Math.cos(a)).normalize();
      const t = mapa.rayo(_pivote, _dir, 4.2);
      const dist = t === Infinity ? 4 : Math.max(0.8, t - 0.3);
      cam.position.copy(_pivote).addScaledVector(_dir, dist);
      cam.lookAt(o.centro.x, o.centro.y + 0.7, o.centro.z);
      return;
    }

    _pivote.set(c.pos.x, c.pos.y + c.ojos, c.pos.z);
    const primera = this.modo === 'primera' || (apuntando && c.arsenal.arma.mira);
    c.modelo.setVisible(!primera);
    cam.rotation.set(c.pitch + c.retroceso * 0.5, c.yaw, 0, 'YXZ');

    if (primera) {
      cam.position.copy(_pivote);
    } else {
      // Hombro derecho, detrás: el rayo evita que la cámara atraviese paredes.
      _off.set(0.55, 0.28, this.distancia).applyEuler(cam.rotation);
      _deseo.copy(_pivote).add(_off);
      _dir.subVectors(_deseo, _pivote);
      const l = _dir.length();
      _dir.divideScalar(l);
      const t = mapa.rayo(_pivote, _dir, l + 0.25);
      const dist = t === Infinity ? l : Math.max(0.3, t - 0.25);
      cam.position.copy(_pivote).addScaledVector(_dir, dist);
    }
    if (this.sacudida > 0) {
      this.sacudida = Math.max(0, this.sacudida - dt * 2.5);
      const k = this.sacudida * this.sacudida * 0.08;
      cam.position.x += (Math.random() - 0.5) * k;
      cam.position.y += (Math.random() - 0.5) * k;
    }
  }

  get primeraPersona() { return this.cam.position.distanceToSquared(_pivote) < 0.01; }
}
