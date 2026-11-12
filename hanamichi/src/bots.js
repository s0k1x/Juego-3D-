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

const DIST_IDEAL = { rifle: 14, escopeta: 5, franco: 26, subfusil: 8, pistola: 11, katana: 1.5 };
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
    this.intent = { x: 0, y: 0, saltar: false, deslizar: false, agachar: false, esprintar: false, disparar: false, poder: null };
  }

  _elegirObjetivo(juego) {
    const c = this.c;
    let mejor = null, mv = Infinity;
    for (const o of juego.combatientes) {
      if (o === c || !o.vivo || o.protegido > 1.5) continue;
      let v = o.pos.distanceTo(c.pos);
      _ojoA.set(c.pos.x, c.pos.y + c.ojos, c.pos.z);
      _ojoB.set(o.pos.x, o.pos.y + 1.4, o.pos.z);
      if (v < 50 && juego.mapa.visible(_ojoA, _ojoB)) v *= 0.4;
      if (o === this.objetivo) v *= 0.7;       // no cambia de idea a cada momento
      if (c.ultimoGolpe > 0 && o.pos.distanceTo(c.pos) < 40) v *= 0.85;
      if (v < mv) { mv = v; mejor = o; }
    }
    if (mejor !== this.objetivo) { this.visto = 0; this.ultimaPos = null; }
    this.objetivo = mejor;
  }

  pensar(dt, juego) {
    const c = this.c, mapa = juego.mapa, I = this.intent;
    I.saltar = I.deslizar = I.disparar = false; I.poder = null;
    if (!c.vivo || juego.fase !== 'combate') { I.x = I.y = 0; return I; }
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
    const ve = j.vivo && (difYaw < 1.3 || c.ultimoGolpe > 0 || dist < 5) && mapa.visible(_ojoA, _ojoB);
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
    const prim = ars.ranuras[0];
    if (ve && dist < 2.6 && ars.indice !== 2 && Math.random() < dt * 3) ars.cambiar(2);
    else if (ars.indice === 2 && dist > 4.5) ars.cambiar(ars.municion[prim] > 0 ? 0 : 1);
    else if (ars.indice === 0 && ars.municion[prim] === 0 && ars.recargando <= 0) {
      if (ve && dist < 12) ars.cambiar(1); else ars.recargar();
    } else if (ars.indice === 1 && (!ve || ars.municion.pistola === 0) && ars.municion[prim] < ARMAS[prim].cargador) {
      ars.cambiar(0); ars.recargar();
    } else if (ars.indice === 1 && !ve) ars.cambiar(0);
    else if (ars.indice === 3) ars.cambiar(0);
    if (!ve && ars.indice === 0 && ars.municion[prim] < ARMAS[prim].cargador * 0.5) ars.recargar();

    // Granada a donde se escondió el rival.
    if (!ve && this.ultimaPos && this.tSinVer > 1.2 && this.tSinVer < 4 && ars.granadas > 0) {
      const dg = c.pos.distanceTo(this.ultimaPos);
      if (dg > 7 && dg < 22 && Math.random() < dt * this.p.granada) {
        this._mirarA(this.ultimaPos, 1.2, dt * 100, true);
        juego.lanzarGranada(c, 0.35 + dg * 0.012);
      }
    }

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
      I.agachar = ars.tipo === 'franco' && dist > 18;
      I.esprintar = ars.tipo === 'katana' || ars.tipo === 'escopeta' || ars.tipo === 'subfusil';
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
    this._poderes(dt, ve, dist, difYaw, I);
    c.disparoHecho = false;
    return I;
  }

  _poderes(dt, ve, dist, difYaw, I) {
    const c = this.c, H = c.H;
    if (Math.random() > dt * 2.5 * this.p.poderes) return;
    const apunta = difYaw < 0.12 && this.visto > this.p.reaccion;
    if (c.carga >= 100 && ve) {
      const x = H.x.id;
      if ((x === 'tormenta' && dist < 25) || x === 'juicio' || ((x === 'ventisca' || x === 'meteoro') && dist < 30 && apunta)) { I.poder = 'x'; return; }
    }
    const q = H.q.id, e = H.e.id;
    if (c.cdQ <= 0) {
      if (q === 'rayo' && ve && apunta && dist < 45) { I.poder = 'q'; return; }
      if (q === 'bola' && ve && apunta && dist > 5 && dist < 30) { I.poder = 'q'; return; }
      if (q === 'destello' && ve && (dist > 14 || (c.vida < 45 && Math.random() < 0.5))) { I.poder = 'q'; return; }
      if (q === 'muro' && ve && (c.vida < 60 || c.arsenal.recargando > 0)) { I.poder = 'q'; return; }
    }
    if (c.cdE <= 0) {
      if (e === 'petalos' && c.vida < 55) { I.poder = 'e'; return; }
      if (e === 'escudo' && c.ultimoGolpe > 0) { I.poder = 'e'; return; }
      if (e === 'trueno' && ve && dist > 3 && dist < 13 && c.suelo) { I.poder = 'e'; return; }
      if (e === 'impulso' && ((ve && c.vida < 40) || (!ve && Math.random() < 0.15)) && c.suelo) { I.poder = 'e'; return; }
    }
  }

  _decidirDisparo(dt, dist, difYaw, I) {
    const c = this.c, ars = c.arsenal, a = ars.arma;
    if (a.cuerpo) { if (dist < a.alcance) I.disparar = true; return; }
    if (a.lanzable) { ars.cambiar(0); return; }
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
