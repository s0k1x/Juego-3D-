// Armas: datos, estado de munición/recarga y modelos 3D (se construyen solo al usarse).
// Cada modelo es un grupo: cuerpo + piezas móviles (cargador, corredera o bomba) para animarlas.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { materialContorno, pintar, rampa } from './render.js';

export const ARMAS = {
  rifle: {
    nombre: 'Rifle Hikari', corto: 'Rifle', auto: true, cadencia: 0.095, dano: 20, cabeza: 1.6, cargador: 30, recarga: 1.6,
    disp: 0.01, dispMov: 0.025, perdigones: 1, alcance: 120, zoom: 50, retroceso: 0.01, caida: [28, 60, 0.7],
  },
  escopeta: {
    nombre: 'Escopeta Raijin', corto: 'Escopeta', auto: false, cadencia: 0.75, dano: 13, cabeza: 1.25, cargador: 6, recarga: 1.9,
    disp: 0.07, dispMov: 0.07, perdigones: 9, alcance: 40, zoom: 62, retroceso: 0.05, caida: [8, 22, 0.3],
  },
  franco: {
    nombre: 'Francotirador Tsuki', corto: 'Franco', auto: false, cadencia: 1.05, dano: 95, cabeza: 2.2, cargador: 5, recarga: 2.2,
    disp: 0.0012, dispCadera: 0.05, dispMov: 0.08, perdigones: 1, alcance: 220, zoom: 22, retroceso: 0.06, mira: true,
  },
  subfusil: {
    nombre: 'Subfusil Kitsune', corto: 'Subfusil', auto: true, cadencia: 0.065, dano: 14, cabeza: 1.5, cargador: 36, recarga: 1.5,
    disp: 0.018, dispMov: 0.015, perdigones: 1, alcance: 70, zoom: 56, retroceso: 0.007, caida: [12, 35, 0.55],
  },
  pistola: {
    nombre: 'Pistola Kaze', corto: 'Pistola', auto: false, cadencia: 0.15, dano: 24, cabeza: 1.8, cargador: 12, recarga: 1.1,
    disp: 0.008, dispMov: 0.02, perdigones: 1, alcance: 80, zoom: 58, retroceso: 0.02, caida: [20, 45, 0.6],
  },
  katana: { nombre: 'Katana Hana', corto: 'Katana', cuerpo: true, cadencia: 0.42, dano: 60, alcance: 2.9 },
  granada: { nombre: 'Granada Hanabi', corto: 'Granada', lanzable: true, cadencia: 0.6, dano: 100, radio: 6, mecha: 1.5 },
};

export const MAX_GRANADAS = 2;
const RECARGA_GRANADA = 14;

// Daño según la distancia: completo hasta d0, baja linealmente hasta d1 y luego se queda en `min`.
export function caidaDano(arma, dist) {
  const c = arma.caida;
  if (!c) return 1;
  if (dist <= c[0]) return 1;
  if (dist >= c[1]) return c[2];
  return 1 - (1 - c[2]) * ((dist - c[0]) / (c[1] - c[0]));
}

export class Arsenal {
  constructor(primaria = 'rifle') {
    this.ranuras = [primaria, 'pistola', 'katana', 'granada'];
    this.reiniciar();
  }

  reiniciar(primaria) {
    if (primaria) this.ranuras[0] = primaria;
    this.municion = {};
    for (const k of this.ranuras) this.municion[k] = ARMAS[k].cargador ?? 0;
    this.granadas = MAX_GRANADAS;
    this.tGranada = 0;
    this.indice = 0;
    this.anterior = 1;
    this.enfriamiento = 0;
    this.recargando = 0;
    this.cambiando = 0.35;
    this.disparos = 0; // contador (para la red y las animaciones)
  }

  get tipo() { return this.ranuras[this.indice]; }
  get arma() { return ARMAS[this.tipo]; }
  // 0..1: progreso de la recarga (para animarla).
  get progresoRecarga() { return this.recargando > 0 ? 1 - this.recargando / this.arma.recarga : 0; }

  cambiar(i) {
    if (i === this.indice || i < 0 || i > 3) return false;
    if (this.ranuras[i] === 'granada' && this.granadas <= 0) return false;
    this.anterior = this.indice;
    this.indice = i;
    this.recargando = 0;
    this.cambiando = 0.3;
    return true;
  }

  actualizar(dt, rapida = false) {
    this.enfriamiento = Math.max(0, this.enfriamiento - dt);
    this.cambiando = Math.max(0, this.cambiando - dt);
    if (this.granadas < MAX_GRANADAS) {
      this.tGranada += dt;
      if (this.tGranada >= RECARGA_GRANADA) { this.tGranada = 0; this.granadas++; }
    }
    if (this.recargando > 0) {
      this.recargando -= dt * (rapida ? 3 : 1);
      if (this.recargando <= 0) { this.recargando = 0; this.municion[this.tipo] = this.arma.cargador; }
    }
  }

  listo() { return this.enfriamiento <= 0 && this.cambiando <= 0 && this.recargando <= 0; }

  recargar() {
    const a = this.arma;
    if (!a.cargador || this.recargando > 0 || this.municion[this.tipo] >= a.cargador) return false;
    this.recargando = a.recarga;
    return true;
  }

  // Devuelve true si se ha podido disparar (gasta munición y aplica cadencia).
  disparar(cadencia = 1) {
    if (!this.listo()) return false;
    const a = this.arma;
    if (a.cargador) {
      if (this.municion[this.tipo] <= 0) { this.recargar(); return false; }
      this.municion[this.tipo]--;
    }
    if (a.lanzable) {
      if (this.granadas <= 0) return false;
      this.granadas--;
    }
    this.enfriamiento = a.cadencia * cadencia;
    this.disparos = (this.disparos + 1) % 256;
    return true;
  }
}

// ---------- Modelos ----------
// Eje -Z: hacia delante. Origen: la empuñadura (donde va la mano derecha).
const OSC = 0x2F2A55, MET = 0x6C66A6, CLARO = 0xEDE6FF, ACENTO = 0xFF8FB8, MADERA = 0xC98F6A, HOJA = 0xF4F7FF, ORO = 0xFFD27A;
const caja = (w, h, d, x, y, z, rx = 0) => new THREE.BoxGeometry(w, h, d).rotateX(rx).translate(x, y, z);
const cil = (r, h, x, y, z, seg = 8) => new THREE.CylinderGeometry(r, r, h, seg).rotateX(Math.PI / 2).translate(x, y, z);

// cuerpo: piezas fijas; cargador / movil: piezas animadas; boca: salida del disparo; mira: altura de la línea de mira;
// izq: dónde apoya la mano izquierda.
const PIEZAS = {
  rifle: () => ({
    cuerpo: [
      [caja(0.06, 0.09, 0.36, 0, 0.02, -0.1), OSC], [caja(0.055, 0.07, 0.22, 0, 0.015, -0.39), MET],
      [cil(0.016, 0.14, 0, 0.02, -0.57), MET], [cil(0.024, 0.05, 0, 0.02, -0.65), ACENTO],
      [caja(0.045, 0.11, 0.05, 0, -0.075, 0.0, 0.25), OSC], [caja(0.05, 0.08, 0.2, 0, 0.0, 0.19), CLARO],
      [caja(0.03, 0.02, 0.3, 0, 0.075, -0.15), OSC], [caja(0.03, 0.04, 0.02, 0, 0.1, 0.0), OSC],
      [caja(0.012, 0.04, 0.012, 0, 0.1, -0.44), ACENTO], [caja(0.062, 0.02, 0.18, 0, 0.035, -0.12), ACENTO],
    ],
    cargador: [[caja(0.04, 0.14, 0.065, 0, -0.1, -0.17, -0.18), MET]],
    boca: [0, 0.02, -0.68], mira: 0.105, izq: [0, -0.03, -0.38],
  }),
  escopeta: () => ({
    cuerpo: [
      [caja(0.07, 0.1, 0.3, 0, 0.02, -0.05), OSC], [cil(0.026, 0.5, 0, 0.045, -0.43, 10), MET],
      [cil(0.02, 0.38, 0, -0.005, -0.37), OSC], [cil(0.031, 0.04, 0, 0.045, -0.67, 10), ACENTO],
      [caja(0.045, 0.11, 0.05, 0, -0.08, 0.03, 0.25), OSC], [caja(0.06, 0.09, 0.24, 0, -0.01, 0.22), MADERA],
      [caja(0.02, 0.03, 0.02, 0, 0.085, -0.62), ACENTO], [caja(0.072, 0.025, 0.12, 0, 0.06, -0.04), ACENTO],
    ],
    movil: [[caja(0.075, 0.065, 0.15, 0, -0.005, -0.36), MADERA]],
    boca: [0, 0.045, -0.7], mira: 0.09, izq: [0, -0.04, -0.36],
  }),
  franco: () => ({
    cuerpo: [
      [caja(0.06, 0.09, 0.42, 0, 0.02, -0.1), OSC], [cil(0.017, 0.6, 0, 0.035, -0.6), MET],
      [caja(0.04, 0.04, 0.07, 0, 0.035, -0.92), ACENTO], [cil(0.03, 0.3, 0, 0.12, -0.12, 10), OSC],
      [cil(0.035, 0.03, 0, 0.12, -0.28, 10), ACENTO], [cil(0.035, 0.03, 0, 0.12, 0.04, 10), ACENTO],
      [caja(0.02, 0.04, 0.03, 0, 0.08, -0.2), OSC], [caja(0.02, 0.04, 0.03, 0, 0.08, -0.04), OSC],
      [caja(0.045, 0.11, 0.05, 0, -0.075, 0.03, 0.25), OSC], [caja(0.06, 0.11, 0.26, 0, -0.005, 0.24), CLARO],
      [caja(0.05, 0.02, 0.02, 0.045, 0.05, 0.05), MET],
    ],
    cargador: [[caja(0.045, 0.07, 0.08, 0, -0.06, -0.13), MET]],
    boca: [0, 0.035, -0.96], mira: 0.12, izq: [0, -0.03, -0.36],
  }),
  subfusil: () => ({
    cuerpo: [
      [caja(0.06, 0.1, 0.28, 0, 0.02, -0.06), OSC], [cil(0.017, 0.12, 0, 0.03, -0.26), MET],
      [cil(0.024, 0.04, 0, 0.03, -0.32), ACENTO], [caja(0.045, 0.11, 0.05, 0, -0.075, 0.03, 0.25), OSC],
      [caja(0.035, 0.09, 0.035, 0, -0.07, -0.16), MET], [caja(0.02, 0.05, 0.2, 0, 0.0, 0.17), CLARO],
      [caja(0.04, 0.045, 0.07, 0, 0.095, -0.04), OSC], [caja(0.032, 0.03, 0.005, 0, 0.1, -0.076), ACENTO],
      [caja(0.062, 0.02, 0.15, 0, 0.045, -0.08), ORO],
    ],
    cargador: [[caja(0.035, 0.18, 0.045, 0, -0.12, -0.08, -0.08), MET]],
    boca: [0, 0.03, -0.34], mira: 0.105, izq: [0, -0.1, -0.16],
  }),
  pistola: () => ({
    cuerpo: [
      [caja(0.04, 0.03, 0.18, 0, 0.0, -0.05), MET], [caja(0.04, 0.11, 0.055, 0, -0.06, 0.02, 0.2), OSC],
      [caja(0.042, 0.012, 0.05, 0, -0.03, 0.02, 0.2), ACENTO],
    ],
    movil: [[caja(0.046, 0.05, 0.2, 0, 0.035, -0.06), OSC], [caja(0.048, 0.012, 0.1, 0, 0.062, -0.08), ACENTO]],
    cargador: [[caja(0.032, 0.09, 0.04, 0, -0.07, 0.02, 0.2), MET]],
    boca: [0, 0.035, -0.17], mira: 0.075, izq: [-0.01, -0.07, 0.03],
  }),
  katana: () => ({
    cuerpo: [
      [caja(0.034, 0.034, 0.24, 0, 0, 0.05), OSC], [caja(0.036, 0.036, 0.03, 0, 0, 0.0), ACENTO],
      [caja(0.036, 0.036, 0.03, 0, 0, 0.1), ACENTO], [cil(0.06, 0.016, 0, 0, -0.08, 10), ORO],
      [caja(0.012, 0.045, 0.5, 0, 0.005, -0.34), HOJA], [caja(0.012, 0.042, 0.42, 0, 0.02, -0.79, 0.06), HOJA],
      [caja(0.014, 0.012, 0.9, 0, 0.022, -0.55, 0.03), ACENTO],
    ],
    boca: [0, 0, -1.0], mira: 0, izq: [0, 0, 0.15],
  }),
  granada: () => ({
    cuerpo: [
      [new THREE.SphereGeometry(0.07, 10, 8).translate(0, 0.04, -0.04), ACENTO], [caja(0.03, 0.05, 0.03, 0, 0.11, -0.04), OSC],
      [new THREE.TorusGeometry(0.022, 0.006, 4, 10).translate(0.03, 0.14, -0.04), ORO],
    ],
    boca: [0, 0.04, -0.04], mira: 0, izq: [0, 0, 0],
  }),
};

const matArma = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: rampa });

function fusionar(lista) {
  const geos = lista.map(([geo, c]) => { const g = geo.index ? geo.toNonIndexed() : geo; g.deleteAttribute('uv'); return pintar(g, c); });
  return { malla: mergeGeometries(geos), contorno: mergeGeometries(geos.map((g) => g.clone())) };
}

function malla(lista, material = matArma) {
  const g = fusionar(lista);
  const m = new THREE.Mesh(g.malla, material);
  m.castShadow = true;
  m.add(new THREE.Mesh(g.contorno, materialContorno));
  return m;
}

export function geometriaArma(tipo) {
  const p = PIEZAS[tipo]?.();
  if (!p) return null;
  return fusionar([...p.cuerpo, ...(p.movil || []), ...(p.cargador || [])]);
}

// Grupo con userData: { cargador, movil, boca: Vector3, mira, izq: Vector3 }
export function modeloArma(tipo, material) {
  const p = PIEZAS[tipo]?.();
  if (!p) return null;
  const g = new THREE.Group();
  g.add(malla(p.cuerpo, material));
  g.userData.boca = new THREE.Vector3(...p.boca);
  g.userData.izq = new THREE.Vector3(...p.izq);
  g.userData.mira = p.mira;
  if (p.cargador) { g.userData.cargador = malla(p.cargador, material); g.add(g.userData.cargador); }
  if (p.movil) { g.userData.movil = malla(p.movil, material); g.add(g.userData.movil); }
  return g;
}
