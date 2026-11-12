// Combatiente: cuerpo físico + vida/escudo + arsenal + poderes + modelo. Lo usan igual el jugador,
// los bots y los jugadores remotos (estos últimos sin física: se interpolan desde la red).
// Cámara: siempre en primera persona, con balanceo, inclinación, aterrizajes y cámara de muerte.
import * as THREE from 'three';
import { Arsenal } from './armas.js';
import { Personaje } from './personaje.js';
import { HEROES } from './heroes.js';

const RADIO = 0.34;
const ALTO = { pie: 1.75, agachado: 1.15, desliz: 0.9 };
const VEL = { andar: 5.8, correr: 8.2, agachado: 3.2, desliz: 11.5 };
const GRAVEDAD = 21, SALTO = 6.9, SALTO_AIRE = 6;
export const VIDA_MAX = 100;
const _cajas = [];

export class Combatiente {
  constructor(escena, { id, nombre, heroe = 'sakura', local = true }) {
    this.id = id;
    this.nombre = nombre;
    this.escena = escena;
    this.local = local;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.impactos = { cabeza: new THREE.Vector3(), pecho: new THREE.Vector3(), piernas: new THREE.Vector3() };
    this.stats = { disparos: 0, aciertos: 0, cabezas: 0, dano: 0 };
    this.bajas = 0; this.muertes = 0; this.racha = 0;
    this.snaps = []; // instantáneas recibidas por red
    this.setHeroe(heroe);
    this.reiniciar(new THREE.Vector3(), 0);
  }

  setHeroe(heroe) {
    if (this.heroe === heroe && this.modelo) return;
    this.heroe = heroe;
    this.H = HEROES[heroe] || HEROES.sakura;
    if (this.modelo) this.modelo.destruir();
    this.modelo = new Personaje(this.escena, this.H.estilo);
    if (!this.arsenal) this.arsenal = new Arsenal(this.H.arma);
    else this.arsenal.reiniciar(this.H.arma);
  }

  destruir() { this.modelo.destruir(); }

  reiniciar(pos, yaw) {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0;
    this.vida = VIDA_MAX;
    this.escudo = 0; this.tEscudo = 0;
    this.vivo = true;
    this.suelo = true;
    this.saltosAire = 0;
    this.deslizando = 0;
    this.agachado = false;
    this.golpeKatana = 0; this.katanaLado = 1;
    this.retroceso = 0;
    this.ultimoGolpe = 0;
    this.sinDano = 0;
    this.dirGolpe = 0;
    this.protegido = 2;
    this.cdQ = 0; this.cdE = 0;
    this.carga = this.carga ?? 0;
    this.ult = 0;               // segundos de definitiva activa (Sakura)
    this.curando = 0;
    this.lento = 0;
    this.lanzando = 0;
    this.flinch = 0;
    this.trueno = false;
    this.aterrizaje = 0;
    this.asesino = null;
    this.tMuerte = 0;
    this.arsenal.reiniciar(this.H.arma);
    this.modelo.muerte = 0;
    this.modelo.cadera.rotation.set(0, 0, 0);
    this.snaps.length = 0;
  }

  get alto() { return this.deslizando > 0 ? ALTO.desliz : this.agachado ? ALTO.agachado : ALTO.pie; }
  get ojos() { return this.alto - 0.17; }
  get velMult() { return this.H.velocidad * (this.ult > 0 && this.heroe === 'sakura' ? 1.3 : 1) * (this.lento > 0 ? 0.55 : 1); }

  // intencion: { x, y (en ejes de la mirada), saltar, deslizar, agachar, esprintar }
  fisica(dt, intent, mapa, audio, esJugador) {
    if (!this.vivo) { this.vel.x *= 0.9; this.vel.z *= 0.9; }
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    let dx = intent.x * c - intent.y * s;
    let dz = -intent.x * s - intent.y * c;
    const quiere = Math.hypot(dx, dz);
    if (quiere > 1) { dx /= quiere; dz /= quiere; }
    const vm = this.velMult;

    const rapidez = Math.hypot(this.vel.x, this.vel.z);
    if (this.vivo && intent.deslizar && this.suelo && this.deslizando <= 0 && rapidez > 5) {
      this.deslizando = 0.8;
      const k = (VEL.desliz * vm) / rapidez;
      this.vel.x *= k; this.vel.z *= k;
      if (esJugador) audio.deslizar();
    }
    this.deslizando = Math.max(0, this.deslizando - dt);
    this.agachado = this.vivo && intent.agachar && this.suelo && this.deslizando <= 0;

    if (this.deslizando > 0) {
      const fr = Math.pow(0.4, dt);
      this.vel.x *= fr; this.vel.z *= fr;
      // Se puede dirigir un poco el deslizamiento.
      this.vel.x += dx * dt * 6; this.vel.z += dz * dt * 6;
    } else if (this.vivo) {
      const corre = intent.esprintar && intent.y > 0.3;
      const max = (this.agachado ? VEL.agachado : corre ? VEL.correr : VEL.andar) * vm;
      const ax = this.suelo ? 16 : 5;
      const k = Math.min(1, dt * ax);
      // En el aire se conserva el impulso extra (saltadores, propulsión, destello).
      const rv = Math.hypot(this.vel.x, this.vel.z);
      if (this.suelo || rv <= max + 0.1 || quiere > 0.1) {
        const tx = dx * max, tz = dz * max;
        if (!this.suelo && rv > max) {
          this.vel.x += tx * dt * 2; this.vel.z += tz * dt * 2;
          const nv = Math.hypot(this.vel.x, this.vel.z);
          if (nv > rv) { this.vel.x *= rv / nv; this.vel.z *= rv / nv; }
        } else {
          this.vel.x += (tx - this.vel.x) * k;
          this.vel.z += (tz - this.vel.z) * k;
        }
      }
    }

    if (this.vivo && intent.saltar) {
      if (this.suelo) {
        this.vel.y = SALTO; this.suelo = false;
        if (this.deslizando > 0) { this.deslizando = 0; this.vel.x *= 1.08; this.vel.z *= 1.08; } // salto deslizado
        if (esJugador) audio.salto();
      } else if (this.saltosAire < 1) {
        this.vel.y = SALTO_AIRE; this.saltosAire++;
        // El doble salto reorienta el impulso hacia donde quieres ir.
        if (quiere > 0.1) { const v = Math.max(VEL.andar * vm, Math.hypot(this.vel.x, this.vel.z) * 0.9); this.vel.x = dx * v; this.vel.z = dz * v; }
        if (esJugador) audio.salto(true);
      }
    }
    this.vel.y -= GRAVEDAD * dt;

    const estabaEnSuelo = this.suelo;
    const vy = this.vel.y;
    this.suelo = false;
    this._mover(0, this.vel.x * dt, mapa);
    this._mover(2, this.vel.z * dt, mapa);
    this._mover(1, this.vel.y * dt, mapa);
    this.aterrizaje = 0;
    if (this.suelo) {
      this.saltosAire = 0;
      if (!estabaEnSuelo) { this.aterrizaje = vy; if (esJugador && vy < -6) audio.aterrizar(); }
      // Saltadores: te lanzan alto y hacia delante.
      const sal = mapa.saltador(this.pos);
      if (sal && this.vivo) {
        this.vel.y = sal.fuerza; this.suelo = false;
        this.vel.x += sal.dir.x * 4; this.vel.z += sal.dir.z * 4;
        audio.saltador(esJugador ? 0 : 8);
      }
    }
    if (esJugador && this.suelo && estabaEnSuelo && rapidez > 3 && this.deslizando <= 0) audio.paso();
    if (this.pos.y < -10) { this.pos.set(0, 0.5, 0); this.vel.set(0, 0, 0); }

    this.golpeKatana = Math.max(0, this.golpeKatana - dt * 4);
    this.retroceso = Math.max(0, this.retroceso - dt * 6);
  }

  // Temporizadores de poderes y estados (lo hace el dueño de la entidad).
  tiempos(dt) {
    this.cdQ = Math.max(0, this.cdQ - dt);
    this.cdE = Math.max(0, this.cdE - dt);
    this.protegido = Math.max(0, this.protegido - dt);
    this.ult = Math.max(0, this.ult - dt);
    this.lento = Math.max(0, this.lento - dt);
    this.lanzando = Math.max(0, this.lanzando - dt * 3);
    this.flinch = Math.max(0, this.flinch - dt * 5);
    this.ultimoGolpe = Math.max(0, this.ultimoGolpe - dt);
    if (this.tEscudo > 0) { this.tEscudo -= dt; if (this.tEscudo <= 0) this.escudo = 0; }
    if (!this.vivo) { this.tMuerte += dt; return; }
    this.sinDano += dt;
    this.carga = Math.min(100, this.carga + dt * 1.2);
    if (this.curando > 0) {
      const c = Math.min(this.curando, dt * 30);
      this.curando -= c; this.vida = Math.min(VIDA_MAX, this.vida + c);
    }
    // Regeneración rápida tras 4 s sin recibir daño.
    if (this.sinDano > 4 && this.vida < VIDA_MAX) this.vida = Math.min(VIDA_MAX, this.vida + dt * 25);
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
      const escalon = b.max.y - p.y;
      if (escalon > 0 && escalon <= 0.48 && this.vel.y <= 0.5 && this._libreArriba(b.max.y)) {
        p.y = b.max.y; this.suelo = true; this.vel.y = Math.max(0, this.vel.y);
        continue;
      }
      p[k] = d > 0 ? b.min[k] - r - 0.001 : b.max[k] + r + 0.001;
      this.vel[k] = 0;
    }
  }

  _libreArriba(y) {
    const p = this.pos, r = RADIO, h = this.alto;
    for (const b of _cajas) {
      if (p.x + r <= b.min.x || p.x - r >= b.max.x || p.z + r <= b.min.z || p.z - r >= b.max.z) continue;
      if (b.min.y < y + h && b.max.y > y + 0.01) return false;
    }
    return true;
  }

  // Aplica daño (lo llama el dueño de la entidad). Devuelve true si muere.
  danar(cantidad, desde) {
    if (!this.vivo || this.protegido > 0) return false;
    if (this.escudo > 0) {
      const a = Math.min(this.escudo, cantidad);
      this.escudo -= a; cantidad -= a;
    }
    this.vida = Math.max(0, this.vida - cantidad);
    this.modelo.destello = 0.08;
    this.ultimoGolpe = 0.9;
    this.sinDano = 0;
    this.flinch = 1;
    if (desde) this.dirGolpe = Math.atan2(desde.x - this.pos.x, desde.z - this.pos.z);
    if (this.vida <= 0) { this.vivo = false; this.tMuerte = 0; this.curando = 0; this.escudo = 0; this.ult = 0; return true; }
    return false;
  }

  estadoModelo() {
    const e = this._e || (this._e = {});
    e.pos = this.pos; e.yaw = this.yaw; e.pitch = this.pitch; e.vel = this.vel; e.suelo = this.suelo;
    e.deslizando = this.deslizando > 0; e.agachado = this.agachado; e.vivo = this.vivo;
    e.golpeKatana = this.golpeKatana; e.katanaLado = this.katanaLado;
    e.recarga = this.arsenal.progresoRecarga; e.lanzando = this.lanzando; e.flinch = this.flinch;
    e.protegido = this.protegido > 0; e.escudo = this.escudo; e.ult = this.ult > 0;
    return e;
  }

  actualizarModelo(dt, camara) {
    this.modelo.ponerArma(this.arsenal.tipo);
    this.modelo.actualizar(dt, this.estadoModelo(), camara);
  }

  cajasImpacto() {
    return this.modelo.cajasImpacto({ pos: this.pos, deslizando: this.deslizando > 0, agachado: this.agachado }, this.impactos);
  }

  direccion(out) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  // ---------- Red: instantáneas e interpolación ----------
  recibirSnap(t, x, y, z, yaw, pitch) {
    const s = this.snaps;
    s.push({ t, x, y, z, yaw, pitch });
    if (s.length > 8) s.shift();
  }

  interpolar(ahora, dt) {
    const s = this.snaps;
    if (!s.length) return;
    const t = ahora - 0.12; // 120 ms de retraso: siempre hay dos instantáneas entre las que mezclar
    let a = s[0], b = s[s.length - 1];
    for (let i = 0; i < s.length - 1; i++) if (s[i].t <= t && s[i + 1].t >= t) { a = s[i]; b = s[i + 1]; break; }
    let k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
    k = Math.max(0, Math.min(1.25, k));
    const px = this.pos.x, pz = this.pos.z, py = this.pos.y;
    const salto = Math.hypot(b.x - a.x, b.z - a.z) > 6; // teletransporte o reaparición: sin mezcla
    if (salto) k = Math.round(Math.min(1, k));
    this.pos.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
    this.yaw = a.yaw + angulo(b.yaw - a.yaw) * Math.min(1, k);
    this.pitch = a.pitch + (b.pitch - a.pitch) * Math.min(1, k);
    if (dt > 0) {
      const vx = (this.pos.x - px) / dt, vz = (this.pos.z - pz) / dt, vy = (this.pos.y - py) / dt;
      if (Math.hypot(vx, vz) < 30) { this.vel.x += (vx - this.vel.x) * 0.3; this.vel.z += (vz - this.vel.z) * 0.3; this.vel.y = vy; }
    }
  }
}

export function angulo(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

// ---------- Cámara en primera persona ----------
const _ojo = new THREE.Vector3();

export class Camara {
  constructor(camara) {
    this.cam = camara;
    this.fovBase = 80;
    this.fov = 80;
    this.sacudida = 0;
    this.inclinacion = 0;
    this.caida = 0;
    this.fase = 0;
    this.patada = 0; // golpe de FOV (destello, saltador)
  }

  actualizar(dt, c, apuntando, zoom, asesino) {
    const cam = this.cam;
    const vel = Math.hypot(c.vel.x, c.vel.z);
    const objetivoFov = apuntando ? zoom * (this.fovBase / 80) : this.fovBase + (vel > 7.5 ? 7 : 0) + (c.deslizando > 0 ? 6 : 0);
    this.patada = Math.max(0, this.patada - dt * 3);
    this.fov += (objetivoFov + this.patada * 14 - this.fov) * Math.min(1, dt * 12);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }

    if (!c.vivo) {
      // Cámara de muerte: caes al suelo, ladeado, y miras a quien te eliminó.
      const k = Math.min(1, c.tMuerte * 2.2);
      const e = 1 - (1 - k) ** 3;
      cam.position.set(c.pos.x, c.pos.y + 1.55 - e * 1.2, c.pos.z);
      let yaw = c.yaw, pitch = c.pitch;
      if (asesino && c.tMuerte > 0.5) {
        const dx = asesino.pos.x - c.pos.x, dz = asesino.pos.z - c.pos.z, dy = asesino.pos.y + 1.2 - cam.position.y;
        const ay = Math.atan2(-dx, -dz), ap = Math.atan2(dy, Math.hypot(dx, dz));
        const m = Math.min(1, (c.tMuerte - 0.5) * 2.5);
        this._muerteYaw = (this._muerteYaw ?? c.yaw) + angulo(ay - (this._muerteYaw ?? c.yaw)) * Math.min(1, dt * 5) * m;
        this._muertePitch = (this._muertePitch ?? c.pitch) + (ap - (this._muertePitch ?? c.pitch)) * Math.min(1, dt * 5) * m;
        yaw = this._muerteYaw; pitch = this._muertePitch;
      } else { this._muerteYaw = c.yaw; this._muertePitch = c.pitch; }
      cam.rotation.set(pitch, yaw, e * 0.45, 'YXZ');
      return;
    }
    this._muerteYaw = null;

    // Balanceo de la cabeza al andar, inclinación lateral y hundimiento al aterrizar.
    const bal = c.suelo && c.deslizando <= 0 ? Math.min(1, vel / 8) : 0;
    this.fase += dt * (5 + vel * 1.2);
    if (c.aterrizaje < -4) this.caida = Math.min(0.25, this.caida + (-c.aterrizaje - 4) * 0.012);
    this.caida = Math.max(0, this.caida - dt * 0.9);
    const s = Math.sin(c.yaw), co = Math.cos(c.yaw);
    const lateral = c.vel.x * co - c.vel.z * s;
    const objInc = -lateral * 0.0045 + (c.deslizando > 0 ? 0.06 : 0);
    this.inclinacion += (objInc - this.inclinacion) * Math.min(1, dt * 8);

    _ojo.set(c.pos.x, c.pos.y + c.ojos, c.pos.z);
    cam.position.copy(_ojo);
    cam.position.y += Math.abs(Math.sin(this.fase)) * 0.045 * bal - this.caida * 0.6;
    cam.position.x += Math.cos(this.fase) * 0.02 * bal * co;
    cam.position.z -= Math.cos(this.fase) * 0.02 * bal * s;
    cam.rotation.set(c.pitch + c.retroceso * 0.5 - this.caida * 0.15 + c.flinch * 0.02, c.yaw, this.inclinacion + Math.sin(this.fase * 0.5) * 0.004 * bal, 'YXZ');

    if (this.sacudida > 0) {
      this.sacudida = Math.max(0, this.sacudida - dt * 2.5);
      const k = this.sacudida * this.sacudida * 0.06;
      cam.position.x += (Math.random() - 0.5) * k;
      cam.position.y += (Math.random() - 0.5) * k;
      cam.rotation.z += (Math.random() - 0.5) * k * 0.5;
    }
  }
}
