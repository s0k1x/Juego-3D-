// Cerebro del bot: elige rival, percibe, decide y produce la misma "intención" que el teclado del jugador.
// Usa las mismas armas, poderes y física. No ve a través de las paredes, pero sabe más o menos
// hacia dónde ir a buscar pelea (para que las partidas sean rápidas).
import * as THREE from 'three';
import { ARMAS } from './armas.js';
import { angulo } from './jugador.js';

export const DIFICULTAD = {
  facil: { reaccion: 0.55, error: 0.1, giro: 3.4, cabeza: 0.08, tolerancia: 0.07, rafaga: [3, 6], salta: 0.15, granada: 0.15, poderes: 0.35 },
  normal: { reaccion: 0.34, error: 0.06, giro: 5.4, cabeza: 0.2, tolerancia: 0.05, rafaga: [4, 9], salta: 0.3, granada: 0.35, poderes: 0.7 },
  dificil: { reaccion: 0.2, error: 0.033, giro: 8.5, cabeza: 0.35, tolerancia: 0.035, rafaga: [6, 14], salta: 0.5, granada: 0.6, poderes: 1 },
};

const DIST_IDEAL = { vector: 14, trueno: 5, aguja: 26, avispa: 8, cometa: 16, chispa: 11, sentencia: 14, eco: 7, filo: 1.5, yunque: 1.6, colmillo: 1.3 };
const _ojoA = new THREE.Vector3(), _ojoB = new THREE.Vector3(), _obj = new THREE.Vector3();

export class Bot {
  constructor(cuerpo, nivel = 'normal') {
    this.c = cuerpo;
    this.setNivel(nivel);
    this.reiniciar();
  }

  setNivel(n) { this.nivel = n; this.p = DIFICULTAD[n] || DIFICULTAD.normal; }

  reiniciar() {
    this.visto = 0;
    this.ultimaPos = null;
    this.ruta = [];
    this.tRuta = 0;
    this.estado = 'buscar';
    this.tLado = 0; this.lado = 1;
    this.error = new THREE.Vector2(this.p.error * 3, this.p.error * 2);
    this.rafaga = 0; this.pausa = 0;
    this.apuntarCabeza = false;
    this.cobertura = null;
    this.tSinVer = 0;
    this.objetivo = null;
    this.tObjetivo = 0;
    this.intent = { x: 0, y: 0, saltar: false, deslizar: false, agachar: false, esprintar: false, disparar: false, util: false, apuntar: false };
  }

  _elegirObjetivo(juego) {
    const c = this.c;
    let mejor = null, mv = Infinity;
    for (const o of juego.combatientes) {
      if (o === c || !o.vivo || o.equipo === c.equipo) continue;
      let v = o.pos.distanceTo(c.pos);
      _ojoA.set(c.pos.x, c.pos.y + c.ojos, c.pos.z);
      _ojoB.set(o.pos.x, o.pos.y + 1.4, o.pos.z);
      if (v < 50 && juego.ve(_ojoA, _ojoB)) v *= 0.4;
      if (o === this.objetivo) v *= 0.7;       // no cambia de idea a cada momento
      if (c.ultimoGolpe > 0 && o.pos.distanceTo(c.pos) < 40) v *= 0.85;
      if (v < mv) { mv = v; mejor = o; }
    }
    if (mejor !== this.objetivo) { this.visto = 0; this.ultimaPos = null; }
    this.objetivo = mejor;
  }

  pensar(dt, juego) {
    const c = this.c, mapa = juego.mapa, I = this.intent;
    I.saltar = I.deslizar = I.disparar = false; I.util = false; I.apuntar = false;
    if (!c.vivo || juego.fase !== 'combate') { I.x = I.y = 0; I.agachar = false; return I; }
    this.tObjetivo -= dt;
    if (this.tObjetivo <= 0 || !this.objetivo?.vivo) { this._elegirObjetivo(juego); this.tObjetivo = 0.5; }
    const j = this.objetivo;
    if (!j) { I.x = I.y = 0; return I; }

    // ---------- Percepción ----------
    _ojoA.set(c.pos.x, c.pos.y + c.ojos, c.pos.z);
    _ojoB.set(j.pos.x, j.pos.y + j.ojos * 0.85, j.pos.z);
    const dist = _ojoA.distanceTo(_ojoB);
    const aJug = Math.atan2(-(j.pos.x - c.pos.x), -(j.pos.z - c.pos.z));
    const difYaw = Math.abs(angulo(aJug - c.yaw));
    const ve = j.vivo && (difYaw < 1.3 || c.ultimoGolpe > 0 || dist < 5) && juego.ve(_ojoA, _ojoB);
    if (ve) {
      this.visto += dt;
      this.tSinVer = 0;
      this.ultimaPos = (this.ultimaPos || new THREE.Vector3()).copy(j.pos);
    } else {
      this.visto = 0;
      this.tSinVer += dt;
    }

    // ---------- Arma ----------
    const ars = c.arsenal;
    const prim = ars.ranuras[0], sec = ars.ranuras[1];
    const cuerpo = ARMAS[ars.ranuras[2]];
    if (ve && dist < cuerpo.alcance + 0.4 && ars.indice !== 2 && Math.random() < dt * 3) ars.cambiar(2);
    else if (ars.indice === 2 && dist > cuerpo.alcance + 2.5) ars.cambiar(ars.municion[prim] > 0 ? 0 : 1);
    else if (ars.indice === 0 && ars.municion[prim] === 0 && ars.recargando <= 0) {
      if (ve && dist < 14 && ars.municion[sec] > 0) ars.cambiar(1); else ars.recargar();
    } else if (ars.indice === 1 && (!ve || ars.municion[sec] === 0) && ars.municion[prim] < ARMAS[prim].cargador) {
      ars.cambiar(0); ars.recargar();
    } else if (ars.indice === 1 && !ve && ars.municion[prim] > 0) ars.cambiar(0);
    if (!ve && ars.indice < 2 && ars.municion[ars.tipo] < ars.arma.cargador * 0.5) ars.recargar();

    // ---------- Decidir estado ----------
    const herido = c.vida < 40;
    const recargando = ars.recargando > 0;
    if ((herido || recargando) && ve && this.estado !== 'cubrirse' && Math.random() < dt * 1.5) {
      this.cobertura = this._buscarCobertura(juego, j);
      if (this.cobertura) { this.estado = 'cubrirse'; this.tRuta = 0; }
    }
    if (this.estado === 'cubrirse' && (!this.cobertura || (!recargando && (!herido || this.tSinVer > 2)))) this.estado = 'buscar';
    if (this.estado !== 'cubrirse') this.estado = ve ? 'combate' : 'buscar';

    // ---------- Moverse ----------
    let mx = 0, mz = 0;
    if (this.estado === 'combate') {
      const ideal = DIST_IDEAL[ars.tipo] ?? 12;
      const dx = (j.pos.x - c.pos.x) / dist, dz = (j.pos.z - c.pos.z) / dist;
      const acercar = dist > ideal + 3 ? 1 : dist < ideal - 3 ? -0.7 : 0;
      this.tLado -= dt;
      if (this.tLado <= 0) { this.lado = Math.random() < 0.5 ? -1 : 1; this.tLado = 0.4 + Math.random() * 1.0; }
      mx = dx * acercar - dz * this.lado * 0.85;
      mz = dz * acercar + dx * this.lado * 0.85;
      if (c.suelo && Math.random() < dt * this.p.salta) I.saltar = true;
      else if (!c.suelo && c.vel.y < 0 && Math.random() < dt * this.p.salta * 2) I.saltar = true;
      I.agachar = ars.tipo === 'aguja' && dist > 18;
      I.apuntar = !!ars.arma.mira || dist > 16;
      I.esprintar = !!ars.arma.cuerpo || ars.tipo === 'trueno' || ars.tipo === 'avispa' || ars.tipo === 'eco';
      if (I.esprintar && dist < 8 && c.suelo && Math.random() < dt * 0.8) I.deslizar = true;
    } else {
      const destino = this.estado === 'cubrirse' ? this.cobertura : (this.ultimaPos || j.pos);
      this.tRuta -= dt;
      if (this.tRuta <= 0) {
        this.ruta = mapa.ruta(c.pos.x, c.pos.z, destino.x, destino.z);
        this.tRuta = 0.6;
        if (this.ruta.length > 1) this.ruta.shift();
      }
      while (this.ruta.length && Math.hypot(this.ruta[0].x - c.pos.x, this.ruta[0].z - c.pos.z) < 0.8) this.ruta.shift();
      const sig = this.ruta[0];
      if (sig) {
        const d = Math.hypot(sig.x - c.pos.x, sig.z - c.pos.z) || 1;
        mx = (sig.x - c.pos.x) / d; mz = (sig.z - c.pos.z) / d;
      } else if (this.estado === 'buscar' && this.ultimaPos && c.pos.distanceTo(this.ultimaPos) < 1.5) {
        this.ultimaPos = null;
      }
      I.agachar = this.estado === 'cubrirse' && !sig;
      I.esprintar = this.estado !== 'cubrirse' || !!sig;
      if (this.ultimaPos && this.tSinVer < 3) this._mirarA(this.ultimaPos, 1.2, dt, false);
      else if (sig) this._mirarYaw(Math.atan2(-mx, -mz), dt);
      if (sig && c.suelo && Math.hypot(c.vel.x, c.vel.z) < 0.5 && Math.random() < dt * 2) I.saltar = true;
    }
    const s = Math.sin(c.yaw), co = Math.cos(c.yaw);
    I.y = -(mx * s + mz * co);
    I.x = mx * co - mz * s;

    // ---------- Apuntar y disparar ----------
    if (ve && this.visto > this.p.reaccion * 0.5) {
      const imp = j.cajasImpacto();
      _obj.copy(this.apuntarCabeza ? imp.cabeza : imp.pecho);
      this._mirarA(_obj, 0, dt, true);
      this.error.multiplyScalar(Math.pow(0.35, dt));
      if (Math.hypot(j.vel.x, j.vel.z) > 6.5) this.error.addScalar(this.p.error * dt * 0.8);
      if (this.visto > this.p.reaccion) this._decidirDisparo(dt, dist, difYaw, I);
    } else {
      this.error.set((Math.random() - 0.5) * this.p.error * 6, (Math.random() - 0.5) * this.p.error * 4);
      this.rafaga = 0;
    }
    this._utilidad(dt, ve, dist, difYaw, I);
    c.disparoHecho = false;
    return I;
  }

  _utilidad(dt, ve, dist, difYaw, I) {
    const c = this.c, ars = c.arsenal;
    if (ars.cdUtil > 0 || Math.random() > dt * 2 * this.p.poderes) return;
    switch (ars.utilidad) {
      case 'petardo':
        // A donde se escondió el rival, o directa si está lejos.
        if (!ve && this.ultimaPos && this.tSinVer > 1 && this.tSinVer < 4) {
          const dg = c.pos.distanceTo(this.ultimaPos);
          if (dg > 7 && dg < 22) { this._mirarA(this.ultimaPos, 1.2 + dg * 0.06, 1, false); I.util = true; }
        } else if (ve && dist > 9 && dist < 20 && difYaw < 0.15 && Math.random() < 0.3) { c.pitch += 0.12; I.util = true; }
        break;
      case 'humo': if (ve && c.vida < 50 && dist > 8) I.util = true; break;
      case 'destello': if (ve && ((dist > 12 && ars.arma.cuerpo) || dist > 22 || (c.vida < 40 && Math.random() < 0.4))) I.util = true; break;
      case 'muro': if (ve && dist > 6 && (c.vida < 60 || ars.recargando > 0)) I.util = true; break;
      case 'botiquin': if (c.vida < 50 && (!ve || c.vida < 25)) I.util = true; break;
    }
  }

  _decidirDisparo(dt, dist, difYaw, I) {
    const c = this.c, ars = c.arsenal, a = ars.arma;
    if (a.cuerpo) { if (dist < a.alcance) I.disparar = true; return; }
    if (a.alcance && dist > a.alcance * 0.9) return;
    if (this.pausa > 0) { this.pausa -= dt; return; }
    if (difYaw > this.p.tolerancia * 6) return;
    if (a.mira && this.visto < this.p.reaccion + 0.35) return;
    if (a.auto) {
      if (this.rafaga <= 0) {
        this.rafaga = this.p.rafaga[0] + Math.random() * (this.p.rafaga[1] - this.p.rafaga[0]);
        this.apuntarCabeza = Math.random() < this.p.cabeza;
      }
      I.disparar = true;
      if (c.disparoHecho) { this.rafaga--; if (this.rafaga <= 0) this.pausa = 0.25 + Math.random() * 0.4; }
    } else {
      I.disparar = ars.listo();
      if (I.disparar) this.apuntarCabeza = Math.random() < this.p.cabeza * (a.mira ? 1.6 : 1);
    }
  }

  _mirarYaw(objetivo, dt) {
    const d = angulo(objetivo - this.c.yaw);
    const max = this.p.giro * dt;
    this.c.yaw += Math.max(-max, Math.min(max, d));
    this.c.pitch *= 1 - Math.min(1, dt * 4);
  }

  _mirarA(p, alto, dt, conError) {
    const c = this.c;
    const ox = c.pos.x, oy = c.pos.y + c.ojos, oz = c.pos.z;
    const dx = p.x - ox, dy = p.y + alto - oy, dz = p.z - oz;
    let yaw = Math.atan2(-dx, -dz);
    let pitch = Math.atan2(dy, Math.hypot(dx, dz));
    if (conError) { yaw += this.error.x; pitch += this.error.y; }
    const max = this.p.giro * dt;
    c.yaw += Math.max(-max, Math.min(max, angulo(yaw - c.yaw)));
    c.pitch += Math.max(-max, Math.min(max, pitch - c.pitch));
  }

  _buscarCobertura(juego, j) {
    const c = this.c, mapa = juego.mapa;
    _ojoB.set(j.pos.x, j.pos.y + 1.5, j.pos.z);
    let mejor = null, md = Infinity;
    for (const n of mapa.nodos) {
      if (!n.cobertura) continue;
      const d = Math.hypot(n.x - c.pos.x, n.z - c.pos.z);
      if (d > 14 || d > md) continue;
      _ojoA.set(n.x, 1.0, n.z);
      if (mapa.visible(_ojoA, _ojoB)) continue;
      md = d; mejor = n;
    }
    return mejor;
  }
}
