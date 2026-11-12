// Vista en primera persona: brazos del héroe + arma, en una escena aparte que se dibuja encima
// (nunca atraviesa paredes). Todas las animaciones son procedurales: respiración, balanceo al andar,
// inercia al girar, esprint, apuntar, retroceso, recarga con cargador, cambio de arma, katana,
// granada, lanzamiento de poderes y aterrizajes.
import * as THREE from 'three';
import { modeloArma } from './armas.js';
import { ESTILOS, parte } from './personaje.js';
import { rampa } from './render.js';

const PIEL = 0xFFE3D3, GUANTE = 0x2A2350;
const Z = new THREE.Vector3(0, 0, 1);
const _d = new THREE.Vector3();
const suave = (a, b, k) => a + (b - a) * k;
const ease = (t) => t * t * (3 - 2 * t);
const tramo = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));

// Posición de cadera / apuntando por arma.
const POSE = {
  rifle: { cadera: [0.19, -0.18, -0.42] }, escopeta: { cadera: [0.19, -0.19, -0.42] },
  franco: { cadera: [0.19, -0.18, -0.4] }, subfusil: { cadera: [0.18, -0.17, -0.38] },
  pistola: { cadera: [0.16, -0.16, -0.38] }, katana: { cadera: [0.26, -0.25, -0.45] },
  granada: { cadera: [0.2, -0.2, -0.38] },
};

function brazo(material, E, haciaAtras) {
  const g = new THREE.Group();
  const cil = (r1, r2, h, z) => new THREE.CylinderGeometry(r1, r2, h, 10).rotateX(Math.PI / 2).translate(0, 0, z);
  const m = parte(material, [
    [new THREE.BoxGeometry(0.065, 0.075, 0.1).translate(0, 0, 0), GUANTE],
    [new THREE.BoxGeometry(0.06, 0.03, 0.06).translate(0, -0.035, -0.05), GUANTE],
    [cil(0.033, 0.038, 0.3, 0.2), PIEL],
    [cil(0.05, 0.056, 0.55, 0.6), E.chaqueta],
  ], [
    [cil(0.052, 0.052, 0.05, 0.34), E.acento],
    [new THREE.BoxGeometry(0.066, 0.02, 0.04).translate(0, 0.04, 0.03), E.acento],
  ]);
  m.castShadow = false;
  g.add(m);
  g.userData.dir = new THREE.Vector3(...haciaAtras).normalize();
  return g;
}

export class Vista {
  constructor(escena) {
    this.escena = escena;
    this.raiz = new THREE.Group();
    escena.add(this.raiz);
    this.pivote = new THREE.Group();
    this.raiz.add(this.pivote);
    this.porta = new THREE.Group();     // sostiene el arma y los brazos
    this.pivote.add(this.porta);
    this.material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: rampa });
    this.matArma = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: rampa });
    this.armas = {};
    this.tipo = null;
    this.estilo = null;

    // Fogonazo.
    const estrella = new THREE.Shape();
    for (let i = 0; i < 12; i++) {
      const r = i % 2 ? 0.025 : 0.085, a = (i / 12) * Math.PI * 2;
      i ? estrella.lineTo(Math.cos(a) * r, Math.sin(a) * r) : estrella.moveTo(r, 0);
    }
    this.fogonazo = new THREE.Mesh(new THREE.ShapeGeometry(estrella), new THREE.MeshBasicMaterial({ color: 0xFFF1B8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    const lateral = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.22).rotateX(Math.PI / 2).translate(0, 0, -0.1), this.fogonazo.material);
    this.fogonazo.add(lateral, lateral.clone().rotateZ(Math.PI / 2));
    this.fogonazo.visible = false;
    this.porta.add(this.fogonazo);

    // Brillo del poder en la mano izquierda.
    this.brillo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 1), new THREE.MeshBasicMaterial({ color: 0xFF8FB8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.brillo.visible = false;

    // Estela de la katana: un abanico que aparece durante el tajo.
    this.estela = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.95, 24, 1, 0, Math.PI * 0.75), new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.estela.position.set(0, -0.05, -0.55);
    this.estela.visible = false;
    this.pivote.add(this.estela);

    // Estado de las animaciones.
    this.t = 0; this.fase = 0; this.ads = 0; this.esprint = 0;
    this.sway = new THREE.Vector2(); this.swayV = new THREE.Vector2();
    this.retro = 0; this.retroLado = 0; this.tFogonazo = 0; this.tMovil = 1;
    this.katana = 1; this.katanaLado = 1;
    this.lanzar = 0; this.tirar = 1; this.caida = 0; this.aire = 0;
  }

  setHeroe(estilo, colorPoder) {
    if (this.estilo === estilo) return;
    this.estilo = estilo;
    const E = ESTILOS[estilo];
    for (const b of [this.brazoD, this.brazoI]) if (b) { b.parent?.remove(b); b.traverse((o) => o.geometry?.dispose()); }
    this.brazoD = brazo(this.material, E, [0.28, -0.42, 1]);
    this.brazoI = brazo(this.material, E, [-0.45, -0.5, 1]);
    this.porta.add(this.brazoD, this.brazoI);
    this.brazoI.add(this.brillo);
    this.brillo.position.set(0, 0.03, -0.12);
    this.brillo.material.color.set(colorPoder);
  }

  _arma(tipo) {
    if (this.tipo === tipo) return this.armas[tipo];
    for (const k in this.armas) this.armas[k].visible = false;
    if (!this.armas[tipo]) {
      const m = modeloArma(tipo, this.matArma);
      m.traverse((o) => { o.castShadow = false; });
      this.porta.add(m);
      this.armas[tipo] = m;
    }
    const m = this.armas[tipo];
    m.visible = true;
    this.tipo = tipo;
    this.fogonazo.position.copy(m.userData.boca);
    return m;
  }

  // Eventos que disparan animaciones.
  disparo(tipo) {
    this.retro = Math.min(1.4, this.retro + (tipo === 'escopeta' || tipo === 'franco' ? 1.2 : tipo === 'pistola' ? 0.7 : 0.45));
    this.retroLado = (Math.random() - 0.5);
    this.tFogonazo = 0.045;
    this.tMovil = 0;
    this.fogonazo.rotation.z = Math.random() * Math.PI;
    this.fogonazo.scale.setScalar(tipo === 'escopeta' ? 1.6 : tipo === 'subfusil' ? 0.8 : 1.1);
  }
  tajo() { this.katana = 0; this.katanaLado = -this.katanaLado; }
  poder() { this.lanzar = 1; }
  granada() { this.tirar = 0; }
  aterrizar(v) { this.caida = Math.min(1, this.caida + Math.max(0, -v - 3) / 10); }

  // j: Combatiente del jugador. mirada: radianes girados este fotograma.
  actualizar(dt, j, { apunta, mirada, visible }) {
    this.raiz.visible = visible;
    if (!visible) return;
    this.t += dt;
    const ars = j.arsenal, tipo = ars.tipo;
    const arma = this._arma(tipo);
    const ud = arma.userData;

    // Mezclas suaves.
    const vel = Math.hypot(j.vel.x, j.vel.z);
    const corre = j.suelo && vel > 7 && !apunta && j.deslizando <= 0 && ars.recargando <= 0 && this.katana >= 1;
    this.esprint = suave(this.esprint, corre ? 1 : 0, Math.min(1, dt * 10));
    this.ads = suave(this.ads, apunta ? 1 : 0, Math.min(1, dt * 16));
    const bal = j.suelo ? Math.min(1, vel / 7) : 0;
    this.fase += dt * (4 + vel * 1.25);
    this.aire = suave(this.aire, j.suelo ? 0 : Math.max(-1, Math.min(1, j.vel.y / 8)), Math.min(1, dt * 8));

    // Inercia al girar (el arma se queda atrás un poco) con muelle.
    const kAds = 1 - this.ads * 0.8;
    this.swayV.x += (-mirada.x * 1.6 - this.sway.x) * Math.min(1, dt * 60) * 0.25;
    this.swayV.y += (-mirada.y * 1.6 - this.sway.y) * Math.min(1, dt * 60) * 0.25;
    this.swayV.multiplyScalar(Math.pow(0.0008, dt));
    this.sway.addScaledVector(this.swayV, Math.min(1, dt * 60));
    this.sway.clampScalar(-0.12, 0.12);

    this.retro = Math.max(0, this.retro - dt * 7);
    this.caida = Math.max(0, this.caida - dt * 4);
    this.tFogonazo -= dt;
    this.tMovil = Math.min(1, this.tMovil + dt * 3);
    this.katana = Math.min(1, this.katana + dt * 3.6);
    this.lanzar = Math.max(0, this.lanzar - dt * 2.6);
    this.tirar = Math.min(1, this.tirar + dt * 2.5);

    // ---------- Pivote: movimiento general ----------
    const P = POSE[tipo] || POSE.rifle;
    const mira = ud.mira || 0.1;
    const hx = P.cadera[0], hy = P.cadera[1], hz = P.cadera[2];
    const ax = 0, ay = -mira - 0.005, az = tipo === 'pistola' ? -0.3 : -0.27;
    const k = this.ads;
    const resp = Math.sin(this.t * 1.6) * 0.004 * (1 - k);
    const bx = Math.sin(this.fase) * 0.018 * bal * kAds;
    const by = -Math.abs(Math.cos(this.fase)) * 0.016 * bal * kAds;
    this.pivote.position.set(
      suave(hx, ax, k) + bx + this.sway.x * 0.25 * kAds + this.esprint * 0.04,
      suave(hy, ay, k) + by + resp + this.sway.y * 0.2 * kAds - this.caida * 0.06 - this.aire * 0.025 - this.esprint * 0.03,
      suave(hz, az, k) + this.retro * (tipo === 'franco' ? 0.08 : 0.045),
    );
    const cambio = ars.cambiando > 0 ? ease(Math.min(1, ars.cambiando / 0.3)) : 0;
    this.pivote.position.y -= cambio * 0.35;
    this.pivote.rotation.set(
      this.retro * 0.09 + this.sway.y * 0.6 * kAds - cambio * 0.8 - this.esprint * 0.25 + this.aire * 0.05,
      this.sway.x * 0.8 * kAds + this.esprint * 0.55 + this.retroLado * this.retro * 0.03,
      Math.sin(this.fase * 0.5) * 0.02 * bal * kAds + this.esprint * 0.2 - this.sway.x * 0.4 * kAds,
    );

    // ---------- Porta: acciones del arma ----------
    const pr = ars.progresoRecarga;
    const rec = pr > 0 ? Math.sin(Math.min(1, pr * 1.15) * Math.PI) : 0;
    this.porta.position.set(0, -rec * 0.03, 0);
    this.porta.rotation.set(rec * 0.18, -rec * 0.1, rec * 0.42);
    this.porta.scale.setScalar(1);

    // Mano derecha en la empuñadura.
    const mD = this.brazoD;
    mD.position.set(0.0, -0.075, 0.015);
    // Mano izquierda: en el guardamanos, salvo al recargar o al lanzar un poder.
    const mI = this.brazoI;
    const izq = _izq.copy(ud.izq);
    if (ud.cargador) {
      ud.cargador.visible = true;
      ud.cargador.position.set(0, 0, 0);
      if (pr > 0) {
        // 0.15-0.4 saca el cargador, 0.4-0.6 fuera, 0.6-0.85 mete el nuevo, 0.85-1 golpe y vuelve.
        const saca = ease(tramo(pr, 0.12, 0.4)), mete = ease(tramo(pr, 0.55, 0.82));
        const fuera = saca * (1 - mete);
        ud.cargador.position.y = -fuera * 0.35;
        ud.cargador.visible = fuera < 0.9;
        const cg = _cg.set(0, -0.1 - fuera * 0.35, ud.izq.z * 0.2 - 0.12);
        const haciaCargador = ease(tramo(pr, 0.0, 0.15)) * (1 - ease(tramo(pr, 0.86, 1)));
        izq.lerp(cg, haciaCargador);
      }
    } else if (pr > 0) {
      // Escopeta: mete cartuchos uno a uno.
      const n = Math.sin(pr * Math.PI * 8) * 0.5 + 0.5;
      izq.lerp(_cg.set(0.0, -0.1 - n * 0.08, -0.08), ease(tramo(pr, 0, 0.1)) * (1 - ease(tramo(pr, 0.9, 1))));
    }
    if (this.lanzar > 0) {
      const l = Math.sin(Math.min(1, (1 - this.lanzar) * 1.6) * Math.PI * 0.5) * (this.lanzar > 0.15 ? 1 : this.lanzar / 0.15);
      izq.lerp(_cg.set(-0.34, 0.12, -0.36), l);
      this.brillo.visible = true;
      this.brillo.scale.setScalar(0.4 + l * 0.6 + Math.sin(this.t * 40) * 0.08);
      this.brillo.material.opacity = l;
    } else this.brillo.visible = false;
    if (tipo === 'katana' || tipo === 'granada') izq.set(-0.32, -0.45, 0.1); // mano libre, fuera de cuadro
    mI.position.copy(izq);
    if (tipo === 'pistola' && pr <= 0 && this.lanzar <= 0) mI.position.set(-0.03, -0.085, 0.04);
    for (const b of [mD, mI]) { _d.copy(b.userData.dir); b.quaternion.setFromUnitVectors(Z, _d); }

    // Arma: piezas móviles.
    arma.position.set(0, 0, 0);
    arma.rotation.set(0, 0, 0);
    if (ud.movil) {
      if (tipo === 'escopeta') { // bombeo
        const b = Math.sin(tramo(this.tMovil, 0.25, 0.75) * Math.PI);
        ud.movil.position.z = b * 0.09;
        if (pr <= 0) mI.position.z += b * 0.09;
      } else ud.movil.position.z = (1 - tramo(this.tMovil, 0, 0.2)) * 0.05 * (this.tMovil < 0.2 ? 1 : 0);
    }

    // Katana: posición de guardia y tajo en arco.
    this.estela.visible = false;
    if (tipo === 'katana') {
      const t = this.katana, l = this.katanaLado;
      if (t < 1) {
        const a = ease(tramo(t, 0.0, 0.55));
        arma.rotation.set(1.2 - a * 1.9, l * (0.4 - a * 0.9), l * (-0.9 + a * 2.0));
        arma.position.set(l * (0.1 - a * 0.35), 0.12 - a * 0.2, -a * 0.12);
        const vis = Math.sin(tramo(t, 0.05, 0.7) * Math.PI);
        this.estela.visible = vis > 0.02;
        this.estela.material.opacity = vis * 0.55;
        this.estela.rotation.set(-0.3, 0, l > 0 ? -0.6 + a * 0.4 : Math.PI - 0.6 + a * 0.4);
      } else {
        arma.rotation.set(0.9 + Math.sin(this.t * 1.6) * 0.03, 0.25, -0.35);
      }
    }
    if (tipo === 'granada') {
      const t = this.tirar;
      const atras = ease(tramo(t, 0, 0.3)), alante = ease(tramo(t, 0.3, 0.6));
      arma.position.set(0, atras * 0.08 - alante * 0.02, atras * 0.1 - alante * 0.5);
      arma.visible = t < 0.55 || t >= 1;
    } else arma.visible = true;

    this.fogonazo.visible = this.tFogonazo > 0 && !ud.cuerpo && tipo !== 'katana' && tipo !== 'granada';
  }
}

const _izq = new THREE.Vector3(), _cg = new THREE.Vector3();
